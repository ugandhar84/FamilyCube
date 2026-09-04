/**
 * chatCrypto — AES-256-GCM E2E encryption + blind-index search.
 *
 * Key architecture (Option 1 — passcode-wrapped):
 *  - AES-256-GCM data key → encrypts message text.
 *  - AES-256-KW wrapping key → derived from family passcode via PBKDF2 (310k iters).
 *  - Wrapped key blob stored in Supabase `families.encrypted_key`.
 *  - DB admin sees only ciphertext + opaque key blob. Raw key never leaves the device.
 *  - New device / reinstall: passcode → fetch blob → unwrapKeyWithPasscode() → ready.
 *
 * Blind-index search:
 *  - A separate HMAC-SHA256 search key (also stored in SecureStore) hashes normalised
 *    words before they reach the server.  Server stores the hash array and does an
 *    array-overlap (@>) lookup — never sees plaintext.
 *  - Same deterministic key → same hash → exact word match across all devices once
 *    the search key is synced (wrapped alongside the data key).
 */
import * as SecureStore from 'expo-secure-store';

const LOCAL_AES_KEY    = 'familycube_chat_aes_v1';
const LOCAL_SEARCH_KEY = 'familycube_chat_search_v1';
const ALGO             = { name: 'AES-GCM', length: 256 } as const;

let _aesKey:    CryptoKey | null = null;
let _searchKey: CryptoKey | null = null;

// ─── Utilities ────────────────────────────────────────────────────────────────

function buf2b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b642buf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─── AES data key ─────────────────────────────────────────────────────────────

export async function getKey(): Promise<CryptoKey> {
  if (_aesKey) return _aesKey;
  const stored = await SecureStore.getItemAsync(LOCAL_AES_KEY);
  if (stored) {
    _aesKey = await crypto.subtle.importKey('raw', b642buf(stored), ALGO, true, ['encrypt', 'decrypt']);
    return _aesKey;
  }
  return generateAndStoreAesKey();
}

async function generateAndStoreAesKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  await SecureStore.setItemAsync(LOCAL_AES_KEY, buf2b64(raw));
  _aesKey = key;
  return key;
}

// ─── HMAC search key ──────────────────────────────────────────────────────────

export async function getSearchKey(): Promise<CryptoKey> {
  if (_searchKey) return _searchKey;
  const stored = await SecureStore.getItemAsync(LOCAL_SEARCH_KEY);
  if (stored) {
    _searchKey = await crypto.subtle.importKey(
      'raw', b642buf(stored), { name: 'HMAC', hash: 'SHA-256' }, true, ['sign'],
    );
    return _searchKey;
  }
  return generateAndStoreSearchKey();
}

async function generateAndStoreSearchKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign']);
  const raw = await crypto.subtle.exportKey('raw', key);
  await SecureStore.setItemAsync(LOCAL_SEARCH_KEY, buf2b64(raw));
  _searchKey = key;
  return key;
}

// Normalise a word before hashing: lowercase, strip punctuation
function normalise(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function hmacWord(word: string, key: CryptoKey): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(word));
  // truncate to 16 bytes (128-bit) → shorter DB values, still collision-resistant at this scale
  return buf2b64(sig.slice(0, 16));
}

/**
 * Build the blind-index array for a plaintext message.
 * Each significant word → HMAC-SHA256(word, searchKey).
 * Called by the sender before inserting into Supabase.
 */
export async function buildBlindIndex(plaintext: string): Promise<string[]> {
  try {
    const key   = await getSearchKey();
    const words = plaintext.split(/\s+/).map(normalise).filter(w => w.length > 1);
    const unique = [...new Set(words)];
    return Promise.all(unique.map(w => hmacWord(w, key)));
  } catch {
    return [];
  }
}

/**
 * Hash a single search query word for server-side lookup.
 * `WHERE blind_index @> ARRAY[hash]`
 */
export async function hashQuery(query: string): Promise<string[]> {
  try {
    const key   = await getSearchKey();
    const words = query.trim().split(/\s+/).map(normalise).filter(w => w.length > 1);
    const unique = [...new Set(words)];
    return Promise.all(unique.map(w => hmacWord(w, key)));
  } catch {
    return [];
  }
}

// ─── Message encrypt / decrypt ────────────────────────────────────────────────

/** Encrypt plaintext → "iv_b64:cipher_b64" */
export async function encryptMessage(plaintext: string): Promise<string> {
  try {
    const key = await getKey();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    return `${buf2b64(iv.buffer as ArrayBuffer)}:${buf2b64(enc)}`;
  } catch {
    return plaintext; // graceful degradation in dev/simulator
  }
}

/** Decrypt "iv_b64:cipher_b64" → plaintext */
export async function decryptMessage(payload: string): Promise<string> {
  // AES-GCM IV is always 12 bytes = exactly 16 base64 chars.
  // The separator ':' must be at position 16, not just anywhere in the string.
  if (payload.length < 17 || payload[16] !== ':') return payload;
  try {
    const ivB64     = payload.slice(0, 16);
    const cipherB64 = payload.slice(17);
    const key = await getKey();
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b642buf(ivB64) }, key, b642buf(cipherB64));
    return new TextDecoder().decode(dec);
  } catch {
    return '[🔒 encrypted — wrong key or corrupted]';
  }
}

// ─── Passcode-wrapped key (Option 1 — cross-device recovery) ─────────────────

async function deriveWrappingKey(passcode: string, saltHex: string): Promise<CryptoKey> {
  const saltBuf = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const base    = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 310_000, hash: 'SHA-256' },
    base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  );
}

/**
 * Wrap both keys (AES data key + HMAC search key) with the passcode.
 * Returns a JSON blob suitable for storing in Supabase `families.encrypted_keys`.
 * DB admin cannot unwrap without the passcode.
 */
export async function wrapKeysWithPasscode(passcode: string, familySalt: string): Promise<string> {
  const wk       = await deriveWrappingKey(passcode, familySalt);
  const aesKey   = await getKey();
  const srchKey  = await getSearchKey();
  const wrappedA = await crypto.subtle.wrapKey('raw', aesKey,  wk, 'AES-KW');
  const wrappedS = await crypto.subtle.wrapKey('raw', srchKey, wk, 'AES-KW');
  return JSON.stringify({ a: buf2b64(wrappedA), s: buf2b64(wrappedS) });
}

/**
 * Unwrap both keys from the blob received from Supabase.
 * Call this on new device / after reinstall once the user enters their passcode.
 */
export async function unwrapKeysWithPasscode(wrappedJson: string, passcode: string, familySalt: string): Promise<void> {
  const { a, s }  = JSON.parse(wrappedJson) as { a: string; s: string };
  const wk        = await deriveWrappingKey(passcode, familySalt);

  const aesKey = await crypto.subtle.unwrapKey('raw', b642buf(a), wk, 'AES-KW', ALGO, true, ['encrypt', 'decrypt']);
  const rawA   = await crypto.subtle.exportKey('raw', aesKey);
  await SecureStore.setItemAsync(LOCAL_AES_KEY, buf2b64(rawA));
  _aesKey = aesKey;

  const srchKey = await crypto.subtle.unwrapKey('raw', b642buf(s), wk, 'AES-KW', { name: 'HMAC', hash: 'SHA-256' }, true, ['sign']);
  const rawS    = await crypto.subtle.exportKey('raw', srchKey);
  await SecureStore.setItemAsync(LOCAL_SEARCH_KEY, buf2b64(rawS));
  _searchKey = srchKey;
}

// Legacy single-key exports kept for backwards compat
export const wrapKeyWithPasscode   = (p: string, s: string) => wrapKeysWithPasscode(p, s);
export const unwrapKeyWithPasscode = (b: string, p: string, s: string) => unwrapKeysWithPasscode(b, p, s);
export async function exportKeyQR(): Promise<string> {
  const key = await getKey(); return buf2b64(await crypto.subtle.exportKey('raw', key));
}
export async function importKeyQR(b64: string): Promise<void> {
  const key = await crypto.subtle.importKey('raw', b642buf(b64), ALGO, true, ['encrypt', 'decrypt']);
  await SecureStore.setItemAsync(LOCAL_AES_KEY, b64); _aesKey = key;
}

// ─── Per-device E2E (multi-recipient envelope) ────────────────────────────────
//
// Each device generates its own X25519 keypair. The private key never
// leaves Secure Store — it is never uploaded, logged, or included in any
// server-visible payload. Only the public key goes to `device_keys`.
//
// A message body is encrypted once with a random AES-256-GCM session key
// (reusing the same primitive as encryptMessage/decryptMessage above). That
// session key is then wrapped once per recipient device via ECDH + AES-KW
// — one small `chat_message_keys` row per device, not one full copy of the
// message. This is the standard "sealed envelope" pattern (Signal/WhatsApp/
// iMessage multi-device delivery shape).
//
// WebCrypto's crypto.subtle does not reliably support ECDH across Hermes/RN
// runtimes the way AES-GCM already does above, so X25519 here uses
// @noble/curves (pure JS, audited, no native module) instead.

import { x25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';

const LOCAL_DEVICE_ID       = 'familycube_device_id_v1';
const LOCAL_DEVICE_PRIVKEY  = 'familycube_device_privkey_v1';
const LOCAL_DEVICE_PUBKEY   = 'familycube_device_pubkey_v1';
// Per-family recovered key pair — see installRecoveredKeyPair's own doc for
// why this is family-scoped while the device's normal identity above is
// deliberately NOT: a member belonging to multiple families (a grandparent
// in two households, sharing one tablet) recovering Family B's passcode
// must not disturb Family A's still-working identity on the same device.
const RECOVERED_PRIVKEY_PREFIX = 'familycube_recovered_privkey_v1_';
const RECOVERED_PUBKEY_PREFIX  = 'familycube_recovered_pubkey_v1_';

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Stable per-install device identifier. Generated once, cached in Secure Store. */
export async function getDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(LOCAL_DEVICE_ID);
  if (stored) return stored;
  const id = crypto.randomUUID();
  await SecureStore.setItemAsync(LOCAL_DEVICE_ID, id);
  return id;
}

/**
 * This device's X25519 keypair. Generates and persists one on first call;
 * every subsequent call on this device returns the same pair. The private
 * key half never leaves this function's callers — it's read from Secure
 * Store and used locally, never serialized into any network payload.
 *
 * When `familyId` is given AND this device has recovered THAT family's
 * passcode (installRecoveredKeyPair), returns the family-scoped recovered
 * pair instead of the device's own real identity — recovering Family B's
 * passcode must not disturb Family A's still-working identity on a device
 * shared across multiple families (a grandparent's tablet, say). Every
 * caller in this file that operates on a specific family's data passes its
 * familyId through for this reason; callers with no family context (e.g.
 * getDeviceId's own registration flow) omit it and always get the device's
 * real identity.
 */
export async function getDeviceKeyPair(familyId?: string): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
  if (familyId) {
    const [recoveredPriv, recoveredPub] = await Promise.all([
      SecureStore.getItemAsync(RECOVERED_PRIVKEY_PREFIX + familyId),
      SecureStore.getItemAsync(RECOVERED_PUBKEY_PREFIX + familyId),
    ]);
    if (recoveredPriv && recoveredPub) {
      return { privateKey: b64ToBytes(recoveredPriv), publicKey: b64ToBytes(recoveredPub) };
    }
  }
  const [storedPriv, storedPub] = await Promise.all([
    SecureStore.getItemAsync(LOCAL_DEVICE_PRIVKEY),
    SecureStore.getItemAsync(LOCAL_DEVICE_PUBKEY),
  ]);
  if (storedPriv && storedPub) {
    return { privateKey: b64ToBytes(storedPriv), publicKey: b64ToBytes(storedPub) };
  }
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey  = x25519.getPublicKey(privateKey);
  await Promise.all([
    SecureStore.setItemAsync(LOCAL_DEVICE_PRIVKEY, bytesToB64(privateKey)),
    SecureStore.setItemAsync(LOCAL_DEVICE_PUBKEY, bytesToB64(publicKey)),
  ]);
  return { privateKey, publicKey };
}

/** This device's public key for `familyId` (its recovered key if that
 * family was recovered on this device, otherwise its real identity), base64
 * — the half that gets uploaded to device_keys as this family's row. */
export async function getDevicePublicKeyB64(familyId?: string): Promise<string> {
  const { publicKey } = await getDeviceKeyPair(familyId);
  return bytesToB64(publicKey);
}

/**
 * Encrypt plaintext once with a fresh random session key, and wrap that
 * session key for every given recipient device's public key.
 * Returns the body ciphertext plus one wrapped-key entry per recipient —
 * exactly the multi-encryption envelope described in the design doc.
 */
export async function encryptForDevices(
  plaintext: string,
  recipients: { deviceId: string; publicKeyB64: string }[],
  familyId?: string,
): Promise<{ ciphertext: string; wrappedKeys: { deviceId: string; wrappedKey: string }[] }> {
  const sessionKey = randomBytes(32); // AES-256
  const iv         = randomBytes(12);
  const cipher     = gcm(sessionKey, iv);
  const encoded    = new TextEncoder().encode(plaintext);
  const encrypted  = cipher.encrypt(encoded);
  const ciphertext = `${bytesToB64(iv)}:${bytesToB64(encrypted)}`;

  const { privateKey: myPriv } = await getDeviceKeyPair(familyId);

  const wrappedKeys = recipients.map(r => {
    const theirPub  = b64ToBytes(r.publicKeyB64);
    const shared     = x25519.getSharedSecret(myPriv, theirPub);
    const wrapIv     = randomBytes(12);
    const wrapCipher = gcm(shared.slice(0, 32), wrapIv);
    const wrapped    = wrapCipher.encrypt(sessionKey);
    return { deviceId: r.deviceId, wrappedKey: `${bytesToB64(wrapIv)}:${bytesToB64(wrapped)}` };
  });

  return { ciphertext, wrappedKeys };
}

/**
 * Unwraps just the session key from one recipient's wrapped-key entry —
 * the first half of decryptFromDevice, without also decrypting the message
 * body. Needed to RE-wrap an existing message's session key for a NEW
 * recipient (the recovery key backfill — see backfillChatRecoveryWraps in
 * deviceRegistry.ts) without touching the message ciphertext at all, since
 * the session key is unchanged; only a new wrapped copy of it is added.
 * Throws on a wrong/mismatched key — callers should catch per-message
 * rather than let one bad row abort a whole backfill batch.
 */
export async function unwrapSessionKeyFromDevice(
  wrappedKey: string,
  senderPublicKeyB64: string,
  familyId?: string,
): Promise<Uint8Array> {
  const { privateKey: myPriv } = await getDeviceKeyPair(familyId);
  const theirPub = b64ToBytes(senderPublicKeyB64);
  const shared    = x25519.getSharedSecret(myPriv, theirPub);
  const [wrapIvB64, wrappedB64] = wrappedKey.split(':');
  const wrapCipher = gcm(shared.slice(0, 32), b64ToBytes(wrapIvB64));
  return wrapCipher.decrypt(b64ToBytes(wrappedB64));
}

/**
 * Decrypt a message this device was a wrap target for. senderPublicKeyB64
 * is the sender device's public key (looked up from device_keys) — ECDH is
 * symmetric, so deriving with (myPrivate, theirPublic) reproduces the exact
 * shared secret the sender derived with (theirPrivate, myPublic).
 */
export async function decryptFromDevice(
  ciphertext: string,
  wrappedKey: string,
  senderPublicKeyB64: string,
  familyId?: string,
): Promise<string> {
  try {
    const sessionKey = await unwrapSessionKeyFromDevice(wrappedKey, senderPublicKeyB64, familyId);
    const [ivB64, encB64] = ciphertext.split(':');
    const cipher  = gcm(sessionKey, b64ToBytes(ivB64));
    const decoded = cipher.decrypt(b64ToBytes(encB64));
    return new TextDecoder().decode(decoded);
  } catch {
    return '[🔒 encrypted — wrong key or corrupted]';
  }
}

// ─── Location session key (per-device envelope, long-lived) ──────────────────
//
// Unlike chat (fresh session key per message), a member's location updates
// far more often than chat messages arrive (~every 0.1 mile moved) and is
// always overwriting the same "current position" row, not delivering
// discrete messages — so this uses ONE long-lived AES-256 session key per
// member instead of a new one per update. The key is wrapped once per
// family device (member_location_keys) and only re-wrapped when the
// device set changes; every location write after that just re-encrypts
// the new address text under the same still-valid session key. lat/lng
// stay plaintext — unchanged, still needed for live map rendering without
// decrypting every row.

const LOCAL_LOCATION_KEY_PREFIX = 'familycube_location_sessionkey_';

/**
 * This device's cached copy of ITS OWN member's location session key —
 * only relevant when this device belongs to the member whose location is
 * being written. Generates one on first call for that member and persists
 * it locally; the caller is responsible for wrapping it for every family
 * device via wrapLocationKeyForDevices once (see that function's own doc).
 */
export async function getOrCreateLocationSessionKey(memberId: string): Promise<Uint8Array> {
  const storageKey = LOCAL_LOCATION_KEY_PREFIX + memberId;
  const stored = await SecureStore.getItemAsync(storageKey);
  if (stored) return b64ToBytes(stored);
  const key = randomBytes(32);
  await SecureStore.setItemAsync(storageKey, bytesToB64(key));
  return key;
}

/**
 * Reads a member's location session key WITHOUT generating one if it
 * doesn't already exist on this device — unlike getOrCreateLocationSessionKey
 * above. Needed by the recovery backfill (deviceRegistry.ts), which needs
 * to ask "does this device actually have a key for this member?" for every
 * family member without side effects — calling the generating version for
 * a member this device never tracked would wrongly manufacture a brand new
 * key (and a real device_keys wrap for it) for someone whose location this
 * device has never actually written.
 */
export async function peekLocationSessionKey(memberId: string): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(LOCAL_LOCATION_KEY_PREFIX + memberId);
  return stored ? b64ToBytes(stored) : null;
}

/**
 * Wraps a member's location session key for every given recipient device.
 * Call once when a device is newly registered (or the first time a
 * member's key is created) — NOT on every location update, which would
 * defeat the point of a long-lived key. Returns one wrapped-key entry per
 * device, to be upserted into member_location_keys.
 */
export async function wrapLocationKeyForDevices(
  sessionKey: Uint8Array,
  recipients: { deviceId: string; publicKeyB64: string }[],
  familyId?: string,
): Promise<{ deviceId: string; wrappedKey: string }[]> {
  const { privateKey: myPriv } = await getDeviceKeyPair(familyId);
  return recipients.map(r => {
    const theirPub  = b64ToBytes(r.publicKeyB64);
    const shared     = x25519.getSharedSecret(myPriv, theirPub);
    const wrapIv     = randomBytes(12);
    const wrapCipher = gcm(shared.slice(0, 32), wrapIv);
    const wrapped    = wrapCipher.encrypt(sessionKey);
    return { deviceId: r.deviceId, wrappedKey: `${bytesToB64(wrapIv)}:${bytesToB64(wrapped)}` };
  });
}

/** Unwraps a location session key using this device's own private key + the sender device's public key. */
export async function unwrapLocationKey(wrappedKey: string, senderPublicKeyB64: string, familyId?: string): Promise<Uint8Array> {
  const { privateKey: myPriv } = await getDeviceKeyPair(familyId);
  const theirPub = b64ToBytes(senderPublicKeyB64);
  const shared    = x25519.getSharedSecret(myPriv, theirPub);
  const [wrapIvB64, wrappedB64] = wrappedKey.split(':');
  const wrapCipher = gcm(shared.slice(0, 32), b64ToBytes(wrapIvB64));
  return wrapCipher.decrypt(b64ToBytes(wrappedB64));
}

/** Encrypt plaintext with an already-established AES-256 session key (not a fresh one). */
export function encryptWithSessionKey(plaintext: string, sessionKey: Uint8Array): string {
  const iv        = randomBytes(12);
  const cipher    = gcm(sessionKey, iv);
  const encrypted = cipher.encrypt(new TextEncoder().encode(plaintext));
  return `${bytesToB64(iv)}:${bytesToB64(encrypted)}`;
}

/** Decrypt ciphertext with an already-unwrapped AES-256 session key. */
export function decryptWithSessionKey(ciphertext: string, sessionKey: Uint8Array): string {
  try {
    const [ivB64, encB64] = ciphertext.split(':');
    const cipher  = gcm(sessionKey, b64ToBytes(ivB64));
    const decoded = cipher.decrypt(b64ToBytes(encB64));
    return new TextDecoder().decode(decoded);
  } catch {
    return '[🔒 encrypted — wrong key or corrupted]';
  }
}

// ─── Records session key (per-device envelope, long-lived) ───────────────────
//
// Same shape as the location session key above, family-scoped instead of
// member-scoped — a medical record is visible to the whole family, not one
// member's own devices. One long-lived AES-256 key per family, wrapped once
// per family device into family_record_keys, re-encrypting each record's AI
// analysis under that same still-valid key on every write.

const LOCAL_RECORDS_KEY_PREFIX = 'familycube_records_sessionkey_';

/**
 * This device's cached copy of its family's records session key. Generates
 * one on first call and persists it locally; the caller is responsible for
 * wrapping it for every family device via wrapRecordsKeyForDevices once
 * (see that function's own doc).
 */
export async function getOrCreateRecordsSessionKey(familyId: string): Promise<Uint8Array> {
  const storageKey = LOCAL_RECORDS_KEY_PREFIX + familyId;
  const stored = await SecureStore.getItemAsync(storageKey);
  if (stored) return b64ToBytes(stored);
  const key = randomBytes(32);
  await SecureStore.setItemAsync(storageKey, bytesToB64(key));
  return key;
}

/**
 * Wraps a family's records session key for every given recipient device.
 * Call once when a device is newly registered (or the first time a
 * family's key is created) — NOT on every record write, which would defeat
 * the point of a long-lived key. Returns one wrapped-key entry per device,
 * to be upserted into family_record_keys.
 */
export async function wrapRecordsKeyForDevices(
  sessionKey: Uint8Array,
  recipients: { deviceId: string; publicKeyB64: string }[],
  familyId?: string,
): Promise<{ deviceId: string; wrappedKey: string }[]> {
  const { privateKey: myPriv } = await getDeviceKeyPair(familyId);
  return recipients.map(r => {
    const theirPub  = b64ToBytes(r.publicKeyB64);
    const shared     = x25519.getSharedSecret(myPriv, theirPub);
    const wrapIv     = randomBytes(12);
    const wrapCipher = gcm(shared.slice(0, 32), wrapIv);
    const wrapped    = wrapCipher.encrypt(sessionKey);
    return { deviceId: r.deviceId, wrappedKey: `${bytesToB64(wrapIv)}:${bytesToB64(wrapped)}` };
  });
}

/** Unwraps a records session key using this device's own private key + the sender device's public key. */
export async function unwrapRecordsKey(wrappedKey: string, senderPublicKeyB64: string, familyId?: string): Promise<Uint8Array> {
  const { privateKey: myPriv } = await getDeviceKeyPair(familyId);
  const theirPub = b64ToBytes(senderPublicKeyB64);
  const shared    = x25519.getSharedSecret(myPriv, theirPub);
  const [wrapIvB64, wrappedB64] = wrappedKey.split(':');
  const wrapCipher = gcm(shared.slice(0, 32), b64ToBytes(wrapIvB64));
  return wrapCipher.decrypt(b64ToBytes(wrappedB64));
}

// ─── Family recovery key ──────────────────────────────────────────────────────
//
// Every per-device envelope above (chat, location, records) has NO recovery
// by design — losing a device loses that device's ability to decrypt
// anything wrapped for it. This section adds a family-wide recovery path
// WITHOUT touching any of the encrypt/decrypt call sites above: a single
// synthetic "recovery device" is registered in device_keys (device_id =
// RECOVERY_DEVICE_ID) whose public key every wrap call already includes
// automatically (encryptForDevices/wrapLocationKeyForDevices/
// wrapRecordsKeyForDevices all just iterate whatever getFamilyDeviceDirectory
// returns). Only this recovery key's PRIVATE half is special: it's
// encrypted with a family passcode (PBKDF2 → AES-GCM) and stored server-side
// in families.encrypted_recovery_privkey/recovery_key_salt, so a brand new
// device can recover it by entering the passcode, then use it locally
// exactly like any other device's key pair to unwrap everything the
// recovery key was ever wrapped for.
//
// This is a DIFFERENT, PBKDF2-derived-AES-GCM-key scheme from the legacy
// deriveWrappingKey()/wrapKeysWithPasscode() above (which wraps WebCrypto
// CryptoKey objects via AES-KW, for the old single-shared-AES-key design) —
// this wraps raw X25519 private key bytes via AES-GCM, matching the
// @noble/ciphers primitives the rest of the per-device section uses.
export const RECOVERY_DEVICE_ID = 'recovery';

// OWASP's current PBKDF2-SHA256 guidance moved to 600,000 iterations after
// this was first built at 310,000 — raising the cost of brute-forcing a
// leaked encrypted_recovery_privkey blob against a weak/reused passcode
// (Argon2id would be the stronger choice generally, but adding it here
// means a new native dependency — react-native-quick-crypto doesn't include
// it — and a full rebuild; bumping the existing pure-JS/WebCrypto PBKDF2
// count gets a real improvement with no native-module risk).
//
// The count travels WITH the salt (as "<iterations>.<saltHex>") rather than
// living only in this constant, because bumping the constant alone would
// silently break every family that already has a families.
// encrypted_recovery_privkey blob wrapped at the OLD count — recovering
// would derive a different key and fail decryption with no indication why.
// Encoding it in the stored salt string means old blobs keep re-deriving at
// whatever count they were actually wrapped with, while every new
// setup/reset moves to the current, stronger count — no DB migration
// needed since recovery_key_salt has always been an opaque string to every
// caller.
const RECOVERY_KDF_ITERATIONS = 600_000;
const LEGACY_RECOVERY_KDF_ITERATIONS = 310_000; // pre-versioning blobs — bare hex, no "N." prefix

function parseSaltHex(salt: string): { iterations: number; saltHex: string } {
  const dot = salt.indexOf('.');
  if (dot === -1) return { iterations: LEGACY_RECOVERY_KDF_ITERATIONS, saltHex: salt };
  return { iterations: parseInt(salt.slice(0, dot), 10), saltHex: salt.slice(dot + 1) };
}

async function deriveRecoveryWrappingKey(passcode: string, salt: string): Promise<Uint8Array> {
  const { iterations, saltHex } = parseSaltHex(salt);
  const saltBuf = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations, hash: 'SHA-256' },
    base, 256,
  );
  return new Uint8Array(bits);
}

// Versioned — every NEW salt (setup/reset/change) is written with the
// current iteration count prefixed on, so future bumps follow the same
// backward-compatible pattern parseSaltHex already established.
function randomSaltHex(): string {
  const bytes = randomBytes(16);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${RECOVERY_KDF_ITERATIONS}.${hex}`;
}

/**
 * Generates a brand-new family recovery X25519 key pair, encrypts its
 * private half with the given passcode, and returns everything the caller
 * needs to persist: the public key (to upsert into device_keys as the
 * RECOVERY_DEVICE_ID row) and the encrypted-private-key blob + salt (to
 * store in families.encrypted_recovery_privkey/recovery_key_salt). Does
 * NOT touch Secure Store or any network call itself — pure key generation +
 * local wrapping, so the caller controls exactly when/how it's persisted.
 */
export async function createFamilyRecoveryKey(passcode: string): Promise<{
  publicKeyB64: string; encryptedPrivateKey: string; saltHex: string;
}> {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey  = x25519.getPublicKey(privateKey);
  const saltHex    = randomSaltHex();
  const wrapKey    = await deriveRecoveryWrappingKey(passcode, saltHex);
  const iv         = randomBytes(12);
  const cipher     = gcm(wrapKey, iv);
  const encrypted  = cipher.encrypt(privateKey);
  return {
    publicKeyB64: bytesToB64(publicKey),
    encryptedPrivateKey: `${bytesToB64(iv)}:${bytesToB64(encrypted)}`,
    saltHex,
  };
}

/**
 * Re-encrypts an ALREADY-KNOWN recovery private key under a NEW passcode —
 * used when a parent changes the family passcode. Deliberately does NOT
 * generate a new key pair: the recovery key pair itself, and therefore
 * every existing wrapped copy of every session key (chat/location/
 * records), stays exactly as it was. Only the passcode-derived wrapping
 * around the private key changes, so this is cheap — no re-encryption of
 * any actual message/location/record data is needed or performed.
 */
export async function rewrapRecoveryPrivateKey(privateKey: Uint8Array, newPasscode: string): Promise<{
  encryptedPrivateKey: string; saltHex: string;
}> {
  const saltHex   = randomSaltHex();
  const wrapKey   = await deriveRecoveryWrappingKey(newPasscode, saltHex);
  const iv        = randomBytes(12);
  const cipher    = gcm(wrapKey, iv);
  const encrypted = cipher.encrypt(privateKey);
  return { encryptedPrivateKey: `${bytesToB64(iv)}:${bytesToB64(encrypted)}`, saltHex };
}

/**
 * Recovers the family recovery key pair from the passcode + stored
 * encrypted blob. Pure computation only — does NOT persist anything itself;
 * the caller passes the result to installRecoveredKeyPair (which stores it
 * in a FAMILY-SCOPED slot, not the device's real identity — see that
 * function's own doc). Throws (AES-GCM auth tag failure) on a wrong
 * passcode — callers should catch and show a clear "wrong passcode"
 * message, never treat a throw here as anything else.
 */
export async function recoverFamilyKeyWithPasscode(
  passcode: string, encryptedPrivateKey: string, saltHex: string,
): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
  const wrapKey = await deriveRecoveryWrappingKey(passcode, saltHex);
  const [ivB64, encB64] = encryptedPrivateKey.split(':');
  const cipher = gcm(wrapKey, b64ToBytes(ivB64));
  const privateKey = cipher.decrypt(b64ToBytes(encB64)); // throws on wrong passcode
  const publicKey  = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Installs a recovered key pair into a FAMILY-SCOPED Secure Store slot
 * (RECOVERED_PRIVKEY_PREFIX/RECOVERED_PUBKEY_PREFIX + familyId), NOT the
 * device's own real identity slot (LOCAL_DEVICE_PRIVKEY/LOCAL_DEVICE_PUBKEY).
 * getDeviceKeyPair(familyId) then returns this recovered pair whenever
 * called for THIS family, while every other family's data on this same
 * device keeps using the device's real, untouched identity.
 *
 * This used to overwrite the device's one global identity outright — fine
 * for a single-family device, but a real bug for a member belonging to
 * multiple families on one shared device (a grandparent's tablet, say):
 * recovering Family B's passcode would silently replace the identity
 * Family A was relying on, breaking Family A's decryption on that device
 * from that point on. Family-scoping fixes this without changing anything
 * about the single-family case — decryptFromDevice/unwrapLocationKey/
 * unwrapRecordsKey/encryptForDevices/etc. all already thread familyId
 * through to getDeviceKeyPair for exactly this reason.
 *
 * One consequence worth knowing: this device's OWN real device_keys row
 * (registered under its real, unique device id from getDeviceId(), which
 * is untouched by this function) is unaffected by recovery now — it keeps
 * using the device's real identity for this family too, going forward,
 * rather than adopting the recovery key pair as its own permanent
 * identity. A future write for this family wraps for BOTH this device's
 * real public key (registered normally) and the recovery key (registered
 * separately in device_keys under RECOVERY_DEVICE_ID) — this device simply
 * also happens to know how to decrypt things wrapped for the recovery key,
 * for this family specifically.
 */
export async function installRecoveredKeyPair(privateKey: Uint8Array, publicKey: Uint8Array, familyId: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(RECOVERED_PRIVKEY_PREFIX + familyId, bytesToB64(privateKey)),
    SecureStore.setItemAsync(RECOVERED_PUBKEY_PREFIX + familyId, bytesToB64(publicKey)),
  ]);
}

