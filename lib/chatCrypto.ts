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
 */
export async function getDeviceKeyPair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
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

/** This device's public key, base64 — the only half ever uploaded to device_keys. */
export async function getDevicePublicKeyB64(): Promise<string> {
  const { publicKey } = await getDeviceKeyPair();
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
): Promise<{ ciphertext: string; wrappedKeys: { deviceId: string; wrappedKey: string }[] }> {
  const sessionKey = randomBytes(32); // AES-256
  const iv         = randomBytes(12);
  const cipher     = gcm(sessionKey, iv);
  const encoded    = new TextEncoder().encode(plaintext);
  const encrypted  = cipher.encrypt(encoded);
  const ciphertext = `${bytesToB64(iv)}:${bytesToB64(encrypted)}`;

  const { privateKey: myPriv } = await getDeviceKeyPair();

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
 * Decrypt a message this device was a wrap target for. senderPublicKeyB64
 * is the sender device's public key (looked up from device_keys) — ECDH is
 * symmetric, so deriving with (myPrivate, theirPublic) reproduces the exact
 * shared secret the sender derived with (theirPrivate, myPublic).
 */
export async function decryptFromDevice(
  ciphertext: string,
  wrappedKey: string,
  senderPublicKeyB64: string,
): Promise<string> {
  try {
    const { privateKey: myPriv } = await getDeviceKeyPair();
    const theirPub = b64ToBytes(senderPublicKeyB64);
    const shared    = x25519.getSharedSecret(myPriv, theirPub);

    const [wrapIvB64, wrappedB64] = wrappedKey.split(':');
    const wrapCipher = gcm(shared.slice(0, 32), b64ToBytes(wrapIvB64));
    const sessionKey = wrapCipher.decrypt(b64ToBytes(wrappedB64));

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
 * Wraps a member's location session key for every given recipient device.
 * Call once when a device is newly registered (or the first time a
 * member's key is created) — NOT on every location update, which would
 * defeat the point of a long-lived key. Returns one wrapped-key entry per
 * device, to be upserted into member_location_keys.
 */
export async function wrapLocationKeyForDevices(
  sessionKey: Uint8Array,
  recipients: { deviceId: string; publicKeyB64: string }[],
): Promise<{ deviceId: string; wrappedKey: string }[]> {
  const { privateKey: myPriv } = await getDeviceKeyPair();
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
export async function unwrapLocationKey(wrappedKey: string, senderPublicKeyB64: string): Promise<Uint8Array> {
  const { privateKey: myPriv } = await getDeviceKeyPair();
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

