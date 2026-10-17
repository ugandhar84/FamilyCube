// Decrypts a stored medical file (format: "FCE1" + 12-byte IV + AES-GCM ciphertext) with one of the family keys the
// caller sent for this request. Files without the header are legacy, unencrypted uploads and pass through unchanged.
const MAGIC = [0x46, 0x43, 0x45, 0x31];

export function isEncryptedFile(bytes: Uint8Array): boolean {
  return bytes.length > 16 && MAGIC.every((b, i) => bytes[i] === b);
}

export async function decryptStoredFile(bytes: Uint8Array, keysB64: string[] | undefined): Promise<Uint8Array> {
  if (!isEncryptedFile(bytes)) return bytes;
  if (!keysB64 || keysB64.length === 0) throw new Error('This file is encrypted and no family key was provided. Update the app and try again.');
  const iv = bytes.slice(4, 16);
  const ct = bytes.slice(16);
  for (const b64 of keysB64) {
    try {
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
    } catch { /* try the next key */ }
  }
  throw new Error('Could not decrypt the file with the family key provided.');
}
