// FamilyCube — Edge Function: ride-deadline-notifier
// Called on a schedule to sweep calendar_events for ride-urgency signals.
// chore_tasks already has this via chore-deadline-notifier (pool-unclaimed
// urgent broadcast, claimed-but-silent check-in) — calendar_events/rides
// had NO equivalent at all, confirmed as a live gap by the master-flow-v2
// QA audit (case C2, gap #4/#26/#27): a time-critical ride sitting
// unclaimed, or claimed but with the driver gone quiet, had no scheduled
// job, edge function, or client-side timer flagging it as urgent.
//
// Deliberately narrower than chore-deadline-notifier: only the two gaps
// the audit actually found missing —
//   1. Pool-unclaimed urgent broadcast (ride open to GP/teen pool, nobody
//      has claimed it, time is close) — mirrors POOL_URGENT_WINDOW_MIN.
//   2. Claimed-but-silent check-in (driver/helper confirmed, ride time is
//      close, no pickup_confirmed_at yet) — mirrors CHECKIN_WINDOW_MIN.
// No auto-release for rides — unlike a chore, silently reassigning
// someone's ride commitment out from under them without an explicit
// decline is a bigger behavioral change than what was asked for; the
// check-in nudge alone gives the family visibility to act manually.
//
// Cron schedule: every 15 minutes: */15 * * * *
// Deploy: supabase functions deploy ride-deadline-notifier
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Matches chore-deadline-notifier's own POOL_URGENT_WINDOW_MIN/
// CHECKIN_WINDOW_MIN — same spec rule ("+30min"/"+15min before due"),
// applied here to a ride instead of a chore.
const POOL_URGENT_WINDOW_MIN = 30;
const CHECKIN_WINDOW_MIN = 15;

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

    // Rides due today only — a ride weeks out has no business being
    // flagged "urgent," matching classifyEventUrgency.ts's own 48h-window
    // philosophy for what counts as needing attention soon.
    let query = supabase
      .from('calendar_events')
      .select('id, title, family_id, date, start_time, driver_id, driver_status, helper_id, helper_status, is_open_to_grandparents, is_open_to_teens, ride_pool_urgent_notified_at, ride_checkin_notified_at, pickup_confirmed_at, ride_required')
      .eq('date', today)
      .eq('ride_required', true)
      .is('deleted_at', null)
      .not('start_time', 'is', null);
    if (familyId) query = query.eq('family_id', familyId);
    const { data: events, error: evErr } = await query;
    if (evErr) throw new Error(`Event fetch failed: ${evErr.message}`);

    const familyIds = [...new Set((events ?? []).map((e: any) => e.family_id).filter(Boolean))];
    const { data: members } = await supabase
      .from('members')
      .select('id, name, role, family_id, expo_push_token')
      .in('family_id', familyIds.length ? familyIds : ['__none__']);

    const allMemberIds = (members ?? []).map((m: any) => m.id);
    const { data: deviceTokenRows } = await supabase
      .from('member_device_tokens')
      .select('member_id, expo_push_token')
      .in('member_id', allMemberIds.length ? allMemberIds : ['__none__']);
    const tokensByMemberId: Record<string, string[]> = {};
    for (const row of (deviceTokenRows ?? []) as any[]) {
      if (!row.expo_push_token) continue;
      (tokensByMemberId[row.member_id] ??= []).push(row.expo_push_token);
    }
    for (const m of (members ?? [])) {
      if (!tokensByMemberId[m.id] && m.expo_push_token) tokensByMemberId[m.id] = [m.expo_push_token];
    }
    const tokensForMember = (id: string | null | undefined): string[] => id ? (tokensByMemberId[id] ?? []) : [];

    const parentTokensByFamily: Record<string, string[]> = {};
    const gpTokensByFamily: Record<string, string[]> = {};
    const teenTokensByFamily: Record<string, string[]> = {};
    for (const m of (members ?? [])) {
      const t = tokensByMemberId[m.id];
      if (!t?.length) continue;
      if (m.role === 'parent') (parentTokensByFamily[m.family_id] ??= []).push(...t);
      if (m.role === 'grandparent' || m.role === 'senior') (gpTokensByFamily[m.family_id] ??= []).push(...t);
      if (m.role === 'teenager' || m.role === 'teen') (teenTokensByFamily[m.family_id] ??= []).push(...t);
    }

    const notifications: { type: string; eventTitle: string; to: string; dryRun: boolean }[] = [];
    const now = Date.now();
    const fire = async (type: string, tokens: string[], fId: string, payload: Record<string, unknown>, opts?: { soft?: boolean }) => {
      if (!tokens.length) return;
      notifications.push({ type, eventTitle: payload.eventTitle as string, to: tokens.join(','), dryRun });
      if (dryRun) return;
      await fetch(notifierUrl, {
        method: 'POST',
        headers: notifierHeaders,
        body: JSON.stringify({ type, tokens, familyId: fId, payload: opts?.soft ? { ...payload, soft: true } : payload, persist: true }),
      });
    };

    let poolUrgentFired = 0;
    let checkinFired = 0;

    for (const e of (events ?? [])) {
      const dueAt = new Date(`${e.date}T${e.start_time}`);
      const minutesUntilDue = (dueAt.getTime() - now) / 60_000;
      if (minutesUntilDue < 0) continue; // already past — chore-deadline-notifier's own overdue handling has no ride analogue asked for here
      const parentTokens = parentTokensByFamily[e.family_id] ?? [];

      const hasAssignee = !!(e.driver_id || e.helper_id);
      const assigneeStatus = e.driver_id ? e.driver_status : e.helper_status;

      // ── Nobody has claimed it, time is close — pool-unclaimed urgent ────
      if (!hasAssignee && (e.is_open_to_grandparents || e.is_open_to_teens) && !e.ride_pool_urgent_notified_at) {
        if (minutesUntilDue <= POOL_URGENT_WINDOW_MIN) {
          const poolTokens = [
            ...(e.is_open_to_grandparents ? (gpTokensByFamily[e.family_id] ?? []) : []),
            ...(e.is_open_to_teens ? (teenTokensByFamily[e.family_id] ?? []) : []),
          ];
          await fire('ride_pool_unclaimed_urgent', poolTokens, e.family_id, { eventTitle: e.title, eventId: e.id, minutesUntilDue: Math.round(minutesUntilDue) });
          await fire('ride_pool_unclaimed_urgent', parentTokens, e.family_id, { eventTitle: e.title, eventId: e.id, minutesUntilDue: Math.round(minutesUntilDue), forParent: true }, { soft: true });
          poolUrgentFired++;
          if (!dryRun) {
            await supabase.from('calendar_events').update({ ride_pool_urgent_notified_at: new Date().toISOString() }).eq('id', e.id).is('ride_pool_urgent_notified_at', null);
          }
        }
        continue;
      }

      // ── Claimed and confirmed, time is close, nobody's checked in yet ───
      if (hasAssignee && assigneeStatus === 'confirmed' && !e.pickup_confirmed_at && !e.ride_checkin_notified_at) {
        if (minutesUntilDue <= CHECKIN_WINDOW_MIN) {
          const assigneeId = e.driver_id ?? e.helper_id;
          await fire('ride_still_on', tokensForMember(assigneeId), e.family_id, { eventTitle: e.title, eventId: e.id, minutesUntilDue: Math.round(minutesUntilDue) });
          checkinFired++;
          if (!dryRun) {
            await supabase.from('calendar_events').update({ ride_checkin_notified_at: new Date().toISOString() }).eq('id', e.id).is('ride_checkin_notified_at', null);
          }
        }
      }
    }

    return json({ ok: true, swept: (events ?? []).length, pool_urgent_fired: poolUrgentFired, checkin_fired: checkinFired, notifications, dryRun });

  } catch (e: any) {
    console.error('[ride-deadline-notifier]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
