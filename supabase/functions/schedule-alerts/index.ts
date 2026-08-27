// FamilyCube — Edge Function: schedule-alerts
// Fires push notifications for unresolved driver situations at the right time windows.
// Call on a cron, e.g. every 30 minutes: */30 * * * *
//
// Logic:
//   For each event today where driver IS NULL or driverStatus = 'rejected' AND location is not null:
//     - Notify at T-4h (and up to T-3h, to allow for cron jitter)
//     - Notify again at T-1h (second warning)
//     - Deduped: max 1 notification per window (4h / 1h) per event per day
//
// Deploy: supabase functions deploy schedule-alerts
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

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// start_time is stored as a display string from the app's time pickers —
// "2:05 AM" (12-hour, what fmtTimeLabel writes) or occasionally a plain
// 24-hour "HH:MM". Feeding a 12-hour string straight into hoursUntil's old
// `timeStr.split(':').map(Number)` silently misread every PM time as its AM
// equivalent (e.g. "6:00 PM" parsed as 6:00, 12 hours early). Same helper
// call-reminder-sweeper already uses for the same reason. Returns 24-hour
// "HH:MM", or null if unparseable.
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
// calendar_events.timezone exists and is populated by the app (see
// eventStore.ts) but this function, a Deno edge function running in UTC,
// previously parsed them as if they WERE UTC. A family in America/Los_Angeles
// with a 6:00 PM local event had it treated as 6:00 PM UTC (11:00 AM local)
// — the T-4h/T-1h reminder windows fired roughly 7 hours too early relative
// to the family's actual clock. Same conversion technique as
// call-reminder-sweeper's localWallClockToUTC: format the same instant in
// both UTC and the target zone via Intl.DateTimeFormat, diff to get the
// zone's current offset (naturally DST-aware for the date being checked),
// then apply it to the wall-clock value.
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

// Hours from now until a local date + display-time string, correctly
// converted through the event's own IANA timezone. Returns null if the
// time string can't be parsed (e.g. missing/malformed start_time).
function hoursUntil(dateStr: string, timeStr: string, timeZone: string): number | null {
  const t24 = to24Hour(timeStr);
  if (!t24) return null;
  const eventAt = localWallClockToUTC(`${dateStr}T${t24}:00`, timeZone || 'UTC');
  return (eventAt.getTime() - Date.now()) / 3_600_000;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { familyId, dryRun = false } = body as { familyId?: string; dryRun?: boolean };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // A local event date can map to either the day before or after in UTC
    // depending on the family's offset (see localWallClockToUTC above) —
    // querying only exactly today's UTC date could miss rows whose LOCAL
    // date is technically yesterday or tomorrow in UTC. Same ±1-day window
    // pattern as call-reminder-sweeper; the per-row hoursUntil() conversion
    // below is the real correctness check, this is just a cheap prefilter.
    const yesterday = new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 24 * 3600_000).toISOString().slice(0, 10);
    const dateWindow = [yesterday, today, tomorrow];
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const authHeader = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    // ── 1. Fetch nearby-day events that need a driver ───────────────────────────
    // Was querying the orphaned `events` table — a real table with RLS
    // policies but zero writers anywhere in the app or any Edge Function.
    // The live table (used by store/eventStore.ts for every read/write) is
    // `calendar_events`, whose driver columns are `driver_name`/
    // `driver_status` (not `driver`) and whose time column is `start_time`
    // (not `time`). Querying the wrong table meant this cron always saw
    // zero events and never fired a single driver-reminder push. `timezone`
    // is also pulled in now — see localWallClockToUTC/hoursUntil above.
    let eventsQuery = supabase
      .from('calendar_events')
      .select('id, title, date, start_time, timezone, member_id, location, driver_name, driver_status, family_id')
      .in('date', dateWindow)
      .not('location', 'is', null)
      .not('start_time', 'is', null);

    if (familyId) eventsQuery = eventsQuery.eq('family_id', familyId);

    const { data: rawEvents, error: evErr } = await eventsQuery;
    if (evErr) throw new Error(`Events fetch failed: ${evErr.message}`);
    const events = (rawEvents ?? []).map((ev: any) => ({ ...ev, time: ev.start_time, driver: ev.driver_name }));

    // Filter to events with no driver or rejected driver
    const needsDriver = (events ?? []).filter((ev: any) =>
      !ev.driver || ev.driver_status === 'rejected'
    );

    if (needsDriver.length === 0) {
      return json({ ok: true, fired: 0, message: 'No events needing driver today' });
    }

    // ── 2. Fetch members for each family in scope ──────────────────────────────
    const familyIds = [...new Set(needsDriver.map((ev: any) => ev.family_id).filter(Boolean))];

    const { data: members } = await supabase
      .from('members')
      .select('id, name, role, family_id')
      .in('family_id', familyIds.length ? familyIds : ['__none__']);

    // Parent member ids per family (parents get the alert) — token
    // resolution (member_device_tokens, falling back to
    // members.expo_push_token) now happens inside family-notifier itself,
    // given just the memberIds below.
    const parentsByFamily: Record<string, { id: string }[]> = {};
    for (const m of (members ?? [])) {
      if (m.role === 'parent') {
        if (!parentsByFamily[m.family_id]) parentsByFamily[m.family_id] = [];
        parentsByFamily[m.family_id].push({ id: m.id });
      }
    }

    // Member lookup for kid name
    const memberById: Record<string, any> = {};
    for (const m of (members ?? [])) memberById[m.id] = m;

    // ── 3. Fetch already-sent notifications today to dedup ────────────────────
    const eventIds = needsDriver.map((ev: any) => ev.id);
    const { data: sentRows } = await supabase
      .from('notifications')
      .select('data')
      .eq('type', 'schedule_alert')
      .gte('created_at', `${yesterday}T00:00:00Z`)
      .in('data->>event_id', eventIds);

    // Build a set of "event_id:window" combos already sent today
    const alreadySent = new Set<string>();
    for (const row of (sentRows ?? [])) {
      const d = row.data as any;
      if (d?.event_id && d?.window) alreadySent.add(`${d.event_id}:${d.window}`);
    }

    // ── 4. Evaluate each event and fire if in the right window ────────────────
    const results: { event_id: string; window: string; fired: boolean; reason?: string }[] = [];

    for (const ev of needsDriver) {
      const hours = hoursUntil(ev.date, ev.time, (ev as any).timezone);
      if (hours === null) {
        results.push({ event_id: ev.id, window: 'none', fired: false, reason: `unparseable start_time="${ev.time}"` });
        continue;
      }

      // Determine which window we're in (if any)
      // T-4h window: 3.0–5.0 hours away (±1h around 4h mark, cron every 30min is fine)
      // T-1h window: 0.5–1.5 hours away
      let window: '4h' | '1h' | null = null;
      if (hours >= 3.0 && hours <= 5.0) window = '4h';
      else if (hours >= 0.5 && hours <= 1.5) window = '1h';

      if (!window) {
        results.push({ event_id: ev.id, window: 'none', fired: false, reason: `hours_until=${hours.toFixed(2)} — not in a notify window` });
        continue;
      }

      const dedupKey = `${ev.id}:${window}`;
      if (alreadySent.has(dedupKey)) {
        results.push({ event_id: ev.id, window, fired: false, reason: 'already_sent_today' });
        continue;
      }

      const fId = ev.family_id;
      const parents = parentsByFamily[fId] ?? [];
      if (parents.length === 0) {
        results.push({ event_id: ev.id, window, fired: false, reason: 'no_parent_tokens' });
        continue;
      }

      const kid = ev.member_id ? memberById[ev.member_id] : null;
      const kidName = kid?.name?.split(' ')[0] ?? 'Your kid';
      const timeLabel = ev.time; // display string as entered (e.g. "6:00 PM"), shown as-is
      const hoursLabel = window === '4h' ? '4 hours' : '1 hour';

      const title = `🚗 No driver for ${ev.title}`;
      const notifBody = `${kidName}'s ${ev.title} at ${timeLabel} needs a driver — ${hoursLabel} away`;

      const memberIds = parents.map(p => p.id);

      if (!dryRun) {
        // Send via family-notifier (handles push + DB persist) — no
        // `tokens` here; family-notifier resolves per-device tokens itself.
        await fetch(notifierUrl, {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({
            type: 'schedule_alert',
            memberIds,
            familyId: fId,
            payload: {
              title,
              body: notifBody,
              event_id: ev.id,
              hours_until: Math.round(hours * 10) / 10,
              kid_name: kidName,
              window,
            },
            persist: true,
          }),
        }).catch(e => console.warn('[schedule-alerts] notifier error:', e.message));
      }

      // Track in notifications table with enough meta to dedup future runs
      // (family-notifier persists with type='custom', so we also insert a dedup row)
      if (!dryRun) {
        await supabase.from('notifications').insert({
          family_id: fId,
          type: 'schedule_alert',
          title,
          body: notifBody,
          data: {
            event_id: ev.id,
            hours_until: Math.round(hours * 10) / 10,
            kid_name: kidName,
            window,
          },
          read: false,
        }).catch((e: any) => console.warn('[schedule-alerts] insert error:', e?.message));
      }

      results.push({ event_id: ev.id, window, fired: true });
    }

    const fired = results.filter(r => r.fired).length;
    return json({ ok: true, fired, dryRun, results });

  } catch (err: any) {
    console.error('[schedule-alerts] fatal:', err);
    return json({ ok: false, error: err.message }, 500);
  }
});
