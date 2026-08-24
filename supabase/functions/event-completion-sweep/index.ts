// FamilyCube — Edge Function: event-completion-sweep
// Runs on a schedule (Supabase cron, see migration
// 20260906110000_calendar_events_completion_status_rename.sql). Flips
// calendar_events.completion_status from 'scheduled' to 'completed' once
// the event is actually over:
//   - has an end_time  -> completed once date+end_time has passed
//   - no end_time      -> completed once date+start_time + 1h has passed
//   - all-day, no time -> completed once the whole date has passed
// "Past" was previously only a client-side derivation (hoursUntilEvent in
// hubUtils.ts) — nothing was ever persisted, so every screen re-derived it
// independently and the DB itself had no record that an event had already
// happened. Never touches a row that's already 'completed', and never
// touches a soft-deleted row.
//
// Named completion_status (not status) — calendar_events already had an
// unrelated, pre-existing status column in production (every row
// 'approved', an approval-workflow value with no migration history in
// this repo) before this feature was built; using a distinct column name
// avoids colliding with it.
//
// Cron schedule (set via the migration's cron.schedule call): every 15 min.
//
// Deploy: supabase functions deploy event-completion-sweep
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ONE_HOUR_MS = 60 * 60_000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false, familyId } = body as { dryRun?: boolean; familyId?: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = Date.now();

    let q = supabase
      .from('calendar_events')
      .select('id, date, start_time, end_time, all_day, family_id, completion_status')
      .eq('completion_status', 'scheduled')
      .is('deleted_at', null);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(`fetch: ${error.message}`);

    const due = (rows ?? []).filter(r => {
      if (!r.date) return false;
      let endMs: number;
      if (r.end_time) {
        endMs = new Date(`${r.date}T${r.end_time}:00`).getTime();
      } else if (r.start_time) {
        endMs = new Date(`${r.date}T${r.start_time}:00`).getTime() + ONE_HOUR_MS;
      } else {
        // No time at all (all-day) — completed once the whole date has passed.
        endMs = new Date(`${r.date}T23:59:59`).getTime();
      }
      if (Number.isNaN(endMs)) return false;
      return now >= endMs;
    });

    const report = { scanned: rows?.length ?? 0, completed: 0, dryRun };

    for (const r of due) {
      report.completed++;
      if (dryRun) continue;
      const { error: updErr } = await supabase
        .from('calendar_events')
        .update({ completion_status: 'completed' })
        .eq('id', r.id)
        .eq('completion_status', 'scheduled'); // CAS — don't clobber a concurrent client edit
      if (updErr) { console.warn('[event-completion-sweep] update failed', r.id, updErr.message); report.completed--; continue; }
      await supabase.from('activity_log').insert({
        entity_type: 'event', entity_id: r.id, family_id: r.family_id,
        actor_id: null, action: 'auto_completed', from_status: 'scheduled', to_status: 'completed',
        note: 'Auto-completed: event time has passed',
      }).then(() => {}).catch(() => {});
    }

    console.log('[event-completion-sweep]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[event-completion-sweep]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
