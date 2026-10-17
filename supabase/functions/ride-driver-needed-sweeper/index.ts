// FamilyCube — Edge Function: ride-driver-needed-sweeper
// Time-based escalation half of the "driver declined, nobody picked it up"
// gap (see store/eventStore.ts's declineEventAssignment/updateEvent own
// comments for the immediate-notify half, which already fires the moment a
// decline leaves a ride driverless). That immediate ping is a single shot —
// if it gets missed/ignored, nothing re-raises it as the event gets closer.
// This sweep finds every still-driverless, rideRequired event due within
// the next ESCALATION_WINDOW_MINUTES, and broadcasts a "still no driver"
// nudge to every parent, throttled by COOLDOWN_MINUTES so a frequent cron
// run doesn't spam the same still-unresolved ride every pass.
//
// Only ever touches rows that are genuinely still driverless (driver_id is
// null) — the instant a parent picks it up, this sweep has nothing to do
// for that row; no separate "clear the escalation" step needed.
//
// Cron schedule (set in Supabase Dashboard → Edge Functions → Schedule):
//   every 15 minutes: */15 * * * *
//
// Deploy: supabase functions deploy ride-driver-needed-sweeper
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Only escalate for a ride coming up soon — a driverless event a week out
// doesn't need a re-ping every 15 minutes, just the one immediate notify
// that already fired. 3 hours covers the realistic "still need to find
// someone before this happens" window without being noisy for far-out rides.
const ESCALATION_WINDOW_MINUTES = 180;
// Don't re-escalate the same still-driverless ride more than once per hour,
// even though the sweep itself runs every 15 minutes.
const COOLDOWN_MINUTES = 60;

// date/start_time are local wall-clock values tied to calendar_events.timezone
// — same conversion stale-request-sweep/call-reminder-sweeper already use,
// so "due within N minutes" is computed in the family's own zone, not as if
// the wall-clock string were UTC.
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
    // Safe UTC superset for the date filter — a family far ahead/behind UTC
    // can have a "due within 3h" event that falls on the UTC-adjacent date;
    // the real per-row check (minutesUntil) below is what actually gates it.
    const todayUTC = new Date(now).toISOString().slice(0, 10);
    const tomorrowUTC = new Date(now + 24 * 3600_000).toISOString().slice(0, 10);

    let q = supabase
      .from('calendar_events')
      .select('id, title, date, start_time, timezone, family_id, ride_required, driver_id, driver_name, driver_needed_last_notified_at')
      .eq('ride_required', true)
      .is('driver_id', null)
      .not('start_time', 'is', null)
      .gte('date', todayUTC)
      .lte('date', tomorrowUTC)
      .is('deleted_at', null);
    if (familyId) q = q.eq('family_id', familyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(`fetch: ${error.message}`);

    const cooldownMs = COOLDOWN_MINUTES * 60_000;
    const windowMs = ESCALATION_WINDOW_MINUTES * 60_000;

    const candidates = (rows ?? []).filter(r => {
      const hhmm = to24Hour(r.start_time!);
      if (!hhmm) return false;
      const tz = (r as any).timezone || 'UTC';
      const at = localWallClockToUTC(`${r.date}T${hhmm}:00`, tz);
      const minutesUntil = (at.getTime() - now) / 60000;
      // Still relevant (not already past) and inside the escalation window.
      if (minutesUntil < 0 || minutesUntil > ESCALATION_WINDOW_MINUTES) return false;
      const last = r.driver_needed_last_notified_at ? new Date(r.driver_needed_last_notified_at).getTime() : 0;
      return now - last >= cooldownMs;
    });

    const report = { scanned: (rows ?? []).length, candidates: candidates.length, notified: 0, dryRun };

    // Pre-batch every distinct family's parents into one query instead of
    // one per candidate event.
    const familyIds = [...new Set(candidates.map(c => c.family_id))];
    const parentsByFamily = new Map<string, string[]>();
    if (familyIds.length) {
      const { data: memberRows } = await supabase
        .from('members')
        .select('id, family_id, role')
        .in('family_id', familyIds)
        .eq('role', 'parent');
      for (const m of (memberRows ?? [])) {
        const list = parentsByFamily.get(m.family_id) ?? [];
        list.push(m.id);
        parentsByFamily.set(m.family_id, list);
      }
    }

    for (const ev of candidates) {
      const parentIds = parentsByFamily.get(ev.family_id) ?? [];
      if (!parentIds.length) continue;

      report.notified++;
      if (dryRun) continue;

      const { error: notifyErr } = await supabase.functions.invoke('family-notifier', {
        body: {
          type: 'ride_driver_needed',
          familyId: ev.family_id,
          memberIds: parentIds,
          payload: { eventTitle: ev.title, eventId: ev.id, escalation: true },
          persist: true,
        },
      });
      if (notifyErr) { console.warn('[ride-driver-needed-sweeper] family-notifier failed', ev.id, notifyErr.message); continue; }

      await supabase.from('calendar_events')
        .update({ driver_needed_last_notified_at: new Date().toISOString() })
        .eq('id', ev.id);
    }

    console.log('[ride-driver-needed-sweeper]', JSON.stringify(report));
    return json({ ok: true, sweptAt: new Date().toISOString(), ...report });

  } catch (e: any) {
    console.error('[ride-driver-needed-sweeper]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
