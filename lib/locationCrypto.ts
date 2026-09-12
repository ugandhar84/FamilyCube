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
  unwrapLocationKeyWithRealIdentity,
  encryptWithSessionKey, decryptWithSessionKey,
} from './chatCrypto';
import { ensureDeviceRegistered, getUniqueWrapTargets } from './deviceRegistry';
import { isFeatureEnabled } from './featureFlags';

/**
 * Makes sure `memberId`'s location session key exists on this device and
 * is wrapped for every currently-registered family device. Cheap to call
 * on every location update — always re-checks member_location_keys against
 * the family's CURRENT device directory (see the removed-cache comment
 * below), so a newly-registered device is always caught, not just on the
 * first call this app process ever made for this member.
 */
async function ensureLocationKeyWrapped(familyId: string, memberId: string): Promise<Uint8Array | null> {
  const sessionKey = await getOrCreateLocationSessionKey(memberId);
  // Was: `if (_locationKeyEnsured.has(memberId)) return sessionKey;` here —
  // a process-lifetime cache keyed only by memberId, with no awareness of
  // the family's device SET. A shared/PIN-switching device registering a
  // NEW device_id (reinstall, or a family member's first switch-in on it)
  // WHILE this app process stays alive (no full relaunch — normal for a
  // background/foreground cycle) left every OTHER already-"ensured" member
  // permanently skipping this whole function forever after, even though
  // the DB-authoritative check below (existingDeviceIds/missing) exists
  // specifically to catch exactly this — it just never got to run
  // [live-reported: shared-device family, some members' location stuck on
  // "[🔒 encrypted — wrong key or corrupted]" for other viewers, confirmed
  // via direct DB query: member_location_keys had wraps for every
  // long-lived device but was missing the family's newest device_id
  // entirely, for members who had genuinely switched into that device
  // since]. Removed — this function is already documented "cheap to call
  // on every location update," so always re-checking is by design, not a
  // performance regression; the one-time cost that check skipped was
  // meant to only ever be the extra ensureDeviceRegistered/getUniqueWrapTargets
  // round trip, not skipping detection of a genuinely new missing device.
  try {
    await ensureDeviceRegistered(familyId, memberId);
    // getUniqueWrapTargets collapses the raw per-profile device directory to
    // one entry per physical device_id — required here because
    // member_location_keys is keyed (member_id, device_id) with no column
    // for "which profile," so wrapping once per PROFILE on a shared device
    // produced multiple rows sharing one device_id and the upsert below hit
    // Postgres' "ON CONFLICT DO UPDATE command cannot affect row a second
    // time" (see that function's own doc for the full history — this was
    // silently breaking every location wrap for any family with a device
    // shared across more than one member profile).
    const directory = await getUniqueWrapTargets(familyId);
    if (directory.length === 0) return sessionKey;
    // Checking which of the CURRENT directory's devices already have a row
    // is cheap and makes this authoritative against the DB every single
    // call, rather than trusting any same-process assumption — a device
    // set can change (new device registered, family reset) between two
    // calls in the same app session just as easily as between two
    // different sessions.
    const { data: existingRows } = await supabase
      .from('member_location_keys')
      .select('device_id')
      .eq('member_id', memberId);
    const existingDeviceIds = new Set((existingRows ?? []).map(r => r.device_id));
    const missing = directory.filter(d => !existingDeviceIds.has(d.deviceId));
    if (missing.length === 0) return sessionKey;
    const wrapped = await wrapLocationKeyForDevices(sessionKey, missing, familyId);
    const { error } = await supabase.from('member_location_keys').upsert(
      wrapped.map(w => ({ member_id: memberId, device_id: w.deviceId, wrapped_key: w.wrappedKey })),
      { onConflict: 'member_id,device_id' },
    );
    if (error) { console.warn('[locationCrypto] ensureLocationKeyWrapped upsert failed', error.message); return sessionKey; }
  } catch (e: any) {
    console.warn('[locationCrypto] ensureLocationKeyWrapped failed', e?.message ?? e);
  }
  return sessionKey;
}

/**
 * Encrypts one piece of location text (address/street/neighborhood) for
 * `memberId`'s location row. Call for every location update — cheap even
 * though it internally calls ensureLocationKeyWrapped, since that's a
 * single indexed select plus (usually) zero writes once the device
 * directory is already fully wrapped.
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
 * Live-reported: "i see the address still showing the encrypted wrong
 * key" — traced to ensureLocationKeyWrapped only ever running as a side
 * effect of encryptLocationText, which only fires on a REAL location
 * write (movement of >= MIN_DISTANCE_METERS, see locationTracking.ts's
 * own comment: "movement is the only real trigger — a stationary phone
 * never wakes the GPS chip"). A device whose background tracking was
 * ALREADY running when per_device_e2e briefly went off-then-back-on (this
 * session's own earlier incident) had `already return true` short-circuit
 * startBackgroundLocationTracking with no new write — so the wrap that
 * should have self-healed on the next location update simply never got a
 * next update to piggyback on, for however long the phone stays
 * stationary. member_location_keys was confirmed empty for the affected
 * family (0 rows) despite device_keys being fully populated (6 rows) —
 * the directory was never the problem, the wrap step just never got
 * triggered again.
 *
 * This forces that check NOW, independent of any real GPS fix — safe to
 * call on every app foreground for whichever member this device is
 * actively tracking (ensureLocationKeyWrapped always re-checks the DB
 * directly, so this stays cheap and correct even called repeatedly).
 */
export async function forceRecheckLocationKeyWrap(familyId: string | null | undefined, memberId: string | null | undefined): Promise<void> {
  if (!isFeatureEnabled('per_device_e2e') || !familyId || !memberId) return;
  try { await ensureLocationKeyWrapped(familyId, memberId); }
  catch (e: any) { console.warn('[locationCrypto] forceRecheckLocationKeyWrap failed', e?.message ?? e); }
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

    // familyId matters here so a device that recovered THIS family's
    // passcode (a family-scoped key, see chatCrypto.ts's installRecoveredKeyPair
    // doc) tries that recovered key rather than only ever trying this
    // device's own real identity. Resolved from memberId rather than
    // threaded through every one of this function's several call sites.
    const { useFamilyStore } = require('@/store/familyStore');
    const familyId = (useFamilyStore.getState().members as any[]).find((m: any) => m.id === memberId)?.familyId
      ?? useFamilyStore.getState().activeFamilyId;

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
        const sessionKey = await unwrapLocationKey(keyRow.wrapped_key, d.public_key, familyId);
        const result = decryptWithSessionKey(ciphertext, sessionKey);
        if (!result.startsWith('[🔒')) return result;
      } catch { /* try next device */ }
      // Live-reported ("wrong key encryption in FindFam") — this device may
      // have a STALE family-scoped recovered identity cached from before a
      // recovery passcode reset/rotation (see getRealDeviceKeyPair's own
      // doc in chatCrypto.ts): getDeviceKeyPair(familyId) above always
      // prefers that cached pair over this device's own real identity, even
      // after the server-side recovery keypair has moved on. This device's
      // real identity is registered normally in device_keys the whole time
      // and unaffected by recovery, so it's always safe to also try it here
      // — no weaker key, just a second legitimate candidate this device
      // already rightfully owns.
      try {
        const sessionKey = await unwrapLocationKeyWithRealIdentity(keyRow.wrapped_key, d.public_key);
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
