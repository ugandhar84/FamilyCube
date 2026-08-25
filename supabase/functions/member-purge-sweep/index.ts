// FamilyCube — Edge Function: member-purge-sweep
// Runs daily via pg_cron (see migration 20260924000000_member_purge_sweep_cron.sql).
// Permanently deletes:
//   - members whose deleted_at is more than 7 days ago (Roster's "delete
//     profile" — familyStore.removeMember — for non-auth PIN-only members)
//   - profiles whose deleted_at is more than 7 days ago (Profile's own
//     "delete account" self-service flow — supabase/functions/delete-account
//     — for auth-linked members), by hard-deleting the auth user, which
//     cascades the profile row per Postgres FK ON DELETE CASCADE.
//
// Adapted from PawBond's purge-deleted-accounts (30-day window, pets/
// health-records storage cleanup) rather than reused directly — that
// function's storage-bucket cleanup (pets bucket, health-records bucket,
// per-pet avatar/gallery prefixes) is PawBond-domain-specific and doesn't
// map onto Family Cube's schema, so this is a parallel, Family-Cube-scoped
// version: 7-day window (matches migration 20260908230000_member_soft_delete.sql),
// no pet/animal storage buckets to sweep, and an extra members-table purge
// branch PawBond's version never needed (PawBond only ever soft-deletes at
// the profiles/auth-user level, never a secondary non-auth "member" row).
//
// Before a members row is purged: per explicit user decision, chat message
// history (chat_messages.sender_id) is left untouched — never deleted or
// nulled — the client already handles a sender lookup miss by showing
// "Removed member" (see components/ChatMessageBubble.tsx's fallback) so
// history stays intact and readable. chore_tasks.assigned_to_id, however,
// MUST be released back to the pool first (assigned_to_id -> members has no
// FK cascade/set-null clause — the DELETE below would otherwise leave a
// dangling id, or fail outright on any column that does have a hard FK).
// Uses the exact same "release to pool" shape store/choreStore.ts's own
// unassign paths use: assigned_to_id = null, is_pool = true, status='todo'
// (only for chores not already in a terminal status — a completed/approved
// chore's assigned_to_id is a historical record, not a live assignment, and
// is deliberately left alone, same as familyStore.removeMember's existing
// pre-delete cleanup this sweep mirrors).
//
// Cron schedule (set via pg_cron — see the migration above):
//   once daily: 0 4 * * *
//
// Deploy: supabase functions deploy member-purge-sweep
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Chore statuses that mean "this assignment is history, not live" — same
// terminal set familyStore.removeMember's own pre-delete cleanup already
// treats as untouchable.
const TERMINAL_CHORE_STATUSES = ['approved', 'auto_approved', 'completed', 'declined', 'expired', 'cancelled'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Only accept calls bearing the service role key or a dedicated CRON_SECRET
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CRON_SECRET = Deno.env.get('CRON_SECRET');
  const incoming    = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const validToken  = CRON_SECRET ? incoming === CRON_SECRET : incoming === SERVICE_KEY;
  if (!validToken) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false } = body as { dryRun?: boolean };

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const report = { membersPurged: 0, profilesPurged: 0, choresReleased: 0, dryRun };

    // ── 1. Purge soft-deleted `members` rows past 7 days ─────────────────────
    const { data: expiredMembers, error: membersErr } = await db
      .from('members')
      .select('id, name, family_id')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff);

    if (membersErr) throw new Error(`members fetch: ${membersErr.message}`);

    for (const m of expiredMembers ?? []) {
      try {
        // Release any still-live chore assignment back to the pool before
        // the member row disappears — chore_tasks.assigned_to_id has no
        // FK cascade, so this is the only thing standing between "member
        // gone" and a chore stuck pointing at nobody forever.
        const { data: liveChores } = await db
          .from('chore_tasks')
          .select('id, status')
          .eq('assigned_to_id', m.id);

        const toRelease = (liveChores ?? []).filter((c: { status: string }) => !TERMINAL_CHORE_STATUSES.includes(c.status));
        if (toRelease.length && !dryRun) {
          const { error: releaseErr } = await db
            .from('chore_tasks')
            .update({ assigned_to_id: null, is_pool: true, status: 'todo' })
            .in('id', toRelease.map((c: { id: string }) => c.id));
          if (releaseErr) console.warn(`[member-purge-sweep] chore release failed for member=${m.id}:`, releaseErr.message);
          else report.choresReleased += toRelease.length;
        } else {
          report.choresReleased += toRelease.length;
        }

        // chat_messages.sender_id is intentionally left as-is (user
        // decision — see header comment). The client renders "Removed
        // member" when a sender lookup misses.

        if (!dryRun) {
          const { error: delErr } = await db.from('members').delete().eq('id', m.id);
          if (delErr) {
            console.error(`[member-purge-sweep] delete members/${m.id} failed:`, delErr.message);
            continue;
          }
        }
        report.membersPurged++;
        console.log(`[member-purge-sweep] purged member=${m.id} (${m.name})`);
      } catch (e: any) {
        console.error(`[member-purge-sweep] error purging member=${m.id}:`, e.message);
      }
    }

    // ── 2. Purge soft-deleted `profiles` rows past 7 days ─────────────────────
    // Hard-deleting the auth user cascades the profiles row (ON DELETE
    // CASCADE from auth.users), same mechanism PawBond's purge-deleted-
    // accounts relies on — no separate profiles.delete() needed/possible
    // once the auth user is gone.
    const { data: expiredProfiles, error: profilesErr } = await db
      .from('profiles')
      .select('id')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff);

    if (profilesErr) throw new Error(`profiles fetch: ${profilesErr.message}`);

    for (const p of expiredProfiles ?? []) {
      try {
        if (!dryRun) {
          const { error: deleteErr } = await db.auth.admin.deleteUser(p.id);
          if (deleteErr) {
            console.error(`[member-purge-sweep] deleteUser(${p.id}) failed:`, deleteErr.message);
            continue;
          }
        }
        report.profilesPurged++;
        console.log(`[member-purge-sweep] purged profile/auth user=${p.id}`);
      } catch (e: any) {
        console.error(`[member-purge-sweep] error purging profile=${p.id}:`, e.message);
      }
    }

    console.log('[member-purge-sweep] done', report);
    return json(report);
  } catch (err: any) {
    console.error('[member-purge-sweep] fatal error:', err.message);
    return json({ error: err.message }, 500);
  }
});
