/**
 * locationCrypto — per-device encryption for location address text
 * (member_locations.address/street/neighborhood), mirroring chat's
 * per-device envelope but with a long-lived session key per member
 * instead of a fresh key per update (see lib/chatCrypto.ts's "Location
 * session key" section for the full design rationale).
 *
 * lat/lng are never touched here — they stay plaintext by design, still
 * needed for live map rendering without decrypting every row.
 *
 * Feature-flagged alongside chat's per_device_e2e. When the flag is off,
 * falls back to the legacy shared-family-key scheme (encryptMessage/
 * decryptMessage) — the same behavior this file had before per-device
 * location encryption existed.
 */
import { supabase } from './supabase';
import {
  encryptMessage, decryptMessage,
  getDeviceId, getDevicePublicKeyB64,
  getOrCreateLocationSessionKey, wrapLocationKeyForDevices, unwrapLocationKey,
  encryptWithSessionKey, decryptWithSessionKey,
} from './chatCrypto';
import { ensureDeviceRegistered, getFamilyDeviceDirectory } from './deviceRegistry';
import { isFeatureEnabled } from './featureFlags';

// Devices this session has already confirmed are wrapped for — avoids
// re-checking/re-wrapping on every single location update (only actually
// needs to happen once per app session per member, or when a new device
// joins, which a future session will naturally re-run this for).
const _locationKeyEnsured = new Set<string>();

/**
 * Makes sure `memberId`'s location session key exists on this device and
 * is wrapped for every currently-registered family device. Cheap to call
 * on every location update (no-ops after the first successful run this
 * session) — the actual wrap-for-every-device work only happens once.
 */
async function ensureLocationKeyWrapped(familyId: string, memberId: string): Promise<Uint8Array | null> {
  const sessionKey = await getOrCreateLocationSessionKey(memberId);
  if (_locationKeyEnsured.has(memberId)) return sessionKey;
  try {
    await ensureDeviceRegistered(familyId, memberId);
    const directory = await getFamilyDeviceDirectory(familyId);
    if (directory.length === 0) return sessionKey;
    const wrapped = await wrapLocationKeyForDevices(sessionKey, directory);
    const { error } = await supabase.from('member_location_keys').upsert(
      wrapped.map(w => ({ member_id: memberId, device_id: w.deviceId, wrapped_key: w.wrappedKey })),
      { onConflict: 'member_id,device_id' },
    );
    if (error) { console.warn('[locationCrypto] ensureLocationKeyWrapped upsert failed', error.message); return sessionKey; }
    _locationKeyEnsured.add(memberId);
  } catch (e: any) {
    console.warn('[locationCrypto] ensureLocationKeyWrapped failed', e?.message ?? e);
  }
  return sessionKey;
}

/**
 * Encrypts one piece of location text (address/street/neighborhood) for
 * `memberId`'s location row. Call for every location update — cheap even
 * though it internally calls ensureLocationKeyWrapped, since that no-ops
 * after the first successful run this session.
 */
export async function encryptLocationText(memberId: string, familyId: string | null | undefined, plaintext: string): Promise<string> {
  if (!isFeatureEnabled('per_device_e2e') || !familyId) return encryptMessage(plaintext);
  try {
    const sessionKey = await ensureLocationKeyWrapped(familyId, memberId);
    if (!sessionKey) return encryptMessage(plaintext);
    return encryptWithSessionKey(plaintext, sessionKey);
  } catch (e: any) {
    console.warn('[locationCrypto] encryptLocationText failed, falling back to legacy', e?.message ?? e);
    return encryptMessage(plaintext);
  }
}

/**
 * Decrypts one piece of location text for `memberId`'s location row, from
 * THIS device's perspective. Looks up this device's own wrapped copy of
 * memberId's session key; falls back to the legacy shared-key decrypt for
 * rows written before per_device_e2e was enabled, or if this device
 * hasn't been wrapped for yet (e.g. it just registered).
 */
export async function decryptLocationText(memberId: string, ciphertext: string): Promise<string> {
  if (!isFeatureEnabled('per_device_e2e')) return decryptMessage(ciphertext);
  try {
    const deviceId = await getDeviceId();
    const { data: keyRow } = await supabase
      .from('member_location_keys')
      .select('wrapped_key')
      .eq('member_id', memberId)
      .eq('device_id', deviceId)
      .maybeSingle();
    if (!keyRow) return decryptMessage(ciphertext); // legacy row or not wrapped for this device yet

    // Unwrapping needs ECDH(my private key, WRITER's public key) — but
    // member_locations has no sender_device_id (unlike chat_messages;
    // it's a single overwritten "current position" row, not discrete
    // messages), so this device doesn't know which of memberId's own
    // devices produced this specific wrap. Try each of memberId's
    // registered device public keys as the writer side until one
    // successfully unwraps — a wrong guess just fails the GCM auth tag
    // check (not a security issue: this device already proved it holds a
    // wrapped copy at all via the keyRow lookup above).
    const { data: memberDevices } = await supabase
      .from('device_keys')
      .select('public_key')
      .eq('member_id', memberId)
      .is('revoked_at', null);
    for (const d of memberDevices ?? []) {
      try {
        const sessionKey = await unwrapLocationKey(keyRow.wrapped_key, d.public_key);
        const result = decryptWithSessionKey(ciphertext, sessionKey);
        if (!result.startsWith('[🔒')) return result;
      } catch { /* try next device */ }
    }
    return decryptMessage(ciphertext);
  } catch (e: any) {
    console.warn('[locationCrypto] decryptLocationText failed, falling back to legacy', e?.message ?? e);
    return decryptMessage(ciphertext);
  }
}
