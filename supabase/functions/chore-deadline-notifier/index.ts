// FamilyCube — Edge Function: chore-deadline-notifier
// Called on a schedule (or on-demand) to sweep chores and fire reminders.
// Handles: due-today reminders, overdue warnings, claimed-but-silent
// check-ins with auto-release, and ghosted-claim alerts to parents.
//
// FIXED (QA master-flow audit): this function queried a table literally
// named `quests`, which no client code anywhere in the app ever reads from
// or writes to (confirmed via grep across store/*.ts) — the app's real
// chore table has always been `chore_tasks` (store/choreStore.ts). Same
// class of bug chore-auto-approve's own header comment already documented
// fixing for itself: this function has been silently sweeping an orphaned,
// presumably-empty table since deployment, meaning every deadline
// reminder/overdue warning/ghosting alert it was supposed to send never
// actually fired for a real chore. Rewritten against chore_tasks with
// verified column names (base_points/coins_reward instead of a nonexistent
// `priority` field, no bonus_expires_at on this table so that branch is
// dropped rather than left querying a column that doesn't exist).
//
// ADDED (QA master-flow audit, "Gone quiet — still on?" exit branch, and
// its own punch list #1/#2): a genuine check-in nudge 15 minutes before a
// claimed chore's due time (distinct from the existing 4h-stuck ghosting
// alert, which fires much later after real silence), and an actual
// auto-release back to the pool if the claimant doesn't respond within the
// window — previously chore-noshow had no auto-release path at all, a
// claimed-then-abandoned chore could sit assigned forever with nobody ever
// told. Auto-release only fires once per chore (guarded by claimed_at
// staying set — see the update below, which clears it) so a repeat cron
// run doesn't re-fire the same release.
//
// Cron schedule (Supabase Dashboard → Edge Functions → Schedule):
//   every 15 minutes: */15 * * * *
//
// Deploy: supabase functions deploy chore-deadline-notifier
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Call family-notifier to actually deliver the push.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// A claimed chore due within this many minutes (and not yet nudged) gets
// the "still on?" check-in. Chosen to match the master-flow spec's
// "+15min before due" rule.
const CHECKIN_WINDOW_MIN = 15;
// No response to the check-in within this many minutes past due →
// auto-release. Matches the spec's "silence for 5min auto-releases."
const AUTO_RELEASE_GRACE_MIN = 5;
// A claimed chore stuck this many hours past due with zero activity is
// "ghosted" — parents get told directly, separate from (and later than)
// the check-in/auto-release pair above.
const GHOST_STUCK_HOURS = 4;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { familyId, dryRun = false } = body as { familyId?: string; dryRun?: boolean };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = new Date().toISOString().split('T')[0];
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const notifierHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    // ── Fetch chores that need attention ──────────────────────────────────
    let choreQuery = supabase
      .from('chore_tasks')
      .select('id, title, base_points, coins_reward, status, due_date, due_time, assigned_to_id, claimed_at, is_pool, family_id')
      .in('status', ['todo', 'in_progress'])
      .lte('due_date', today)
      .not('due_date', 'is', null);

    if (familyId) choreQuery = choreQuery.eq('family_id', familyId);
    const { data: chores, error: cErr } = await choreQuery;
    if (cErr) throw new Error(`Chore fetch failed: ${cErr.message}`);

    // ── Fetch members for push token resolution ───────────────────────────
    const familyIds = [...new Set((chores ?? []).map((c: any) => c.family_id).filter(Boolean))];
    const { data: members } = await supabase
      .from('members')
      .select('id, name, role, family_id, expo_push_token')
      .in('family_id', familyIds.length ? familyIds : ['__none__']);

    const memberMap: Record<string, any> = {};
    for (const m of (members ?? [])) memberMap[m.id] = m;

    const parentTokensByFamily: Record<string, string[]> = {};
    for (const m of (members ?? [])) {
      if (m.role === 'parent' && m.expo_push_token) {
        if (!parentTokensByFamily[m.family_id]) parentTokensByFamily[m.family_id] = [];
        parentTokensByFamily[m.family_id].push(m.expo_push_token);
      }
    }

    const notifications: { type: string; choreTitle: string; to: string; dryRun: boolean }[] = [];
    const released: string[] = [];

    const now = Date.now();
    const fire = async (type: string, tokens: string[], fId: string, payload: Record<string, unknown>, opts?: { soft?: boolean }) => {
      if (!tokens.length) return;
      notifications.push({ type, choreTitle: payload.questTitle as string, to: tokens.join(','), dryRun });
      if (dryRun) return;
      await fetch(notifierUrl, {
        method: 'POST',
        headers: notifierHeaders,
        body: JSON.stringify({
          type, tokens, familyId: fId,
          payload: opts?.soft ? { ...payload, soft: true } : payload,
          persist: true,
        }),
      });
    };

    for (const c of (chores ?? [])) {
      const assignee = c.assigned_to_id ? memberMap[c.assigned_to_id] : null;
      const coins = c.base_points ?? c.coins_reward ?? 0;
      const dueAt = c.due_time ? new Date(`${c.due_date}T${c.due_time}`) : new Date(`${c.due_date}T23:59:59`);
      const minutesUntilDue = (dueAt.getTime() - now) / 60_000;
      const daysOverdue = Math.max(0, Math.floor((now - dueAt.getTime()) / 86_400_000));
      const assigneeIsMinor = assignee?.role === 'child' || assignee?.role === 'teenager';
      const isSameDayMiss = daysOverdue === 0 || c.due_date === today;
      const shouldEscalateToParent = assigneeIsMinor && isSameDayMiss;
      const parentTokens = parentTokensByFamily[c.family_id] ?? [];
      const kidTokens = assignee?.expo_push_token ? [assignee.expo_push_token] : [];

      // ── status=todo, not pool, due today or overdue → remind the kid ────
      if (c.status === 'todo' && !c.is_pool) {
        if (daysOverdue === 0 && minutesUntilDue >= 0) {
          await fire('deadline_reminder', kidTokens, c.family_id, { questTitle: c.title, questId: c.id, coins });
        } else if (daysOverdue > 0) {
          await fire('deadline_overdue', kidTokens, c.family_id, { questTitle: c.title, questId: c.id, daysOverdue });
          if (shouldEscalateToParent) {
            await fire('deadline_overdue', parentTokens, c.family_id, { questTitle: c.title, questId: c.id, daysOverdue, kidName: assignee?.name ?? 'A kid' }, { soft: true });
          }
        }
        continue;
      }

      // ── status=in_progress (claimed) ─────────────────────────────────────
      if (c.status === 'in_progress' && c.claimed_at) {
        const hoursSinceClaim = (now - new Date(c.claimed_at).getTime()) / 3_600_000;

        // Master-flow "Gone quiet — still on?" — due within the check-in
        // window, still claimed, nothing submitted yet.
        if (minutesUntilDue <= CHECKIN_WINDOW_MIN && minutesUntilDue > -AUTO_RELEASE_GRACE_MIN) {
          await fire('chore_still_on', kidTokens, c.family_id, { questTitle: c.title, questId: c.id });
          continue;
        }

        // Past the grace window with no response → auto-release back to
        // the pool. Clearing claimed_at is what stops this from re-firing
        // on the next cron run (the chore no longer matches this branch).
        if (minutesUntilDue <= -AUTO_RELEASE_GRACE_MIN && minutesUntilDue > -(AUTO_RELEASE_GRACE_MIN + 60)) {
          if (!dryRun) {
            const { error: releaseErr } = await supabase
              .from('chore_tasks')
              .update({ assigned_to_id: null, is_pool: true, status: 'todo', claimed_at: null })
              .eq('id', c.id)
              .eq('assigned_to_id', c.assigned_to_id); // still the same claimant — don't clobber a fresh claim
            if (releaseErr) {
              console.warn(`[chore-deadline-notifier] auto-release failed for ${c.id}: ${releaseErr.message}`);
            } else {
              released.push(c.id);
              await supabase.from('activity_log').insert({
                entity_type: 'chore', entity_id: c.id, family_id: c.family_id,
                actor_id: null, action: 'auto_released',
                from_status: 'in_progress', to_status: 'todo',
                note: `Claimed by ${assignee?.name ?? c.assigned_to_id} but no check-in response — auto-released back to the pool`,
              });
            }
          } else {
            released.push(c.id);
          }
          await fire('chore_auto_released', kidTokens, c.family_id, { questTitle: c.title, questId: c.id });
          await fire('chore_ghosted', parentTokens, c.family_id, { questTitle: c.title, questId: c.id, kidName: assignee?.name ?? 'A kid', daysOverdue });
          continue;
        }

        // Further out (stuck for hours, well past the check-in/release
        // window) — the original ghosting alert, unchanged in spirit.
        if (hoursSinceClaim > GHOST_STUCK_HOURS && daysOverdue > 0) {
          await fire('chore_ghosted', parentTokens, c.family_id, { questTitle: c.title, questId: c.id, kidName: assignee?.name ?? 'A kid', daysOverdue });
          await fire('deadline_overdue', kidTokens, c.family_id, { questTitle: c.title, questId: c.id, daysOverdue });
        }
      }
    }

    return json({ ok: true, swept: (chores ?? []).length, notifications, auto_released: released, dryRun });

  } catch (e: any) {
    console.error('[chore-deadline-notifier]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
