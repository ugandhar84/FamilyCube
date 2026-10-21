/**
 * fileCrypto — encrypts documents and visit audio with the family key before they are uploaded, and decrypts them
 * after download. Same AES-GCM family key the chat uses (lib/chatCrypto.ts), so only devices that hold the family
 * security code can read the stored bytes.
 *
 * Stored format: "FCE1" (4 bytes) + 12-byte IV + AES-GCM ciphertext. A file without that header is a file uploaded before
 * encryption existed; it is returned unchanged so old attachments keep opening.
 */
import { getActiveFamilyKey, getPreviousFamilyKeys } from './chatCrypto';

const MAGIC = [0x46, 0x43, 0x45, 0x31]; // "FCE1"

export function isEncryptedFile(bytes: Uint8Array): boolean {
  return bytes.length > 16 && MAGIC.every((b, i) => bytes[i] === b);
}

export async function encryptFileBytes(familyId: string, bytes: Uint8Array): Promise<Uint8Array> {
  const key = await getActiveFamilyKey(familyId);
  if (!key) throw new Error('No family key set on this device — enter the family security code first.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes as unknown as ArrayBuffer));
  const out = new Uint8Array(4 + 12 + ct.length);
  out.set(MAGIC, 0); out.set(iv, 4); out.set(ct, 16);
  return out;
}

/** Decrypts with the active key, then every older key. Unencrypted (legacy) files pass straight through. */
export async function decryptFileBytes(familyId: string, bytes: Uint8Array): Promise<Uint8Array> {
  if (!isEncryptedFile(bytes)) return bytes;
  const active = await getActiveFamilyKey(familyId);
  if (!active) throw new Error('This file is encrypted. Enter the family security code on this device to open it.');
  const iv = bytes.slice(4, 16);
  const ct = bytes.slice(16);
  for (const key of [active, ...(await getPreviousFamilyKeys(familyId))]) {
    try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)); } catch { /* try the next key */ }
  }
  throw new Error('Could not decrypt this file with the family security code on this device.');
}

/**
 * The family key(s) as raw base64, newest first, for the AI functions: they download the stored file and need to read it
 * to analyse it. Sent over HTTPS to our own function and used only for that request.
 */
export async function familyKeysForAnalysis(familyId: string): Promise<string[]> {
  const keys = [await getActiveFamilyKey(familyId), ...(await getPreviousFamilyKeys(familyId))].filter((k): k is CryptoKey => !!k);
  if (keys.length === 0) throw new Error('This device has no family security code. Enter it in Profile → Data Recovery → Set up this device, then try again.');
  const out: string[] = [];
  for (const k of keys) {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', k));
    let s = ''; for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    out.push(btoa(s));
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
