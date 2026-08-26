/**
 * deviceRegistry — shared device_keys directory logic, used by both chat
 * (store/chatStore.ts) and location (lib/locationTracking.ts, features/
 * vault/tabs/GpsTab.tsx) for the per-device E2E envelope. Registers this
 * device's public key once per app session, and looks up every other
 * family device's public key for wrapping. Entirely inert while
 * per_device_e2e is off — no device_keys reads/writes happen unless the
 * flag is enabled.
 *
 * device_keys is one row per (family_id, device_id, member_id) — NOT per
 * (family_id, device_id) alone. A device is routinely SHARED across
 * multiple PIN-switched members (a parent's phone also used by their
 * kids/seniors), and every member on it needs their own directory entry
 * so their wraps don't get silently overwritten by whichever member last
 * called ensureDeviceRegistered on that physical device. Fixed live after
 * this exact bug caused every FindFam location to show
 * "[🔒 encrypted — wrong key or corrupted]" — see
 * 20260925105000_fix_device_keys_shared_device_bug.sql for the full
 * incident writeup. Keep the (family_id, device_id, member_id) upsert
 * target and the per-member cache key below in sync with that migration's
 * unique constraint if either ever changes — they're the same invariant
 * expressed in two places (DB constraint + app-side cache), and drifting
 * either one back to device-only reintroduces this bug.
 */
import { supabase } from '@/lib/supabase';
import { getDeviceId, getDevicePublicKeyB64 } from '@/lib/chatCrypto';
import { isFeatureEnabled } from '@/lib/featureFlags';

// Keyed by memberId, not a single boolean — this device may register on
// behalf of several members in one app session (PIN-switching between
// kids without relaunching), and each needs its own successful upsert,
// not just the first one to run.
const _registeredMembers = new Set<string>();

export async function ensureDeviceRegistered(familyId: string, memberId: string): Promise<void> {
  if (_registeredMembers.has(memberId) || !isFeatureEnabled('per_device_e2e')) return;
  try {
    const deviceId  = await getDeviceId();
    const publicKey = await getDevicePublicKeyB64();
    const { error } = await supabase.from('device_keys').upsert({
      family_id: familyId,
      member_id: memberId,
      device_id: deviceId,
      public_key: publicKey,
    }, { onConflict: 'family_id,device_id,member_id' });
    if (error) { console.warn('[deviceRegistry] ensureDeviceRegistered failed', error.message); return; }
    _registeredMembers.add(memberId);
  } catch (e: any) {
    console.warn('[deviceRegistry] ensureDeviceRegistered failed', e?.message ?? e);
  }
}

/**
 * Every non-revoked device currently registered to this family, one entry
 * per (device, member) pair — deliberately NOT deduplicated by deviceId.
 * A shared phone with two active member profiles yields two directory
 * entries (same publicKeyB64, different memberId attached), which matters
 * to callers that need to know WHICH member's keypair a given entry
 * belongs to (see wrapLocationKeyForDevices' callers) — callers that only
 * need distinct public keys to wrap for should dedupe on publicKeyB64
 * themselves rather than this function silently doing it and losing the
 * member association.
 */
export async function getFamilyDeviceDirectory(
  familyId: string,
): Promise<{ deviceId: string; publicKeyB64: string; memberId: string }[]> {
  const { data, error } = await supabase
    .from('device_keys')
    .select('device_id, public_key, member_id')
    .eq('family_id', familyId)
    .is('revoked_at', null);
  if (error || !data) { console.warn('[deviceRegistry] getFamilyDeviceDirectory failed', error?.message); return []; }
  return data.map((r: any) => ({ deviceId: r.device_id, publicKeyB64: r.public_key, memberId: r.member_id }));
}
