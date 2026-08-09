// PawBond — Edge Function: med-compliance-check
// Runs every 30 minutes. Two jobs in one pass:
//
// JOB A — Daily / critical medication missed-dose snooze
//   For each active daily/twice-daily medication with a remind_time:
//   • Initial alert fires client-side (Expo local notification at remind_time)
//   • This function fires a "CRITICAL: Missed Medication" push +30 min AFTER
//     remind_time if no medication_log row exists for today
//   • Deduped: max one missed-dose push per medication per calendar day
//
// JOB B — Monthly preventative follow-up
//   For each active medication with frequency='monthly':
//   • Initial nudge fires this month at 9 AM weekend / 7 PM weekday (local time)
//   • If still not logged 24h later → "Quick check: did they get their pill?"
//   • Deduped via notification_logs (type=med_monthly_nudge / med_monthly_followup)
//     keyed to the ISO year-month so it fires at most once per month per window
//
// Deploy:  supabase functions deploy med-compliance-check
// Cron:    */30 * * * *

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';
import { filterByTier } from '../_shared/requirePro.ts';
import { getBlockedPetIds, isBlocked } from '../_shared/petStatus.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function isCronAuthorized(req: Request): boolean {
  const auth  = req.headers.get('authorization') ?? '';
  const token = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return auth === `Bearer ${token}`;
}

// ── Timezone helpers ──────────────────────────────────────────────────────────

/** Returns the local hour (0–23) right now for a given IANA timezone. */
function localHour(tz: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  } catch {
    return new Date().getUTCHours();
  }
}

/** Returns the local day-of-week (0=Sun…6=Sat) for a given IANA timezone. */
function localDow(tz: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', timeZone: tz ?? 'UTC',
    }).formatToParts(new Date());
    const d = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(d);
  } catch {
    return new Date().getUTCDay();
  }
}

/** ISO calendar date string in a given timezone ("2026-07-20"). */
function localDateStr(tz: string | null | undefined): string {
  const now = new Date();
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** ISO year-month string in a given timezone ("2026-07"). */
function localYearMonth(tz: string | null | undefined): string {
  return localDateStr(tz).slice(0, 7);
}

/** Parse "HH:MM" time string → { hour, minute }. */
function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** Minutes since midnight in the user's local timezone. */
function localMinuteOfDay(tz: string | null | undefined): number {
  const h = localHour(tz);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      minute: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(new Date());
    const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + m;
  } catch {
    return new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  }
}

// ── Push helper ───────────────────────────────────────────────────────────────

async function sendPush(messages: object[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) {
      const r = await res.json();
      sent += (r.data ?? []).filter((d: any) => d.status === 'ok').length;
    } else {
      console.error('[med-compliance] Expo push failed:', res.status);
    }
  }
  return sent;
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let totalSent = 0;

  // ────────────────────────────────────────────────────────────────────────────
  // JOB A: Daily medication missed-dose snooze (+30 min after remind_time)
  // ────────────────────────────────────────────────────────────────────────────

  // Fetch all active daily/custom meds that have a remind_time
  // Only daily meds get a missed-dose alert — weekly is not due every day,
  // monthly is handled by JOB B below.
  const { data: dailyMeds } = await supabase
    .from('medications')
    .select(`
      id, name, dosage, frequency, remind_time,
      pets ( id, name, emoji, owner_id,
             profiles!pets_owner_id_fkey ( id, timezone ) )
    `)
    .eq('is_active', true)
    .eq('frequency', 'daily')
    .not('remind_time', 'is', null);

  // Collect qualifying missed-dose items per owner, then send one bundled push per user
  const dailyMedPetIds = [...new Set((dailyMeds ?? []).map((m: any) => m.pet_id))];
  const blockedDaily = await getBlockedPetIds(supabase, dailyMedPetIds);
  const missedByOwner = new Map<string, { pet: any; med: any; today: string }[]>();

  for (const med of (dailyMeds ?? []) as any[]) {
    const pet     = med.pets;
    if (!pet) continue;
    if (isBlocked(med.pet_id, blockedDaily)) continue;
    const ownerTz = pet.profiles?.timezone ?? null;
    const { hour: remindH, minute: remindM } = parseTime(med.remind_time);
    const remindMins = remindH * 60 + remindM;
    const nowMins    = localMinuteOfDay(ownerTz);

    // Only fire in the 30-min snooze window: [remindTime+30, remindTime+60)
    if (nowMins < remindMins + 30 || nowMins >= remindMins + 60) continue;

    const today = localDateStr(ownerTz);
    const { count } = await supabase
      .from('daily_checklist')
      .select('id', { count: 'exact', head: true })
      .eq('pet_id', pet.id)
      .eq('type', 'medicine')
      .eq('label', med.name)
      .eq('date', today)
      .eq('completed', true);

    if ((count ?? 0) > 0) continue;

    const { count: alreadySent } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'med_missed_dose')
      .contains('data', { med_ids: [med.id], date: today });

    if ((alreadySent ?? 0) > 0) continue;

    const ownerId = pet.owner_id;
    if (!missedByOwner.has(ownerId)) missedByOwner.set(ownerId, []);
    missedByOwner.get(ownerId)!.push({ pet, med, today });
  }

  for (const [ownerId, items] of missedByOwner) {
    // Missed-dose alert is a Pro+ feature — gate on subscription tier
    const tierAllowed = await filterByTier(supabase, [ownerId], 'pro');
    if (!tierAllowed.length) continue;

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .eq('user_id', ownerId)
      .like('token', 'ExponentPushToken%');

    if (!tokens?.length) continue;

    const { allowed } = await filterByPref(supabase, [ownerId], 'notif_health');
    if (!allowed.length) continue;

    const petIds = [...new Set(items.map(i => i.pet.id))];
    const medIds = items.map(i => i.med.id);
    const today  = items[0].today;

    let title: string;
    let body: string;
    if (items.length === 1) {
      const { pet, med } = items[0];
      const dosageStr = med.dosage ? ` · ${med.dosage}` : '';
      title = `🚨 CRITICAL: Missed Medication Alert`;
      body  = `${pet.emoji ?? '🐾'} ${pet.name}'s ${med.name}${dosageStr} hasn't been logged yet. Please tap to administer safely.`;
    } else {
      title = `🚨 ${items.length} medications not yet logged`;
      body  = items.map(({ pet, med }) => `${pet.emoji ?? '🐾'} ${pet.name}: ${med.name}`).join(', ');
    }

    await supabase.from('notification_logs').insert([{
      user_id: ownerId, title, body,
      type: 'med_missed_dose',
      data: { med_ids: medIds, pet_ids: petIds, pet_id: petIds[0], date: today },
    }]);

    totalSent += await sendPush(
      tokens.map((t: any) => ({
        to: t.token, sound: 'default', title, body,
        data: { type: 'med_missed_dose', medication_ids: medIds, pet_ids: petIds, pet_id: petIds[0] },
        priority: 'high',
        channelId: 'health_alerts',
      })),
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // JOB B: Monthly preventative nudge + 24-hour follow-up
  // ────────────────────────────────────────────────────────────────────────────

  const { data: monthlyMeds } = await supabase
    .from('medications')
    .select(`
      id, name, dosage, start_date,
      pets ( id, name, emoji, owner_id,
             profiles!pets_owner_id_fkey ( id, timezone ) )
    `)
    .eq('is_active', true)
    .eq('frequency', 'monthly');

  // Collect qualifying monthly meds per owner, keyed by nudge phase
  const monthlyMedPetIds = [...new Set((monthlyMeds ?? []).map((m: any) => m.pet_id))];
  const blockedMonthly = await getBlockedPetIds(supabase, monthlyMedPetIds);
  const monthlyNudgeByOwner    = new Map<string, { pet: any; med: any; yearMonth: string }[]>();
  const monthlyFollowupByOwner = new Map<string, { pet: any; med: any; yearMonth: string }[]>();

  for (const med of (monthlyMeds ?? []) as any[]) {
    const pet     = med.pets;
    if (!pet) continue;
    if (isBlocked(med.pet_id, blockedMonthly)) continue;
    const ownerTz = pet.profiles?.timezone ?? null;
    const h       = localHour(ownerTz);
    const dow     = localDow(ownerTz);
    const isWeekend = dow === 0 || dow === 6;
    const inWindow  = isWeekend ? (h >= 9 && h < 10) : (h >= 19 && h < 20);
    if (!inWindow) continue;

    const yearMonth  = localYearMonth(ownerTz);
    const monthStart = `${yearMonth}-01`;
    const monthEnd   = `${yearMonth}-31`;
    const today      = localDateStr(ownerTz);

    // Skip if the med hasn't started yet
    if (med.start_date && med.start_date > today) continue;

    // Only notify within 7 days of the due day (day-of-month from start_date).
    // e.g. start_date = 2026-06-05 → due on the 5th of each month.
    // If today is before the 5th or more than 7 days past the 5th → skip.
    if (med.start_date) {
      const dueDayOfMonth = parseInt(med.start_date.slice(8, 10), 10);
      const todayDay      = parseInt(today.slice(8, 10), 10);
      const daysFromDue   = todayDay - dueDayOfMonth;
      // Allow: on the due day, or up to 7 days after (reminder window)
      if (daysFromDue < 0 || daysFromDue > 7) continue;
    }

    // Check medication_logs (primary monthly log table)
    const { count: logsThisMonth } = await supabase
      .from('medication_logs')
      .select('id', { count: 'exact', head: true })
      .eq('medication_id', med.id)
      .gte('logged_at', `${monthStart}T00:00:00Z`)
      .lte('logged_at', `${monthEnd}T23:59:59Z`);

    if ((logsThisMonth ?? 0) > 0) continue;

    // Fallback: daily_checklist (older logging path)
    const { count: checklistThisMonth } = await supabase
      .from('daily_checklist')
      .select('id', { count: 'exact', head: true })
      .eq('pet_id', pet.id)
      .eq('type', 'medicine')
      .eq('label', med.name)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .eq('completed', true);

    if ((checklistThisMonth ?? 0) > 0) continue;

    const ownerId = pet.owner_id;
    const { count: nudgeSent } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ownerId)
      .eq('type', 'med_monthly_nudge')
      .contains('data', { med_ids: [med.id], month: yearMonth });
    if ((nudgeSent ?? 0) === 0) {
      if (!monthlyNudgeByOwner.has(ownerId)) monthlyNudgeByOwner.set(ownerId, []);
      monthlyNudgeByOwner.get(ownerId)!.push({ pet, med, yearMonth });
    } else {
      const { count: followupSent } = await supabase
        .from('notification_logs')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'med_monthly_followup')
        .contains('data', { med_ids: [med.id], month: yearMonth });

      if ((followupSent ?? 0) > 0) continue;

      if (!monthlyFollowupByOwner.has(ownerId)) monthlyFollowupByOwner.set(ownerId, []);
      monthlyFollowupByOwner.get(ownerId)!.push({ pet, med, yearMonth });
    }
  }

  // Send bundled monthly nudges
  for (const [ownerId, items] of monthlyNudgeByOwner) {
    const yearMonth = items[0].yearMonth;

    // Monthly nudge is a Pro+ feature
    const tierAllowed = await filterByTier(supabase, [ownerId], 'pro');
    if (!tierAllowed.length) continue;

    // Final owner-level gate — guards against concurrent cron invocations both
    // passing the per-med dedup loop before either has written the log.
    const { count: ownerSentThisMonth } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ownerId)
      .eq('type', 'med_monthly_nudge')
      .gte('created_at', `${yearMonth}-01T00:00:00Z`);
    if ((ownerSentThisMonth ?? 0) > 0) continue;

    const { data: tokens } = await supabase
      .from('push_tokens').select('user_id, token')
      .eq('user_id', ownerId).like('token', 'ExponentPushToken%');

    if (!tokens?.length) continue;
    const { allowed } = await filterByPref(supabase, [ownerId], 'notif_health');
    if (!allowed.length) continue;

    const petIds   = [...new Set(items.map(i => i.pet.id))];
    const medIds   = items.map(i => i.med.id);

    let title: string;
    let body: string;
    if (items.length === 1) {
      const { pet, med } = items[0];
      const dosageStr = med.dosage ? ` · ${med.dosage}` : '';
      title = `💊 Monthly protection day!`;
      body  = `${pet.emoji ?? '🐾'} ${pet.name}'s monthly ${med.name}${dosageStr} is due. Tap to administer and keep them protected.`;
    } else {
      title = `💊 Monthly meds due for your pets`;
      body  = items.map(({ pet, med }) => `${pet.emoji ?? '🐾'} ${pet.name}: ${med.name}`).join(', ');
    }

    await supabase.from('notification_logs').insert([{
      user_id: ownerId, title, body, type: 'med_monthly_nudge',
      data: { med_ids: medIds, pet_ids: petIds, pet_id: petIds[0], month: yearMonth },
    }]);

    totalSent += await sendPush(
      tokens.map((t: any) => ({
        to: t.token, sound: 'default', title, body,
        data: { type: 'med_monthly_nudge', medication_ids: medIds, pet_ids: petIds, pet_id: petIds[0] },
        priority: 'normal', channelId: 'reminders',
      })),
    );
  }

  // Send bundled monthly follow-ups
  for (const [ownerId, items] of monthlyFollowupByOwner) {
    // Follow-up is also a Pro+ feature
    const tierAllowedF = await filterByTier(supabase, [ownerId], 'pro');
    if (!tierAllowedF.length) continue;

    const { data: tokens } = await supabase
      .from('push_tokens').select('user_id, token')
      .eq('user_id', ownerId).like('token', 'ExponentPushToken%');

    if (!tokens?.length) continue;
    const { allowed } = await filterByPref(supabase, [ownerId], 'notif_health');
    if (!allowed.length) continue;

    const petIds    = [...new Set(items.map(i => i.pet.id))];
    const medIds    = items.map(i => i.med.id);
    const yearMonth = items[0].yearMonth;

    let title: string;
    let body: string;
    if (items.length === 1) {
      const { pet, med } = items[0];
      title = `⚠️ Quick check: Did ${pet.name} get their pill?`;
      body  = `${pet.emoji ?? '🐾'} ${pet.name}'s monthly ${med.name} log is still open. Tap to confirm so your medical records stay updated.`;
    } else {
      title = `⚠️ ${items.length} monthly meds still unlogged`;
      body  = items.map(({ pet, med }) => `${pet.emoji ?? '🐾'} ${pet.name}: ${med.name}`).join(', ');
    }

    await supabase.from('notification_logs').insert([{
      user_id: ownerId, title, body, type: 'med_monthly_followup',
      data: { med_ids: medIds, pet_ids: petIds, pet_id: petIds[0], month: yearMonth },
    }]);

    totalSent += await sendPush(
      tokens.map((t: any) => ({
        to: t.token, sound: 'default', title, body,
        data: { type: 'med_monthly_followup', medication_ids: medIds, pet_ids: petIds, pet_id: petIds[0] },
        priority: 'normal', channelId: 'reminders',
      })),
    );
  }

  return json({ success: true, sent: totalSent });
});
