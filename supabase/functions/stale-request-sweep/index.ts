// FamilyCube — Edge Function: stale-request-sweep
// Runs on a schedule (Supabase cron). Deletes a kid's ride/event request
// (KidRequestModal / EventFormModal's isKid path) that a parent never
// approved AND whose own event time has already passed by more than 24
// hours — the request is stale (the moment it was for has come and gone
// with nobody acting on it), so it's cleaned up rather than sitting
// forever in approvalPending limbo. Only ever touches rows that are still
// approvalPending=true — anything a parent has approved, declined, or
// otherwise acted on is untouched no matter how old.
//
// Cron schedule (set in Supabase Dashboard → Edge Functions → Schedule):
//   every hour: 0 * * * *
//
// Deploy: supabase functions deploy stale-request-sweep
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// start_time is stored as a display string ("6:00 PM", 12-hour, what
// fmtTimeLabel writes) or occasionally plain 24-hour "HH:MM" — feeding a
// 12-hour string straight into a parseable-date-string template silently
// misreads every PM time as its AM equivalent. Same helper
// call-reminder-sweeper/schedule-alerts already use for the same reason.
function to24Hour(raw: string): string | null {
  const clean = raw.trim().toUpperCase();
  const ampm = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const min = ampm[2];
    if (ampm[3] === 'PM' && h !== 12) h += 12;
    if (ampm[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  const plain = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`;
  return null;
}

// date/start_time are local wall-clock values with no offset of their own —
// calendar_events.timezone exists and is populated by the app but this
// function (a Deno edge function running in UTC) previously parsed them as
// if they WERE UTC. A ride request for "6:00 PM" in America/Los_Angeles
// (UTC-7 in summer) was treated as 6:00 PM UTC — 7 hours early — shifting
// the 24h staleness grace window by the same amount: auto-deleting a still-
// relevant pending request up to 7 hours before a parent's real 24 hours to
// act had elapsed (zones behind UTC), or letting a genuinely stale request
// sit for several extra hours (zones ahead of UTC). Same conversion
// technique as call-reminder-sweeper's localWallClockToUTC.
function localWallClockToUTC(wallClock: string, timeZone: string): Date {
  const naiveUTC = new Date(`${wallClock}Z`);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(naiveUTC);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
    const asIfLocal = Date.UTC(
      Number(get('year')), Number(get('month')) - 1, Number(get('day')),
      Number(get('hour')), Number(get('minute')), Number(get('second')),
    );
    const offsetMs = asIfLocal - naiveUTC.getTime();
    return new Date(naiveUTC.getTime() - offsetMs);
  } catch {
    return naiveUTC;
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
    const GRACE_MS = 24 * 60 * 60_000;

    // Only still-pending requests are ever candidates — an approved/
    // declined/otherwise-actioned event is never touched by this sweep,
    // regardless of age.
    let q = supabase
      .from('calendar_events')
      .select('id, title, date, start_time, timezone, member_id, family_id, approval_pending')
      .eq('approval_pending', true)
      .is('deleted_at', null);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(`fetch: ${error.message}`);

    const stale = (rows ?? []).filter(r => {
      if (!r.date) return false;
      const t24 = to24Hour(r.start_time ?? '00:00') ?? '00:00';
      const eventMs = localWallClockToUTC(`${r.date}T${t24}:00`, (r as any).timezone || 'UTC').getTime();
      if (Number.isNaN(eventMs)) return false;
      return now - eventMs > GRACE_MS;
    });

    const report = { scanned: rows?.length ?? 0, deleted: 0, dryRun };

    // Was one DELETE + one activity_log INSERT per stale row, in a loop —
    // batched into one DELETE with .in() and one multi-row activity_log
    // insert. Stale-row counts are small today, but this scales cleanly if
    // that changes, at no extra complexity cost.
    report.deleted = stale.length;
    if (!dryRun && stale.length > 0) {
      const staleIds = stale.map(r => r.id);
      const { error: delErr } = await supabase.from('calendar_events').delete().in('id', staleIds);
      if (delErr) {
        console.warn('[stale-request-sweep] batched delete failed', delErr.message);
      } else {
        // Best-effort audit trail entries — matches the shared activity_log
        // system (lib/activityLog.ts) other event mutations already write
        // to, so a parent looking at a kid's history isn't left wondering
        // where an old request went.
        await supabase.from('activity_log').insert(
          stale.map(r => ({
            entity_type: 'event', entity_id: r.id, family_id: r.family_id,
            actor_id: null, action: 'deleted', note: 'Auto-removed: never approved, 24h past its time',
          })),
        ).then(() => {}).catch(() => {});
      }
    }

    console.log('[stale-request-sweep]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[stale-request-sweep]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
