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
import {
  getDeviceId, getDevicePublicKeyB64, RECOVERY_DEVICE_ID,
  createFamilyRecoveryKey, recoverFamilyKeyWithPasscode, installRecoveredKeyPair,
  rewrapRecoveryPrivateKey,
} from '@/lib/chatCrypto';
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

/**
 * Sets up a family recovery passcode for the first time. Generates a new
 * recovery X25519 key pair, registers its public half in device_keys as
 * the RECOVERY_DEVICE_ID row (so encryptForDevices/wrapLocationKeyForDevices/
 * wrapRecordsKeyForDevices pick it up automatically on every future write,
 * same as any real device), and stores the passcode-encrypted private half
 * on the family row. `setupMemberId` only satisfies device_keys' existing
 * (family_id, device_id, member_id) unique constraint — it has no bearing
 * on the crypto, which never reads member_id at all (see the constraint's
 * own history: 20260925105000_fix_device_keys_shared_device_bug.sql).
 *
 * Does NOT retroactively re-wrap anything encrypted before this call —
 * only future writes (the next chat message, location update, or medical
 * record write) will include the recovery key as a wrap recipient, since
 * every wrap call reads getFamilyDeviceDirectory() fresh each time. Existing
 * ciphertext from before setup remains recoverable only by whichever real
 * devices were already wrapped for it.
 */
export async function setUpFamilyRecoveryKey(
  familyId: string, setupMemberId: string, passcode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { publicKeyB64, encryptedPrivateKey, saltHex } = await createFamilyRecoveryKey(passcode);
    const { error: devErr } = await supabase.from('device_keys').upsert({
      family_id: familyId,
      member_id: setupMemberId,
      device_id: RECOVERY_DEVICE_ID,
      public_key: publicKeyB64,
      is_recovery_key: true,
    }, { onConflict: 'family_id,device_id,member_id' });
    if (devErr) return { ok: false, error: devErr.message };

    const { error: famErr } = await supabase.from('families').update({
      encrypted_recovery_privkey: encryptedPrivateKey,
      recovery_key_salt: saltHex,
    }).eq('id', familyId);
    if (famErr) return { ok: false, error: famErr.message };

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Setup failed' };
  }
}

/** True if this family has already set up a recovery passcode. */
export async function familyHasRecoveryKey(familyId: string): Promise<boolean> {
  const { data } = await supabase.from('families')
    .select('encrypted_recovery_privkey').eq('id', familyId).maybeSingle();
  return !!data?.encrypted_recovery_privkey;
}

/**
 * Changes the family recovery passcode. Requires the CURRENT passcode to
 * verify the caller actually knows it (decrypts the existing recovery
 * private key with it — a wrong current passcode fails here with a clear
 * error, same AES-GCM auth-tag-failure mechanism as recoverWithFamilyPasscode).
 * Only re-wraps that SAME private key under the new passcode — the
 * recovery key pair itself never changes, so no existing chat message,
 * location row, or medical record needs to be touched (see
 * rewrapRecoveryPrivateKey's own doc for why this is safe/sufficient).
 */
export async function changeFamilyRecoveryPasscode(
  familyId: string, currentPasscode: string, newPasscode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.from('families')
      .select('encrypted_recovery_privkey, recovery_key_salt').eq('id', familyId).maybeSingle();
    if (error || !data?.encrypted_recovery_privkey || !data?.recovery_key_salt) {
      return { ok: false, error: 'No recovery passcode has been set up for this family yet' };
    }
    // Verifies the CURRENT passcode by successfully decrypting — throws on
    // a wrong one, caught below and reported as a clean error.
    const { privateKey } = await recoverFamilyKeyWithPasscode(
      currentPasscode, data.encrypted_recovery_privkey, data.recovery_key_salt,
    );
    const { encryptedPrivateKey, saltHex } = await rewrapRecoveryPrivateKey(privateKey, newPasscode);
    const { error: updateErr } = await supabase.from('families').update({
      encrypted_recovery_privkey: encryptedPrivateKey,
      recovery_key_salt: saltHex,
    }).eq('id', familyId);
    if (updateErr) return { ok: false, error: updateErr.message };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Current passcode is incorrect' };
  }
}

/**
 * Recovers this device's access using the family passcode — fetches the
 * encrypted recovery private key, decrypts it locally with the entered
 * passcode, and adopts it as THIS device's own key pair (see
 * installRecoveredKeyPair's own doc for what that means). After this
 * succeeds, this device can immediately decrypt anything previously
 * wrapped for the recovery key — no further action needed. Also registers
 * this device's real device_id under the recovered public key, so future
 * writes wrap for it under its own identity going forward too.
 *
 * Returns a clear wrong-passcode result rather than throwing — callers
 * should show it as an inline error, not a crash.
 */
export async function recoverWithFamilyPasscode(
  familyId: string, memberId: string, passcode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.from('families')
      .select('encrypted_recovery_privkey, recovery_key_salt').eq('id', familyId).maybeSingle();
    if (error || !data?.encrypted_recovery_privkey || !data?.recovery_key_salt) {
      return { ok: false, error: 'No recovery passcode has been set up for this family yet' };
    }
    const { privateKey, publicKey } = await recoverFamilyKeyWithPasscode(
      passcode, data.encrypted_recovery_privkey, data.recovery_key_salt,
    );
    await installRecoveredKeyPair(privateKey, publicKey);

    // Register this device's own real identity under the recovered key too,
    // so it shows up in the directory under its own device id going forward
    // (see installRecoveredKeyPair's doc — harmless duplicate public key).
    _registeredMembers.delete(memberId);
    await ensureDeviceRegistered(familyId, memberId);

    return { ok: true };
  } catch {
    return { ok: false, error: 'Wrong passcode' };
  }
}
