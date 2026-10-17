/**
 * familyKeyRotation — admin-driven rotation of the shared family key
 * (lib/chatCrypto.ts's encryptWithFamilyKey/decryptWithFamilyKey), with a
 * full background re-encryption pass over existing chat + records history.
 *
 * Replaces lib/deviceRegistry.ts's resumable backfill machinery (built for
 * the old per-device scheme) with a much simpler job driven by a
 * PERSISTED CURSOR rather than a "find rows missing a sibling wrap" DB
 * query — there's no sibling-row concept here (every row either holds the
 * new ciphertext or the old one), so only this job's own bookkeeping knows
 * "did I personally re-upload this row yet in my current pass," not
 * anything inferable from current DB state alone.
 *
 * Progress is persisted to AsyncStorage after EVERY batch, not just at the
 * end, so a mid-rotation app close loses at most one batch's worth of
 * redone work. Only the device that started the rotation ever resumes it
 * (compared via getDeviceId()) — "one device does it all."
 *
 * Rate limit: rotation is capped at once per 30 days (confirmed design
 * decision) — rotateFamilyKey checks families.key_rotated_at itself before
 * starting anything.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  getDeviceId,
  getActiveFamilyKey, rotateActiveFamilyKey,
  decryptWithFamilyKey,
  normalizeFamilyKeyCode, deriveFamilyKeyFromCode,
} from '@/lib/chatCrypto';

const JOB_KEY = 'familycube_key_rotation_job';
const BATCH_SIZE = 200;
export const ROTATION_COOLDOWN_DAYS = 30;

type RotationCursor = { chatDone: boolean; recordsDone: boolean; lastChatId: string | null; lastRecordId: string | null };

interface RotationJob {
  familyId: string;
  newCode: string;
  startedByDeviceId: string;
  startedAt: string;
  cursor: RotationCursor;
}

export class RotationTooSoonError extends Error {
  nextEligibleDate: Date;
  constructor(nextEligibleDate: Date) {
    super(`You can rotate the family key again on ${nextEligibleDate.toLocaleDateString()}.`);
    this.nextEligibleDate = nextEligibleDate;
  }
}

async function readJob(): Promise<RotationJob | null> {
  const stored = await AsyncStorage.getItem(JOB_KEY);
  return stored ? JSON.parse(stored) as RotationJob : null;
}
async function writeJob(job: RotationJob): Promise<void> {
  await AsyncStorage.setItem(JOB_KEY, JSON.stringify(job));
}
async function clearJob(): Promise<void> {
  await AsyncStorage.removeItem(JOB_KEY);
}

/**
 * Parent-only entry point. Checks the 30-day cooldown against
 * families.key_rotated_at, then persists a rotation job and starts it.
 * Throws RotationTooSoonError if still within the cooldown window — the
 * caller (rotation UI) should catch this specifically and show the
 * next-eligible date rather than a generic error.
 */
export async function rotateFamilyKey(familyId: string, newCode: string, actorMemberId: string): Promise<void> {
  normalizeFamilyKeyCode(newCode); // throws on malformed input before anything else happens

  const { data: family, error: fetchError } = await supabase
    .from('families')
    .select('key_rotated_at')
    .eq('id', familyId)
    .single();
  if (fetchError) throw fetchError;

  if (family?.key_rotated_at) {
    const lastRotated = new Date(family.key_rotated_at);
    const nextEligible = new Date(lastRotated.getTime() + ROTATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    if (nextEligible.getTime() > Date.now()) {
      throw new RotationTooSoonError(nextEligible);
    }
  }

  const deviceId = await getDeviceId();
  const job: RotationJob = {
    familyId, newCode, startedByDeviceId: deviceId, startedAt: new Date().toISOString(),
    cursor: { chatDone: false, recordsDone: false, lastChatId: null, lastRecordId: null },
  };
  await writeJob(job);

  // Bump the generation counter + who/when immediately — this is what
  // blocks every OTHER device from encrypting/decrypting until it's given
  // the new code, even while this device's re-encryption pass is still
  // running in the background.
  const { error: bumpError } = await supabase.rpc('bump_family_key_generation', {
    p_family_id: familyId, p_rotated_by: actorMemberId,
  });
  if (bumpError) throw bumpError;

  await runRotationJob();
}

/**
 * Runs (or resumes) the currently persisted rotation job, if any. Walks
 * chat_messages then medical_records for this family in id order, decrypting
 * each row with the OLD key (still active at this point — the new key is
 * only installed once both domains finish) and re-encrypting/re-uploading
 * under the new key, persisting the cursor after every batch.
 */
export async function runRotationJob(): Promise<void> {
  const job = await readJob();
  if (!job) return;

  const oldKey = await getActiveFamilyKey(job.familyId);
  if (!oldKey) {
    // Nothing to re-encrypt FROM — this device has no old key at all
    // (shouldn't happen for the device that started its own rotation, but
    // fail safe rather than silently corrupt data).
    await clearJob();
    throw new Error('No existing family key found on this device — cannot rotate.');
  }

  if (!job.cursor.chatDone) {
    await rotateChatMessages(job);
  }
  if (!job.cursor.recordsDone) {
    await rotateMedicalRecords(job);
  }

  await rotateActiveFamilyKey(job.familyId, job.newCode);
  await clearJob();
}

async function rotateChatMessages(job: RotationJob): Promise<void> {
  const oldKey = await getActiveFamilyKey(job.familyId);
  if (!oldKey) return;

  // chat_messages has no foreign key to chat_channels, so PostgREST cannot embed one in the other (the old
  // `chat_channels!inner(family_id)` embed failed with "Could not find a relationship"). Look the family's channel
  // ids up first and filter the messages by them.
  const { data: chans, error: chanErr } = await supabase.from('chat_channels').select('id').eq('family_id', job.familyId);
  if (chanErr) throw chanErr;
  const channelIds = (chans ?? []).map(c => c.id as string);
  if (channelIds.length === 0) {
    job.cursor.chatDone = true;
    await writeJob(job);
    return;
  }

  while (true) {
    let query = supabase
      .from('chat_messages')
      .select('id, text, channel_id')
      .in('channel_id', channelIds)
      .not('text', 'is', null)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);
    if (job.cursor.lastChatId) query = query.gt('id', job.cursor.lastChatId);

    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) {
      job.cursor.chatDone = true;
      await writeJob(job);
      return;
    }

    for (const row of rows) {
      if (!row.text) continue;
      let plaintext: string;
      try {
        plaintext = await decryptWithFamilyKey(job.familyId, row.text);
      } catch {
        continue; // no key at all — shouldn't happen mid-job, skip rather than abort the batch
      }
      if (plaintext.startsWith('[🔒')) continue; // already unreadable under the old key — nothing to carry forward

      const newCiphertext = await encryptUnderCode(plaintext, job.newCode);
      const { error: updateError } = await supabase
        .from('chat_messages')
        .update({ text: newCiphertext })
        .eq('id', row.id);
      if (updateError) console.warn('[familyKeyRotation] chat_messages update failed', row.id, updateError.message);
    }

    job.cursor.lastChatId = rows[rows.length - 1].id;
    await writeJob(job);
    if (rows.length < BATCH_SIZE) {
      job.cursor.chatDone = true;
      await writeJob(job);
      return;
    }
  }
}

async function rotateMedicalRecords(job: RotationJob): Promise<void> {
  while (true) {
    let query = supabase
      .from('medical_records')
      .select('id, ai_analysis_json')
      .eq('family_id', job.familyId)
      .not('ai_analysis_json', 'is', null)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);
    if (job.cursor.lastRecordId) query = query.gt('id', job.cursor.lastRecordId);

    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows || rows.length === 0) {
      job.cursor.recordsDone = true;
      await writeJob(job);
      return;
    }

    for (const row of rows) {
      if (!row.ai_analysis_json) continue;
      let plaintext: string;
      try {
        plaintext = await decryptWithFamilyKey(job.familyId, row.ai_analysis_json);
      } catch {
        continue;
      }
      if (plaintext.startsWith('[🔒')) continue;

      const newCiphertext = await encryptUnderCode(plaintext, job.newCode);
      const { error: updateError } = await supabase
        .from('medical_records')
        .update({ ai_analysis_json: newCiphertext })
        .eq('id', row.id);
      if (updateError) console.warn('[familyKeyRotation] medical_records update failed', row.id, updateError.message);
    }

    job.cursor.lastRecordId = rows[rows.length - 1].id;
    await writeJob(job);
    if (rows.length < BATCH_SIZE) {
      job.cursor.recordsDone = true;
      await writeJob(job);
      return;
    }
  }
}

/**
 * Encrypts plaintext under the NEW code without installing it as this
 * device's active key yet (that only happens once the whole job finishes,
 * via rotateActiveFamilyKey) — a thin one-off wrapper around
 * deriveFamilyKeyFromCode + raw AES-GCM, kept local to this file since
 * encryptWithFamilyKey itself always encrypts under getActiveFamilyKey.
 */
async function encryptUnderCode(plaintext: string, code: string): Promise<string> {
  const key = await deriveFamilyKeyFromCode(code);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const buf2b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `${buf2b64(iv.buffer as ArrayBuffer)}:${buf2b64(enc)}`;
}

/**
 * Called from app/_layout.tsx on cold start + foreground. Resumes a
 * pending rotation job ONLY if this device is the one that started it —
 * every other device simply stays blocked (isFamilyKeyStale) until a human
 * enters the new code there; it never tries to pick up someone else's job.
 */
export async function resumeRotationIfPending(): Promise<void> {
  const job = await readJob();
  if (!job) return;
  const deviceId = await getDeviceId();
  if (job.startedByDeviceId !== deviceId) return;
  try {
    await runRotationJob();
  } catch (e: any) {
    console.warn('[familyKeyRotation] resumeRotationIfPending failed', e?.message ?? e);
  }
}

/**
 * True when this device's local key generation for `familyId` is behind
 * the family's current rotation generation — the signal every chat/records
 * entry point checks to decide whether to block and prompt for the new
 * code, mirroring the existing Just Us PIN lock-screen pattern.
 */
export async function isFamilyKeyStale(familyId: string): Promise<boolean> {
  const { data: family, error } = await supabase
    .from('families')
    .select('key_generation')
    .eq('id', familyId)
    .single();
  if (error || family == null) return false; // can't tell — fail open rather than lock everyone out on a network blip

  const localGenRaw = await AsyncStorage.getItem(`familycube_key_generation_${familyId}`);
  const localGen = localGenRaw ? parseInt(localGenRaw, 10) : 0;
  return (family.key_generation ?? 0) > localGen;
}

/** Records that this device has caught up to the family's current key generation. */
export async function markFamilyKeyGenerationCurrent(familyId: string): Promise<void> {
  const { data: family } = await supabase.from('families').select('key_generation').eq('id', familyId).single();
  await AsyncStorage.setItem(`familycube_key_generation_${familyId}`, String(family?.key_generation ?? 0));
}
