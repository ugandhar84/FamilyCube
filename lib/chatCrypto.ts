/**
 * chatCrypto — AES-256-GCM encryption for chat + medical records, plus
 * blind-index search.
 *
 * Current architecture — one shared AES-256 key per family, derived from a
 * user-visible code (XXXX-XXXX-XXXX-XXXX), stored ONLY in local SecureStore
 * on each device. No server-held key material at all — see the "Shared
 * family key" section below (encryptWithFamilyKey/decryptWithFamilyKey) and
 * lib/familyKeyRotation.ts for rotation. getKey()/encryptMessage()/
 * decryptMessage() below are an older single-device-generated-key fallback,
 * kept only for rows that predate the shared-key cutover.
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

// ─── Shared family key (one AES-256 key per family, user-visible code) ───────
//
// Replaces the per-device X25519 envelope this file used to have for chat/
// location/records, plus the passcode-wrapped family recovery key — both
// removed (see lib/familyKeyRotation.ts for rotation). One AES-256-GCM key
// per family, derived deterministically from a user-typed code
// (XXXX-XXXX-XXXX-XXXX), stored ONLY in this device's SecureStore. No
// server ever sees the code or the derived key —
// only a non-secret rotation counter/timestamp travels to Supabase (see
// lib/familyKeyRotation.ts). A device that was never given the code has
// no key and is blocked from encrypting/decrypting for that family; a
// device that still has an OLDER code (from before a rotation) can add it
// as a fallback decrypt-only key via addPreviousFamilyKeyFromCode, so it
// can still read history from before it received the current code.

const FAMILY_KEY_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const LOCAL_FAMILY_KEY_PREFIX      = 'familycube_shared_key_v1_';
const LOCAL_FAMILY_KEY_PREV_PREFIX = 'familycube_shared_key_prev_v1_';
// The readable code itself, kept in the device's secure storage so an admin can look at it again later.
const LOCAL_FAMILY_CODE_PREFIX     = 'familycube_family_code_v1_';

const _familyKeyCache: Map<string, CryptoKey> = new Map();
const _familyPrevKeysCache: Map<string, CryptoKey[]> = new Map();

/**
 * Strips whitespace/dashes, uppercases, and validates a user-typed family
 * key code against the fixed XXXX-XXXX-XXXX-XXXX format. This is the
 * single source of truth for code formatting/validation everywhere (entry
 * screen, rotation screen, display) — throws a clear error on anything
 * that doesn't match once re-grouped, rather than silently accepting a
 * malformed code that would just derive a different, wrong key.
 */
export function normalizeFamilyKeyCode(input: string): string {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (stripped.length !== 16) {
    throw new Error('Family key code must be 16 characters (XXXX-XXXX-XXXX-XXXX).');
  }
  const grouped = stripped.match(/.{1,4}/g)!.join('-');
  if (!FAMILY_KEY_CODE_RE.test(grouped)) {
    throw new Error('Family key code must only contain letters and numbers.');
  }
  return grouped;
}

/**
 * Generates a brand-new random code in the standard format — used by the
 * key-setup screen to offer the admin a ready-made code they can accept or
 * replace with a custom one. Crypto-random, not derived from anything.
 */
export function generateFamilyKeyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i % 4 === 3 && i !== 15) out += '-';
  }
  return out;
}

/**
 * Pure function: normalized code → AES-256-GCM CryptoKey. The code itself
 * doesn't need to be 32 bytes — it's SHA-256 hashed first to get
 * deterministic, uniformly-distributed key material, so the same code
 * always derives the exact same key on every device, with no I/O.
 */
export async function deriveFamilyKeyFromCode(code: string): Promise<CryptoKey> {
  const normalized = normalizeFamilyKeyCode(code);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return crypto.subtle.importKey('raw', digest, ALGO, true, ['encrypt', 'decrypt']);
}

/**
 * This device's currently active key for `familyId`, or null if no code
 * has ever been entered here for this family — callers MUST treat null as
 * "blocked," never fall back to generating a random key the way the old
 * per-device scheme's getKey() did, since that would silently produce
 * ciphertext no other device could ever read.
 */
export async function getActiveFamilyKey(familyId: string): Promise<CryptoKey | null> {
  const cached = _familyKeyCache.get(familyId);
  if (cached) return cached;
  const stored = await SecureStore.getItemAsync(LOCAL_FAMILY_KEY_PREFIX + familyId);
  if (!stored) return null;
  const key = await crypto.subtle.importKey('raw', b642buf(stored), ALGO, true, ['encrypt', 'decrypt']);
  _familyKeyCache.set(familyId, key);
  return key;
}

/**
 * Normalizes + derives the given code and installs it as THIS device's
 * active key for `familyId`. Called on first-time code entry and again
 * after a rotation once the admin's device finishes re-encrypting history
 * (see lib/familyKeyRotation.ts) — the caller is responsible for deciding
 * when that is; this function itself has no rotation awareness.
 */
export async function setActiveFamilyKey(familyId: string, code: string): Promise<void> {
  const key = await deriveFamilyKeyFromCode(code);
  const raw = await crypto.subtle.exportKey('raw', key);
  await SecureStore.setItemAsync(LOCAL_FAMILY_KEY_PREFIX + familyId, buf2b64(raw));
  try { await SecureStore.setItemAsync(LOCAL_FAMILY_CODE_PREFIX + familyId, normalizeFamilyKeyCode(code)); } catch { /* the key itself is saved; only the viewable copy is skipped */ }
  _familyKeyCache.set(familyId, key);
}

/** The code this device was last given for `familyId`, if it was saved (codes set before this was added are not). */
export async function getStoredFamilyCode(familyId: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(LOCAL_FAMILY_CODE_PREFIX + familyId); } catch { return null; }
}

/**
 * Every OLDER code this device has ever been given for `familyId`, most-
 * recently-added first — NOT limited to a single prior key, since a device
 * joining late may be given several historical codes out of band. Used
 * only as a decrypt-only fallback (see decryptWithFamilyKey) — sending
 * always uses the active key alone, never one of these.
 */
export async function getPreviousFamilyKeys(familyId: string): Promise<CryptoKey[]> {
  const cached = _familyPrevKeysCache.get(familyId);
  if (cached) return cached;
  const stored = await SecureStore.getItemAsync(LOCAL_FAMILY_KEY_PREV_PREFIX + familyId);
  if (!stored) return [];
  const raws: string[] = JSON.parse(stored);
  const keys = await Promise.all(raws.map(r => crypto.subtle.importKey('raw', b642buf(r), ALGO, true, ['encrypt', 'decrypt'])));
  _familyPrevKeysCache.set(familyId, keys);
  return keys;
}

/**
 * Adds an older code as a decrypt-only fallback key for `familyId`, on top
 * of (not replacing) whatever active key this device already has. This is
 * what the "I also have an older code" action on the key-entry screen
 * calls — it lets a new or behind device unlock history encrypted before
 * the most recent rotation, without affecting what it uses to send new
 * messages. A code never added this way, if later lost, means content
 * encrypted under it stays permanently unreadable on this device.
 */
export async function addPreviousFamilyKeyFromCode(familyId: string, code: string): Promise<void> {
  const key = await deriveFamilyKeyFromCode(code);
  const raw = buf2b64(await crypto.subtle.exportKey('raw', key));
  const stored = await SecureStore.getItemAsync(LOCAL_FAMILY_KEY_PREV_PREFIX + familyId);
  const raws: string[] = stored ? JSON.parse(stored) : [];
  if (raws.includes(raw)) return; // already have this one
  raws.unshift(raw); // most-recently-added first
  await SecureStore.setItemAsync(LOCAL_FAMILY_KEY_PREV_PREFIX + familyId, JSON.stringify(raws));
  _familyPrevKeysCache.delete(familyId); // force re-read next getPreviousFamilyKeys call
}

/**
 * Moves the CURRENT active key for `familyId` into the previous-keys list,
 * then installs `newCode` as the new active key — called by
 * lib/familyKeyRotation.ts once an admin-driven rotation's re-encryption
 * pass finishes, so this device (and only this device, mid-rotation) can
 * still decrypt anything it missed re-uploading, while every new
 * encrypt/decrypt from this point on uses the new key.
 */
export async function rotateActiveFamilyKey(familyId: string, newCode: string): Promise<void> {
  const oldKey = await getActiveFamilyKey(familyId);
  if (oldKey) {
    const oldRaw = buf2b64(await crypto.subtle.exportKey('raw', oldKey));
    const stored = await SecureStore.getItemAsync(LOCAL_FAMILY_KEY_PREV_PREFIX + familyId);
    const raws: string[] = stored ? JSON.parse(stored) : [];
    if (!raws.includes(oldRaw)) raws.unshift(oldRaw);
    await SecureStore.setItemAsync(LOCAL_FAMILY_KEY_PREV_PREFIX + familyId, JSON.stringify(raws));
    _familyPrevKeysCache.delete(familyId);
  }
  await setActiveFamilyKey(familyId, newCode);
}

/**
 * Encrypts plaintext with this family's active shared key. Throws (does
 * NOT silently return the plaintext or a placeholder) when no key is set
 * for this family on this device — this is the enforcement point for
 * "blocked until a code is entered"; callers decide how to surface that
 * (a lock screen, same shape as the existing Just Us PIN gate).
 */
export async function encryptWithFamilyKey(familyId: string, plaintext: string): Promise<string> {
  const key = await getActiveFamilyKey(familyId);
  if (!key) throw new Error('No family key set on this device — enter the family security code first.');
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${buf2b64(iv.buffer as ArrayBuffer)}:${buf2b64(enc)}`;
}

/**
 * Decrypts ciphertext with this family's active shared key, falling back
 * through every previously-added older code (most-recently-added first)
 * before giving up — so a device that has been given one or more historical
 * codes can still read content encrypted under any of them. Throws only
 * when no active key exists at all (nothing to try); returns the usual
 * "[🔒 ...]" sentinel if every available key fails to decrypt this
 * particular ciphertext.
 */
export async function decryptWithFamilyKey(familyId: string, ciphertext: string): Promise<string> {
  const activeKey = await getActiveFamilyKey(familyId);
  if (!activeKey) throw new Error('No family key set on this device — enter the family security code first.');
  if (ciphertext.length < 17 || ciphertext[16] !== ':') return ciphertext;
  const ivB64     = ciphertext.slice(0, 16);
  const cipherB64 = ciphertext.slice(17);
  const iv        = b642buf(ivB64);
  const cipherBuf = b642buf(cipherB64);
  const candidates = [activeKey, ...await getPreviousFamilyKeys(familyId)];
  for (const key of candidates) {
    try {
      const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
      return new TextDecoder().decode(dec);
    } catch { /* try next candidate key */ }
  }
  return '[🔒 encrypted — wrong key or corrupted]';
}

// ─── Device identity (kept for non-encryption uses) ───────────────────────────
//
// This device's stable identifier is still used for kiosk device_status rows
// and PIN-entry modals, independent of the encryption scheme above.

const LOCAL_DEVICE_ID = 'familycube_device_id_v1';

/** Stable per-install device identifier. Generated once, cached in Secure Store. */
export async function getDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(LOCAL_DEVICE_ID);
  if (stored) return stored;
  const id = crypto.randomUUID();
  await SecureStore.setItemAsync(LOCAL_DEVICE_ID, id);
  return id;
}

