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
// date/start_time/end_time are the FAMILY'S LOCAL wall-clock values (same
// convention the client uses everywhere — hoursUntilEvent constructs a
// local Date from them), not UTC. Deno runs this function in UTC, so
// `new Date("2026-08-24T15:00:00")` would be parsed as 15:00 UTC, not
// 15:00 in the family's actual zone — up to 8 hours of skew for a US
// family, marking events completed hours early. Resolves each row's real
// UTC instant using its own `timezone` column (an IANA zone name written
// by the client at event-creation time, e.g. "America/Los_Angeles") via
// Intl.DateTimeFormat's offset, falling back to UTC only if a row somehow
// has no timezone recorded.
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

// Returns the UTC epoch ms for a local wall-clock date+time in the given
// IANA timezone, e.g. (2026, 8, 24, 15, 0, "America/Los_Angeles") ->
// 2026-08-24T22:00:00Z (15:00 PDT). Works by formatting a UTC guess in the
// target zone and correcting for the offset — handles DST correctly since
// it asks Intl for the actual offset on that specific date, not a fixed one.
function zonedWallClockToUtcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): number {
  const utcGuessMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcGuessMs)).map(p => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  // asIfUtc is what utcGuessMs LOOKS LIKE when read in `timeZone` — the
  // difference is the zone's offset at this instant; subtract it to land
  // on the UTC instant that actually displays as the wall-clock we want.
  return utcGuessMs - (asIfUtc - utcGuessMs);
}

function eventEndUtcMs(r: { date: string; start_time: string | null; end_time: string | null; timezone: string | null }): number | null {
  const dateMatch = r.date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;
  const [, yStr, moStr, dStr] = dateMatch;
  const y = Number(yStr), mo = Number(moStr), d = Number(dStr);
  const tz = r.timezone || 'UTC';

  let h = 23, mi = 59, s = 59, extraMs = 0;
  if (r.end_time) {
    const [hh, mm] = r.end_time.split(':').map(Number);
    h = hh; mi = mm; s = 0;
  } else if (r.start_time) {
    const [hh, mm] = r.start_time.split(':').map(Number);
    h = hh; mi = mm; s = 0;
    extraMs = ONE_HOUR_MS;
  }
  try {
    return zonedWallClockToUtcMs(y, mo, d, h, mi, s, tz) + extraMs;
  } catch {
    // Unknown/invalid IANA zone string — fall back to naive UTC parsing
    // rather than dropping the row from the sweep entirely.
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).getTime() + extraMs;
  }
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

    const now = Date.now();

    let q = supabase
      .from('calendar_events')
      .select('id, date, start_time, end_time, all_day, family_id, completion_status, timezone')
      .eq('completion_status', 'scheduled')
      .is('deleted_at', null);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(`fetch: ${error.message}`);

    const due = (rows ?? []).filter(r => {
      if (!r.date) return false;
      const endMs = eventEndUtcMs(r as any);
      if (endMs === null || Number.isNaN(endMs)) return false;
      return now >= endMs;
    });

    const report = { scanned: rows?.length ?? 0, completed: 0, dryRun };

    if (due.length > 0 && !dryRun) {
      // Single batched UPDATE (still CAS-guarded via the same
      // completion_status='scheduled' predicate) instead of one round trip
      // per row — this sweep runs every 15 minutes and can touch dozens of
      // rows across every family at once.
      const { data: updated, error: updErr } = await supabase
        .from('calendar_events')
        .update({ completion_status: 'completed' })
        .in('id', due.map(r => r.id))
        .eq('completion_status', 'scheduled')
        .select('id, family_id');
      if (updErr) {
        console.warn('[event-completion-sweep] batch update failed', updErr.message);
      } else {
        report.completed = updated?.length ?? 0;
        if (updated && updated.length > 0) {
          // Best-effort audit trail — fire-and-forget, batched in one insert.
          supabase.from('activity_log').insert(updated.map(r => ({
            entity_type: 'event', entity_id: r.id, family_id: r.family_id,
            actor_id: null, action: 'auto_completed', from_status: 'scheduled', to_status: 'completed',
            note: 'Auto-completed: event time has passed',
          }))).then(() => {}).catch(() => {});
        }
      }
    } else if (dryRun) {
      report.completed = due.length;
    }

    console.log('[event-completion-sweep]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[event-completion-sweep]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
