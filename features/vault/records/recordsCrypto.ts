// AES-256-GCM client-side encryption for AI analysis results.
// The key is derived from the familyId — analysis stored in DB is ciphertext.
// Only family members who know the familyId can decrypt it.

const APP_SALT = 'FamilyCubeVault-v1-medrecord-analysis';
const ENC = new TextEncoder();
const DEC = new TextDecoder();

async function deriveKey(familyId: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw', ENC.encode(familyId + APP_SALT), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: ENC.encode(APP_SALT), iterations: 120_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary  = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface EncryptedBlob {
  iv: string;   // base64 12-byte IV
  ct: string;   // base64 ciphertext
  v:  1;        // schema version for future migration
}

export async function encryptAnalysis(familyId: string, data: object): Promise<string> {
  const key     = await deriveKey(familyId);
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const plain   = ENC.encode(JSON.stringify(data));
  const cipher  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, plain.buffer as ArrayBuffer);
  const blob: EncryptedBlob = { iv: toBase64(iv.buffer as ArrayBuffer), ct: toBase64(cipher), v: 1 };
  return JSON.stringify(blob);
}

export async function decryptAnalysis<T = object>(familyId: string, stored: string): Promise<T | null> {
  try {
    const blob: EncryptedBlob = JSON.parse(stored);
    if (blob.v !== 1) return null;
    const key    = await deriveKey(familyId);
    const ivBytes  = fromBase64(blob.iv);
    const ctBytes  = fromBase64(blob.ct);
    const plain    = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      key,
      ctBytes.buffer as ArrayBuffer,
    );
    return JSON.parse(DEC.decode(plain)) as T;
  } catch {
    return null;
  }
}

export function isEncryptedBlob(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return parsed?.v === 1 && typeof parsed.iv === 'string' && typeof parsed.ct === 'string';
  } catch {
    return false;
  }
}
