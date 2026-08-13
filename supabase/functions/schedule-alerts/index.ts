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

// Returns hours from now until a given date + time string (HH:MM).
function hoursUntil(dateStr: string, timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  const ev = new Date(dateStr);
  ev.setHours(h, m, 0, 0);
  return (ev.getTime() - Date.now()) / 3_600_000;
}

// Local YYYY-MM-DD in server timezone (UTC — Supabase edge functions run in UTC).
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
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

    const today = todayStr();
    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const authHeader = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    // ── 1. Fetch today's events that need a driver ─────────────────────────────
    let eventsQuery = supabase
      .from('events')
      .select('id, title, date, time, member_id, location, driver, driver_status, family_id')
      .eq('date', today)
      .not('location', 'is', null)
      .not('time', 'is', null);

    if (familyId) eventsQuery = eventsQuery.eq('family_id', familyId);

    const { data: events, error: evErr } = await eventsQuery;
    if (evErr) throw new Error(`Events fetch failed: ${evErr.message}`);

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
      .select('id, name, role, family_id, expo_push_token')
      .in('family_id', familyIds.length ? familyIds : ['__none__']);

    // Parent tokens per family (parents get the alert)
    const parentsByFamily: Record<string, { id: string; token: string }[]> = {};
    for (const m of (members ?? [])) {
      if (m.role === 'parent' && m.expo_push_token) {
        if (!parentsByFamily[m.family_id]) parentsByFamily[m.family_id] = [];
        parentsByFamily[m.family_id].push({ id: m.id, token: m.expo_push_token });
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
      .gte('created_at', `${today}T00:00:00Z`)
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
      const hours = hoursUntil(ev.date, ev.time);

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
      const timeLabel = ev.time; // HH:MM — keep it simple; parents know their timezone
      const hoursLabel = window === '4h' ? '4 hours' : '1 hour';

      const title = `🚗 No driver for ${ev.title}`;
      const notifBody = `${kidName}'s ${ev.title} at ${timeLabel} needs a driver — ${hoursLabel} away`;

      const tokens = parents.map(p => p.token);
      const memberIds = parents.map(p => p.id);

      if (!dryRun) {
        // Send via family-notifier (handles push + DB persist)
        await fetch(notifierUrl, {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({
            type: 'schedule_alert',
            tokens,
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
