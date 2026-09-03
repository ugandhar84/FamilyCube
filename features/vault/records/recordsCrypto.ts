/**
 * recordsCrypto — per-device envelope encryption for AI analysis results
 * (medical_records.ai_analysis_json), mirroring lib/locationCrypto.ts's
 * "long-lived session key, wrapped once per family device" shape rather
 * than chat's per-message envelope — a record's analysis is written once
 * and read many times by many family members over time, not messaged.
 *
 * Was: a key derived purely from `familyId + a fixed public salt`
 * (APP_SALT below) — any client that knows the family's id (a non-secret
 * UUID, visible to anyone who can query the family's own rows) could
 * derive the exact same key. Upgraded to the real per-device scheme
 * chat/location already use in production (feature flag `per_device_e2e`).
 *
 * Blob versioning: v1 is the OLD familyId+salt scheme, kept only for
 * decrypting rows written before this upgrade — never used for new writes.
 * v2 is the new per-device scheme. isEncryptedBlob() accepts either.
 */
import { supabase } from '@/lib/supabase';
import {
  getDeviceId, getDevicePublicKeyB64,
  getOrCreateRecordsSessionKey, wrapRecordsKeyForDevices, unwrapRecordsKey,
  encryptWithSessionKey, decryptWithSessionKey,
} from '@/lib/chatCrypto';
import { ensureDeviceRegistered, getFamilyDeviceDirectory } from '@/lib/deviceRegistry';
import { isFeatureEnabled } from '@/lib/featureFlags';

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

// ─── v2 scheme — per-device envelope ──────────────────────────────────────────

export interface EncryptedBlobV1 { iv: string; ct: string; v: 1; }
export interface EncryptedBlobV2 { ct: string; v: 2; }
export type EncryptedBlob = EncryptedBlobV1 | EncryptedBlobV2;

// Devices this session has already confirmed are wrapped for — avoids
// re-checking/re-wrapping on every single record write (only actually needs
// to happen once per app session per family, or when a new device joins,
// which a future session will naturally re-run this for). Same pattern as
// locationCrypto.ts's _locationKeyEnsured.
const _recordsKeyEnsured = new Set<string>();

async function ensureRecordsKeyWrapped(familyId: string, memberId: string): Promise<Uint8Array | null> {
  const sessionKey = await getOrCreateRecordsSessionKey(familyId);
  if (_recordsKeyEnsured.has(familyId)) return sessionKey;
  try {
    await ensureDeviceRegistered(familyId, memberId);
    const directory = await getFamilyDeviceDirectory(familyId);
    if (directory.length === 0) return sessionKey;
    const wrapped = await wrapRecordsKeyForDevices(sessionKey, directory);
    const { error } = await supabase.from('family_record_keys').upsert(
      wrapped.map(w => ({ family_id: familyId, device_id: w.deviceId, wrapped_key: w.wrappedKey })),
      { onConflict: 'family_id,device_id' },
    );
    if (error) { console.warn('[recordsCrypto] ensureRecordsKeyWrapped upsert failed', error.message); return sessionKey; }
    _recordsKeyEnsured.add(familyId);
  } catch (e: any) {
    console.warn('[recordsCrypto] ensureRecordsKeyWrapped failed', e?.message ?? e);
  }
  return sessionKey;
}

/**
 * Encrypts an AI analysis object for storage in medical_records.ai_analysis_json.
 * `memberId` is needed (unlike the old signature) purely to satisfy
 * ensureDeviceRegistered's own requirement — pass the currently active
 * member's id. Falls back to the legacy scheme if per_device_e2e is off or
 * anything about the device-wrap path fails, matching locationCrypto.ts's
 * own fail-open behavior.
 */
export async function encryptAnalysis(familyId: string, data: object, memberId?: string): Promise<string> {
  if (!isFeatureEnabled('per_device_e2e') || !memberId) {
    return encryptLegacyBlob(familyId, data);
  }
  try {
    const sessionKey = await ensureRecordsKeyWrapped(familyId, memberId);
    if (!sessionKey) return encryptLegacyBlob(familyId, data);
    const ct = encryptWithSessionKey(JSON.stringify(data), sessionKey);
    const blob: EncryptedBlobV2 = { ct, v: 2 };
    return JSON.stringify(blob);
  } catch (e: any) {
    console.warn('[recordsCrypto] encryptAnalysis per-device failed, falling back to legacy', e?.message ?? e);
    return encryptLegacyBlob(familyId, data);
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

/**
 * Decrypts a stored analysis blob, from THIS device's perspective. Handles
 * both v1 (legacy familyId+salt) and v2 (per-device envelope) blobs
 * transparently — the caller never needs to know which scheme a given row
 * used. Looks up this device's own wrapped copy of the family's records
 * session key; falls back to the legacy decrypt for v1 rows or if this
 * device hasn't been wrapped for yet (e.g. it just registered, or is
 * mid-recovery).
 */
export async function decryptAnalysis<T = object>(familyId: string, stored: string): Promise<T | null> {
  let blob: EncryptedBlob;
  try {
    blob = JSON.parse(stored);
  } catch {
    return null;
  }
  if (blob.v === 1) return decryptLegacy<T>(familyId, blob);
  if (blob.v !== 2) return null;

  if (!isFeatureEnabled('per_device_e2e')) return null; // v2 written but flag now off — nothing sensible to do
  try {
    const deviceId = await getDeviceId();
    const { data: keyRow } = await supabase
      .from('family_record_keys')
      .select('wrapped_key')
      .eq('family_id', familyId)
      .eq('device_id', deviceId)
      .maybeSingle();
    if (!keyRow) return null; // not wrapped for this device yet

    // Same "try every family device's public key as the writer side" trick
    // locationCrypto.ts uses — family_record_keys has no "which device
    // wrapped this" column (it's a shared session key, not a per-message
    // envelope), so this device doesn't know which family device produced
    // ITS specific wrap. A wrong guess just fails the GCM auth tag check.
    const { data: familyDevices } = await supabase
      .from('device_keys')
      .select('public_key')
      .eq('family_id', familyId)
      .is('revoked_at', null);
    for (const d of familyDevices ?? []) {
      try {
        const sessionKey = await unwrapRecordsKey(keyRow.wrapped_key, d.public_key);
        const result = decryptWithSessionKey(blob.ct, sessionKey);
        if (!result.startsWith('[🔒')) return JSON.parse(result) as T;
      } catch { /* try next device */ }
    }
    return null;
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
    if (parsed?.v === 2) return typeof parsed.ct === 'string';
    return false;
  } catch {
    return false;
  }
}
