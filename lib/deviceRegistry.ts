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
  rewrapRecoveryPrivateKey, unwrapSessionKeyFromDevice, wrapLocationKeyForDevices,
  peekLocationSessionKey, getOrCreateRecordsSessionKey, wrapRecordsKeyForDevices,
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
    // families write FIRST, device_keys SECOND — these two rows describe
    // the SAME key pair and must never end up describing two different
    // ones. Doing families first means a failure there is a clean no-op
    // (nothing changed yet). If families succeeds but the device_keys
    // upsert below fails, the new passcode already decrypts to the
    // correct, matching private key — the recovery device just isn't
    // registered as a wrap recipient yet, so it simply won't receive new
    // wraps until this is retried, which is a safe, self-healing gap. The
    // reverse order (device_keys first) risked the opposite: a NEW public
    // key registered and actively used to wrap future session keys, while
    // families still held the OLD private key underneath the OLD
    // passcode — the new passcode would then "successfully" decrypt to a
    // private key that no longer matches what's actually registered,
    // silently breaking recovery in a way that would only surface much
    // later when someone actually tried to use it. Real risk introduced
    // by the "Forgot the current passcode?" reset flow, which calls this
    // same function a second time over an existing key.
    // Live-requested: show who set up/last changed the passcode and when
    // on Data Recovery — plain readable metadata, never the passcode
    // itself. setupMemberId is whoever is CALLING this (the setter), not
    // necessarily the family's original creator.
    const { error: famErr } = await supabase.from('families').update({
      encrypted_recovery_privkey: encryptedPrivateKey,
      recovery_key_salt: saltHex,
      recovery_key_set_by: setupMemberId,
      recovery_key_set_at: new Date().toISOString(),
    }).eq('id', familyId);
    if (famErr) return { ok: false, error: famErr.message };

    const { error: devErr } = await supabase.from('device_keys').upsert({
      family_id: familyId,
      member_id: setupMemberId,
      device_id: RECOVERY_DEVICE_ID,
      public_key: publicKeyB64,
      is_recovery_key: true,
    }, { onConflict: 'family_id,device_id,member_id' });
    if (devErr) return { ok: false, error: devErr.message };

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
  familyId: string, currentPasscode: string, newPasscode: string, changedByMemberId?: string,
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
    // Live-requested: show who set up/last changed the passcode and when
    // on Data Recovery — plain readable metadata, never the passcode
    // itself. changedByMemberId is optional purely for backward
    // compatibility with any caller that hasn't been updated to pass it;
    // every current call site does.
    const { error: updateErr } = await supabase.from('families').update({
      encrypted_recovery_privkey: encryptedPrivateKey,
      recovery_key_salt: saltHex,
      ...(changedByMemberId ? { recovery_key_set_by: changedByMemberId, recovery_key_set_at: new Date().toISOString() } : {}),
    }).eq('id', familyId);
    if (updateErr) return { ok: false, error: updateErr.message };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Current passcode is incorrect' };
  }
}

/**
 * Recovers this device's access to ONE family using its passcode — fetches
 * the encrypted recovery private key, decrypts it locally with the entered
 * passcode, and adopts it as this device's key pair FOR THIS FAMILY ONLY
 * (see installRecoveredKeyPair's own doc — family-scoped, does not touch
 * this device's real identity or any other family's data on it). After
 * this succeeds, this device can immediately decrypt anything previously
 * wrapped for the recovery key in this family — no further action needed
 * for data written before recovery. This device's own real identity is
 * still registered normally too (ensureDeviceRegistered, unaffected by
 * recovery), so future writes for this family wrap for both.
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
    await installRecoveredKeyPair(privateKey, publicKey, familyId);

    // This device's own real identity (untouched by recovery above) is
    // still registered normally, so it also has its own working wrap for
    // this family going forward — not just via the recovered key.
    _registeredMembers.delete(memberId);
    await ensureDeviceRegistered(familyId, memberId);

    return { ok: true };
  } catch {
    return { ok: false, error: 'Wrong passcode' };
  }
}

/**
 * Retroactively protects EXISTING chat/location/records history with the
 * family recovery key, right after it's set up (or reset). Without this,
 * setUpFamilyRecoveryKey only registers the recovery key as a wrap
 * recipient for FUTURE writes — every encrypt call reads
 * getFamilyDeviceDirectory() fresh, so the next chat message/location
 * update/record write naturally includes it, but nothing already encrypted
 * gets touched. Live-reported: "even i recover the device wi[t]h the sec
 * key from profile i could[]n[']t see proper decrypted text of old
 * messages" — recovery worked exactly as built, but "as built" only ever
 * covered data written after setup, which reads as broken to anyone who
 * (reasonably) expects "recover the family" to mean ALL of the family's
 * history, not just whatever came after.
 *
 * Call this once, right after setUpFamilyRecoveryKey/changeFamilyRecoveryPasscode's
 * reset path succeeds, from a device that's actually part of the family
 * (i.e. can already decrypt the data it's about to also wrap for the
 * recovery key) — DataRecoveryScreen.tsx is the one caller. Best-effort:
 * each of the three data types is independent, and within chat each
 * message is independent — one failure (a message this device happens not
 * to have a wrap for, a network blip) doesn't abort the rest. Returns
 * counts for the caller to optionally surface, but the whole thing is
 * silent-by-design on partial failure since a family that already
 * successfully set up recovery shouldn't see it reported as an error —
 * worst case, a later backfill run (e.g. next passcode change) catches
 * whatever this pass missed.
 */
export async function backfillRecoveryWraps(
  familyId: string, members: { id: string }[],
): Promise<{ locationMembers: number; recordsBackfilled: boolean; chatMessages: number; chatDone: boolean }> {
  const result = { locationMembers: 0, recordsBackfilled: false, chatMessages: 0, chatDone: true };
  if (!isFeatureEnabled('per_device_e2e')) return result;

  const directory = await getFamilyDeviceDirectory(familyId);
  const recoveryEntry = directory.filter(d => d.deviceId === RECOVERY_DEVICE_ID);
  if (recoveryEntry.length === 0) return result; // nothing to backfill onto yet

  // ── Location: only for members this device actually has a cached
  // session key for (peekLocationSessionKey, non-generating) — re-wrapping
  // the SAME long-lived key covers every past AND future location row for
  // that member in one call, no per-row work needed. Small/fixed cost
  // (one call per family member), so this always runs in full, unlike
  // chat below. ──
  for (const m of members) {
    try {
      const sessionKey = await peekLocationSessionKey(m.id);
      if (!sessionKey) continue; // this device never tracked this member's location
      const wrapped = await wrapLocationKeyForDevices(sessionKey, recoveryEntry);
      const { error } = await supabase.from('member_location_keys').upsert(
        wrapped.map(w => ({ member_id: m.id, device_id: w.deviceId, wrapped_key: w.wrappedKey })),
        { onConflict: 'member_id,device_id' },
      );
      if (!error) result.locationMembers++;
    } catch (e: any) {
      console.warn('[deviceRegistry] backfillRecoveryWraps location failed for member', m.id, e?.message ?? e);
    }
  }

  // ── Records: one family-wide long-lived key — same reasoning, one
  // re-wrap covers all past and future records. ──
  try {
    const recordsKey = await getOrCreateRecordsSessionKey(familyId);
    const wrapped = await wrapRecordsKeyForDevices(recordsKey, recoveryEntry);
    const { error } = await supabase.from('family_record_keys').upsert(
      wrapped.map(w => ({ family_id: familyId, device_id: w.deviceId, wrapped_key: w.wrappedKey })),
      { onConflict: 'family_id,device_id' },
    );
    result.recordsBackfilled = !error;
  } catch (e: any) {
    console.warn('[deviceRegistry] backfillRecoveryWraps records failed', e?.message ?? e);
  }

  // ── Chat: unlike location/records, every message has its OWN fresh
  // session key, so this can be arbitrarily large for a long-lived family
  // (thousands of messages) — capped to a first quick batch here so the
  // caller (DataRecoveryScreen) gets fast visible feedback; whatever's left
  // is picked up by backfillChatRecoveryWraps's own resumable continuation
  // (see runChatRecoveryBackfillInBackground below), not done inline here.
  const chatResult = await backfillChatRecoveryWraps(familyId, recoveryEntry, 300);
  result.chatMessages = chatResult.wrapped;
  result.chatDone = chatResult.done;

  return result;
}

/**
 * Does one bounded pass of the chat recovery backfill: finds up to `limit`
 * messages this device can decrypt that don't yet have a recovery-key wrap,
 * and adds one. Returns `done: true` once nothing was left to do, so a
 * caller can call this repeatedly (e.g. runChatRecoveryBackfillInBackground)
 * until the whole family's chat history is covered, without ever holding a
 * huge batch in memory or blocking the UI for a long-lived family's full
 * history in one call.
 */
async function backfillChatRecoveryWraps(
  familyId: string, recoveryEntry: { deviceId: string; publicKeyB64: string }[], limit: number,
): Promise<{ wrapped: number; done: boolean }> {
  try {
    const deviceId = await getDeviceId();
    // Only rows this device doesn't ALSO have a recovery wrap for yet —
    // left-anti-join emulated via a NOT IN subquery would be ideal, but
    // PostgREST doesn't expose that directly; fetch this device's rows,
    // check which already have a recovery counterpart, keep going until
    // `limit` new ones are found or there's nothing left to check. Capped
    // scan window (10x limit) so a family whose messages are ALREADY
    // mostly backfilled doesn't scan its entire history just to find the
    // last few stragglers.
    const SCAN_CAP = limit * 10;
    const { data: myKeyRows, error: keysErr } = await supabase
      .from('chat_message_keys')
      .select('message_id, wrapped_key, chat_messages!inner(sender_id, sender_device_id)')
      .eq('device_id', deviceId)
      .order('message_id', { ascending: true })
      .limit(SCAN_CAP);
    if (keysErr || !myKeyRows) throw keysErr ?? new Error('no rows');
    if (myKeyRows.length === 0) return { wrapped: 0, done: true };

    const allMessageIds = myKeyRows.map((r: any) => r.message_id);
    const alreadyWrapped = new Set<string>();
    // Chunked — a long-lived family's message count could otherwise build
    // a query too large for a single request; 500 is comfortably under any
    // practical URL/param limit.
    const CHUNK = 500;
    for (let i = 0; i < allMessageIds.length; i += CHUNK) {
      const chunk = allMessageIds.slice(i, i + CHUNK);
      const { data: existingRecoveryRows } = await supabase
        .from('chat_message_keys')
        .select('message_id')
        .eq('device_id', RECOVERY_DEVICE_ID)
        .in('message_id', chunk);
      for (const r of existingRecoveryRows ?? []) alreadyWrapped.add((r as any).message_id);
    }

    const pending = (myKeyRows as any[]).filter(r => !alreadyWrapped.has(r.message_id)).slice(0, limit);
    if (pending.length === 0) {
      // Nothing pending within this scan window — done only if the window
      // wasn't truncated by SCAN_CAP (otherwise there could be more
      // straggler rows further along that this pass didn't even look at).
      return { wrapped: 0, done: myKeyRows.length < SCAN_CAP };
    }

    // Sender device public keys, batched once rather than one query per
    // message — a family's real device count is small, so this is cheap.
    const senderDeviceIds = [...new Set(pending.map((r: any) => r.chat_messages?.sender_device_id).filter(Boolean))];
    const { data: senderDeviceRows } = senderDeviceIds.length > 0
      ? await supabase.from('device_keys').select('device_id, member_id, public_key').in('device_id', senderDeviceIds)
      : { data: [] as any[] };
    const senderPubKey = (deviceId2: string, memberId: string) =>
      (senderDeviceRows ?? []).find((d: any) => d.device_id === deviceId2 && d.member_id === memberId)?.public_key as string | undefined;

    const newRows: { message_id: string; device_id: string; wrapped_key: string }[] = [];
    for (const row of pending) {
      const senderDeviceId = row.chat_messages?.sender_device_id;
      const senderId = row.chat_messages?.sender_id;
      if (!senderDeviceId || !senderId) continue; // legacy pre-per_device_e2e message, nothing to unwrap here
      const pubKey = senderPubKey(senderDeviceId, senderId);
      if (!pubKey) continue;
      try {
        const sessionKey = await unwrapSessionKeyFromDevice(row.wrapped_key, pubKey, familyId);
        const [wrapped] = await wrapLocationKeyForDevices(sessionKey, recoveryEntry, familyId);
        newRows.push({ message_id: row.message_id, device_id: wrapped.deviceId, wrapped_key: wrapped.wrappedKey });
      } catch {
        // One bad/mismatched row shouldn't abort the whole batch.
      }
    }

    if (newRows.length > 0) {
      // insert, not upsert — alreadyWrapped above already excludes any
      // (message_id, RECOVERY_DEVICE_ID) row that exists.
      const { error: insertErr } = await supabase.from('chat_message_keys').insert(newRows);
      if (insertErr) { console.warn('[deviceRegistry] backfillChatRecoveryWraps insert failed', insertErr.message); return { wrapped: 0, done: false }; }
    }
    // More work likely remains whenever this pass's scan window was full
    // (SCAN_CAP) or it found a full `limit` worth of pending rows — either
    // is a sign there could be more beyond what this pass looked at.
    const done = myKeyRows.length < SCAN_CAP && pending.length < limit;
    return { wrapped: newRows.length, done };
  } catch (e: any) {
    console.warn('[deviceRegistry] backfillChatRecoveryWraps failed', e?.message ?? e);
    return { wrapped: 0, done: false };
  }
}

// One in-flight continuation per family per app session — calling this
// again for a family already being backfilled in the background is a
// harmless no-op rather than doubling up the work.
const _chatBackfillRunning = new Set<string>();

/**
 * Resumable continuation of the chat recovery backfill, run in the
 * background (not blocking any UI) — call on app foreground/session start
 * (app/_layout.tsx) for the active family whenever a recovery key exists,
 * so a large family's full chat history eventually gets covered across
 * several app opens/sessions rather than needing one huge blocking pass
 * right when the passcode is set up. Keeps calling backfillChatRecoveryWraps
 * in batches until it reports done, or bails after a generous cap of
 * batches (20 x 300 = 6000 messages per call) so one runaway session can't
 * loop indefinitely — a future app open picks up wherever this left off.
 */
export async function runChatRecoveryBackfillInBackground(familyId: string): Promise<void> {
  if (!isFeatureEnabled('per_device_e2e') || _chatBackfillRunning.has(familyId)) return;
  _chatBackfillRunning.add(familyId);
  // Lazy import — avoids a store dependency in this crypto/plumbing file
  // for the (default) case where nothing ever calls this. RecoveryBackfillBanner.tsx
  // is the one consumer of this progress state.
  const { useRecoveryBackfillStore } = await import('@/store/recoveryBackfillStore');
  let announced = false;
  try {
    const directory = await getFamilyDeviceDirectory(familyId);
    if (!directory.some(d => d.deviceId === RECOVERY_DEVICE_ID)) return; // no recovery key set up for this family
    const recoveryEntry = directory.filter(d => d.deviceId === RECOVERY_DEVICE_ID);
    for (let i = 0; i < 20; i++) {
      const { wrapped, done } = await backfillChatRecoveryWraps(familyId, recoveryEntry, 300);
      if (wrapped > 0) {
        if (!announced) { useRecoveryBackfillStore.getState().start(); announced = true; }
        useRecoveryBackfillStore.getState().progress(wrapped);
      }
      if (done) break;
    }
  } catch (e: any) {
    console.warn('[deviceRegistry] runChatRecoveryBackfillInBackground failed', e?.message ?? e);
  } finally {
    if (announced) useRecoveryBackfillStore.getState().finish();
    _chatBackfillRunning.delete(familyId);
  }
}
