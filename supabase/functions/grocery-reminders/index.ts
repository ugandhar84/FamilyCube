// FamilyCube — Edge Function: grocery-reminders
// Two independent sweeps, run together on the same hourly cron:
//
//   1. Daily digest — once per family per local calendar day, at 6pm in
//      that family's timezone, if grocery_items has any pending (not
//      bought) rows: push all parents a one-line summary. Silent if the
//      list is empty. Dedup: one 'grocery_daily_digest' notifications row
//      per family per local date.
//
//   2. Run reminder — grocery_runs.planned_at (set via CreateRunSheet's
//      optional date/time picker) reminds the assigned shopper (and other
//      parents) 1 hour before, same T-1h single-fire pattern as
//      schedule-alerts' driver reminder. Dedup: one 'grocery_run_reminder'
//      notifications row per run.
//
// Call on a cron, e.g. hourly: 0 * * * *
// Deploy: supabase functions deploy grocery-reminders
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// "Today" as a local YYYY-MM-DD string in the given IANA zone — used only
// as a dedup key (one digest per family per local day), not for any time
// arithmetic, so a plain formatter is enough here (unlike schedule-alerts'
// localWallClockToUTC, which needs to convert a wall-clock instant).
function localDateStr(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function localHour(timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: '2-digit', hour12: false,
    }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  } catch {
    return new Date().getUTCHours();
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false } = body as { dryRun?: boolean };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const authHeader = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };
    const now = Date.now();
    const results: Record<string, unknown>[] = [];

    // ── All members, once, grouped by family ────────────────────────────────
    const { data: members, error: memErr } = await supabase
      .from('members').select('id, name, role, family_id, timezone');
    if (memErr) throw new Error(`Members fetch failed: ${memErr.message}`);

    const membersByFamily: Record<string, typeof members> = {};
    for (const m of (members ?? [])) {
      (membersByFamily[m.family_id] ??= []).push(m);
    }

    // ── 1. Daily digest ──────────────────────────────────────────────────────
    const { data: pendingItems, error: itemsErr } = await supabase
      .from('grocery_items').select('id, family_id').eq('is_bought', false);
    if (itemsErr) throw new Error(`Items fetch failed: ${itemsErr.message}`);

    const pendingCountByFamily: Record<string, number> = {};
    for (const it of (pendingItems ?? [])) {
      pendingCountByFamily[it.family_id] = (pendingCountByFamily[it.family_id] ?? 0) + 1;
    }

    for (const [familyId, familyMembers] of Object.entries(membersByFamily)) {
      const count = pendingCountByFamily[familyId] ?? 0;
      if (count === 0) { results.push({ familyId, digest: 'skipped', reason: 'list_empty' }); continue; }

      const parents = (familyMembers ?? []).filter(m => m.role === 'parent');
      if (parents.length === 0) { results.push({ familyId, digest: 'skipped', reason: 'no_parents' }); continue; }

      // One representative member's timezone stands in for "the family's"
      // timezone — same convention ask-cube/index.ts already uses (a family
      // shares one household clock; there's no separate family-level tz
      // column).
      const tz = parents[0].timezone || familyMembers[0]?.timezone || 'UTC';
      const hour = localHour(tz);
      if (hour !== 18) { results.push({ familyId, digest: 'skipped', reason: `not_6pm_local (hour=${hour})` }); continue; }

      const today = localDateStr(tz);
      // Queries the real 'grocery_daily_digest' NotifType directly — this
      // used to route through family-notifier's generic 'custom' type,
      // which always persists as type='custom' regardless of what's inside
      // payload.data, so this exact dedup check could never find its own
      // prior fire and re-fired on every hourly sweep once 6pm local hit
      // (confirmed live: the equivalent bug in the run-reminder sweep below
      // fired 4x for one run before both were given real NotifTypes).
      const { data: already } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'grocery_daily_digest')
        .eq('family_id', familyId)
        .gte('created_at', `${today}T00:00:00Z`)
        .limit(1);
      if (already?.length) { results.push({ familyId, digest: 'skipped', reason: 'already_sent_today' }); continue; }

      const notifBody = count === 1 ? '1 item waiting on the grocery list' : `${count} items waiting on the grocery list`;
      const memberIds = parents.map(p => p.id);

      if (!dryRun) {
        await fetch(notifierUrl, {
          method: 'POST', headers: authHeader,
          body: JSON.stringify({
            type: 'grocery_daily_digest', memberIds, familyId,
            payload: { count, body: notifBody },
            persist: true,
          }),
        }).catch(e => console.warn('[grocery-reminders] digest notifier error:', e.message));
      }

      results.push({ familyId, digest: 'fired', count });
    }

    // ── 2. Run reminder (T-1h before planned_at) ────────────────────────────
    const twoHoursFromNow = new Date(now + 2 * 3600_000).toISOString();
    const { data: upcomingRuns, error: runsErr } = await supabase
      .from('grocery_runs')
      .select('id, family_id, name, store, status, shopper_id, planned_at')
      .neq('status', 'done')
      .not('planned_at', 'is', null)
      .gte('planned_at', new Date(now).toISOString())
      .lte('planned_at', twoHoursFromNow);
    if (runsErr) throw new Error(`Runs fetch failed: ${runsErr.message}`);

    for (const run of (upcomingRuns ?? [])) {
      const plannedMs = new Date(run.planned_at as string).getTime();
      const hoursAway = (plannedMs - now) / 3600_000;
      if (hoursAway > 1.25 || hoursAway < 0.25) {
        results.push({ runId: run.id, reminder: 'skipped', reason: `hours_away=${hoursAway.toFixed(2)} not in T-1h window` });
        continue;
      }

      // Same real-NotifType fix as the digest dedup above — checks
      // payload.run_id as persisted directly (family-notifier spreads the
      // call's own `payload` into the notification row's data column
      // verbatim, alongside buildMessage's own data fields).
      const { data: already } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'grocery_run_reminder')
        .eq('data->>run_id', run.id)
        .limit(1);
      if (already?.length) { results.push({ runId: run.id, reminder: 'skipped', reason: 'already_sent' }); continue; }

      const familyMembers = membersByFamily[run.family_id] ?? [];
      const recipients = familyMembers.filter(m => m.role === 'parent' || m.id === run.shopper_id);
      if (recipients.length === 0) { results.push({ runId: run.id, reminder: 'skipped', reason: 'no_recipients' }); continue; }

      const memberIds = recipients.map(m => m.id);

      if (!dryRun) {
        await fetch(notifierUrl, {
          method: 'POST', headers: authHeader,
          body: JSON.stringify({
            type: 'grocery_run_reminder', memberIds, familyId: run.family_id,
            payload: { run_id: run.id, store: run.store, runName: run.name },
            persist: true,
          }),
        }).catch(e => console.warn('[grocery-reminders] run notifier error:', e.message));
      }

      results.push({ runId: run.id, reminder: 'fired' });
    }

    return json({ ok: true, dryRun, results });

  } catch (err: any) {
    console.error('[grocery-reminders] fatal:', err);
    return json({ ok: false, error: err.message }, 500);
  }
});
