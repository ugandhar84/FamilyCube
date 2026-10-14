/**
 * recordsCrypto — shared-family-key encryption for AI analysis results
 * (medical_records.ai_analysis_json), using the same AES-256 key every
 * other family member's device already has (lib/chatCrypto.ts's
 * encryptWithFamilyKey/decryptWithFamilyKey) — no per-device wrapping.
 *
 * Blob versioning: v1 is the OLD familyId+salt scheme (kept decrypt-only,
 * for rows written before any encryption upgrade). v2 was the per-device
 * envelope (removed — no longer written, but see note below). v3 is the
 * current shared-key scheme. isEncryptedBlob() accepts v1 or v3.
 */
import { encryptWithFamilyKey, decryptWithFamilyKey } from '@/lib/chatCrypto';

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ─── Legacy v1 scheme — decrypt-only, never written again ────────────────────
const APP_SALT = 'FamilyCubeVault-v1-medrecord-analysis';

async function deriveLegacyKey(familyId: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw', ENC.encode(familyId + APP_SALT), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: ENC.encode(APP_SALT), iterations: 120_000, hash: 'SHA-256' },
    raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
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

async function decryptLegacy<T>(familyId: string, blob: { iv: string; ct: string }): Promise<T | null> {
  try {
    const key = await deriveLegacyKey(familyId);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(blob.iv).buffer as ArrayBuffer },
      key, fromBase64(blob.ct).buffer as ArrayBuffer,
    );
    return JSON.parse(DEC.decode(plain)) as T;
  } catch {
    return null;
  }
}

async function encryptLegacyBlob(familyId: string, data: object): Promise<string> {
  const key = await deriveLegacyKey(familyId);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const plain = ENC.encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, plain.buffer as ArrayBuffer);
  const blob: EncryptedBlobV1 = { iv: toBase64(iv.buffer as ArrayBuffer), ct: toBase64(cipher), v: 1 };
  return JSON.stringify(blob);
}

// ─── v3 scheme — shared family key ────────────────────────────────────────────

export interface EncryptedBlobV1 { iv: string; ct: string; v: 1; }
export interface EncryptedBlobV3 { ct: string; v: 3; }
export type EncryptedBlob = EncryptedBlobV1 | EncryptedBlobV3;

/**
 * Encrypts an AI analysis object for storage in medical_records.ai_analysis_json
 * with this family's shared key. Falls back to the legacy familyId-derived
 * scheme only if no family key has been set on this device yet (shouldn't
 * normally happen — the chat lock screen gates entry before this point —
 * but fails safe rather than throwing out of a background analysis job).
 */
export async function encryptAnalysis(familyId: string, data: object): Promise<string> {
  try {
    const ct = await encryptWithFamilyKey(familyId, JSON.stringify(data));
    const blob: EncryptedBlobV3 = { ct, v: 3 };
    return JSON.stringify(blob);
  } catch (e: any) {
    console.warn('[recordsCrypto] encryptAnalysis failed, falling back to legacy', e?.message ?? e);
    return encryptLegacyBlob(familyId, data);
  }
}

/**
 * Decrypts a stored analysis blob. Handles v1 (legacy familyId+salt) and
 * v3 (shared family key) transparently.
 */
export async function decryptAnalysis<T = object>(familyId: string, stored: string): Promise<T | null> {
  let blob: EncryptedBlob;
  try {
    blob = JSON.parse(stored);
  } catch {
    return null;
  }
  if (blob.v === 1) return decryptLegacy<T>(familyId, blob);
  if (blob.v !== 3) return null;

  try {
    const result = await decryptWithFamilyKey(familyId, blob.ct);
    if (result.startsWith('[🔒')) return null;
    return JSON.parse(result) as T;
  } catch (e: any) {
    console.warn('[recordsCrypto] decryptAnalysis failed', e?.message ?? e);
    return null;
  }
}

export function isEncryptedBlob(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.v === 1) return typeof parsed.iv === 'string' && typeof parsed.ct === 'string';
    if (parsed?.v === 3) return typeof parsed.ct === 'string';
    return false;
  } catch {
    return false;
  }
}
