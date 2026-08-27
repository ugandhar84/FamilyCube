// FamilyCube — Edge Function: schedule-conflict-sweep
// Server-side re-implementation of ParentView.tsx's case-B conflict
// detection ("helper/driver double-booked": same assignee name, two
// timed events, <30 minutes apart, same day, non-Work, neither
// rejected) — the ONLY case ported here, since it's the one directly
// reported as needing a push (a parent double-booked on two rides has a
// real, time-sensitive problem; kid-double-booked and work-overlap cases
// stay purely client-side/Hub-banner for now). Runs on a schedule,
// notifies every conflicted parent once per distinct conflict via
// family-notifier's new 'schedule_conflict' type, and stamps
// conflict_notified_at so it doesn't re-push the same still-unresolved
// pair on every run. Skips anything already conflict_acknowledged
// (dismissed from the Hub banner — see hubComponents.tsx's
// ConflictClusterCard) or already conflict_notified_at'd for the SAME
// pairing (detected by re-checking the pairing key, not just presence of
// the timestamp — see below).
//
// Cron schedule (set in Supabase Dashboard → Edge Functions → Schedule):
//   every 15 minutes: */15 * * * *
//
// Deploy: supabase functions deploy schedule-conflict-sweep
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return Math.abs((ah * 60 + am) - (bh * 60 + bm));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false, familyId } = body as { dryRun?: boolean; familyId?: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = new Date().toISOString().slice(0, 10);

    let q = supabase
      .from('calendar_events')
      .select('id, title, date, start_time, category, family_id, helper_name, helper_status, driver_name, driver_status, conflict_acknowledged, conflict_notified_pair')
      .eq('date', today)
      .not('start_time', 'is', null)
      .neq('category', 'Work')
      .eq('conflict_acknowledged', false)
      .is('deleted_at', null);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(`fetch: ${error.message}`);

    const events = (rows ?? []).filter(r => {
      const status = r.helper_name ? r.helper_status : r.driver_status;
      const name = r.helper_name ?? r.driver_name;
      return !!name && status !== 'rejected';
    });

    // Group candidate pairs the same way ParentView.tsx's O(n²) scan does
    // (today's event volume per family is small — dozens, not thousands —
    // so this stays cheap without needing a smarter join).
    type Row = typeof events[number];
    const conflicts: { a: Row; b: Row; assigneeName: string; familyId: string }[] = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i], b = events[j];
        if (a.family_id !== b.family_id) continue;
        const aName = a.helper_name ?? a.driver_name;
        const bName = b.helper_name ?? b.driver_name;
        if (aName !== bName) continue;
        if (minutesBetween(a.start_time!, b.start_time!) < 30) {
          conflicts.push({ a, b, assigneeName: aName!, familyId: a.family_id });
        }
      }
    }

    const report = { scanned: events.length, conflictsFound: conflicts.length, notified: 0, dryRun };

    // Was one members lookup per conflict pair (each re-querying by
    // family_id+name) — pre-batch every distinct (family_id, name)
    // assignee across all conflicts into one query instead.
    const familyIds = [...new Set(conflicts.map(c => c.familyId))];
    const names = [...new Set(conflicts.map(c => c.assigneeName))];
    const memberByKey = new Map<string, string>();
    if (familyIds.length > 0 && names.length > 0) {
      const { data: memberRows } = await supabase
        .from('members')
        .select('id, family_id, name')
        .in('family_id', familyIds)
        .in('name', names);
      for (const m of (memberRows ?? [])) memberByKey.set(`${m.family_id}:${m.name}`, m.id);
    }

    for (const { a, b, assigneeName, familyId: fid } of conflicts) {
      // Pairing key so re-notifying is scoped to THIS specific pair, not
      // just "this event has ever been notified about anything" — if a
      // gets reassigned away and then a NEW conflict forms with a
      // different event c, a's stale conflict_notified_pair from the a/b
      // pairing shouldn't suppress the new a/c notification.
      const pairKey = [a.id, b.id].sort().join(':');
      const alreadyNotifiedThisPair = a.conflict_notified_pair === pairKey || b.conflict_notified_pair === pairKey;
      if (alreadyNotifiedThisPair) continue;

      const assigneeMemberId = memberByKey.get(`${fid}:${assigneeName}`);
      if (!assigneeMemberId) continue; // external/free-text name, no member to notify

      const reason = `${assigneeName.split(' ')[0]} assigned to 2 events`;
      report.notified++;

      if (dryRun) continue;

      const { error: notifyErr } = await supabase.functions.invoke('family-notifier', {
        body: {
          type: 'schedule_conflict',
          familyId: fid,
          memberIds: [assigneeMemberId],
          payload: { reason, eventIds: [a.id, b.id] },
        },
      });
      if (notifyErr) { console.warn('[schedule-conflict-sweep] family-notifier failed', a.id, b.id, notifyErr.message); continue; }

      // Was two separate .update() calls setting identical values on a and
      // b — merged into one .in(['a.id','b.id']) update.
      const notifiedAt = new Date().toISOString();
      await supabase.from('calendar_events')
        .update({ conflict_notified_pair: pairKey, conflict_notified_at: notifiedAt })
        .in('id', [a.id, b.id]);
    }

    console.log('[schedule-conflict-sweep]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[schedule-conflict-sweep]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
