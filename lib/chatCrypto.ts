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
