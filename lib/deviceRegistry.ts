/**
 * deviceRegistry — shared device_keys directory logic, used by both chat
 * (store/chatStore.ts) and location (lib/locationTracking.ts, features/
 * vault/tabs/GpsTab.tsx) for the per-device E2E envelope. Registers this
 * device's public key once per app session, and looks up every other
 * family device's public key for wrapping. Entirely inert while
 * per_device_e2e is off — no device_keys reads/writes happen unless the
 * flag is enabled.
 */
import { supabase } from '@/lib/supabase';
import { getDeviceId, getDevicePublicKeyB64 } from '@/lib/chatCrypto';
import { isFeatureEnabled } from '@/lib/featureFlags';

let _deviceRegistered = false;

export async function ensureDeviceRegistered(familyId: string, memberId: string): Promise<void> {
  if (_deviceRegistered || !isFeatureEnabled('per_device_e2e')) return;
  try {
    const deviceId  = await getDeviceId();
    const publicKey = await getDevicePublicKeyB64();
    const { error } = await supabase.from('device_keys').upsert({
      family_id: familyId,
      member_id: memberId,
      device_id: deviceId,
      public_key: publicKey,
    }, { onConflict: 'family_id,device_id' });
    if (error) { console.warn('[deviceRegistry] ensureDeviceRegistered failed', error.message); return; }
    _deviceRegistered = true;
  } catch (e: any) {
    console.warn('[deviceRegistry] ensureDeviceRegistered failed', e?.message ?? e);
  }
}

/** Every non-revoked device currently registered to this family. */
export async function getFamilyDeviceDirectory(familyId: string): Promise<{ deviceId: string; publicKeyB64: string }[]> {
  const { data, error } = await supabase
    .from('device_keys')
    .select('device_id, public_key')
    .eq('family_id', familyId)
    .is('revoked_at', null);
  if (error || !data) { console.warn('[deviceRegistry] getFamilyDeviceDirectory failed', error?.message); return []; }
  return data.map((r: any) => ({ deviceId: r.device_id, publicKeyB64: r.public_key }));
}
