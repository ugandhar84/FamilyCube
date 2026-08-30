// FamilyCube — Edge Function: meal-reminders
// Fires a push to parents 1 hour before a planned meal's start_time.
// MealsTab's Add/Edit Meal form's meal-time field is optional — only meals
// with a start_time set are ever considered. Same T-1h single-fire pattern
// as schedule-alerts' driver reminder, reusing its exact time-parsing
// helpers (family_meals.start_time/timezone were added specifically to
// match calendar_events' shape for this reason).
//
// Call on a cron, e.g. every 15 minutes: */15 * * * *
// Deploy: supabase functions deploy meal-reminders
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

// start_time is a display string from the app's time pickers — "6:00 PM"
// (12-hour, what fmtTimeLabel writes) or occasionally a plain 24-hour
// "HH:MM". Identical to schedule-alerts'/call-reminder-sweeper's own
// to24Hour — kept as a direct copy rather than a shared import since Deno
// edge functions here don't share a module across function directories.
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

// family_meals has no absolute calendar date — only `day` ("Mon".."Sun") +
// `week_of` (the Monday of that week, YYYY-MM-DD, per weekOf() in
// meals/types.ts). Resolve that pair to a real YYYY-MM-DD before reusing
// schedule-alerts' localWallClockToUTC/hoursUntil, which both expect one.
const DAY_OFFSET: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
function mealDateStr(weekOf: string, day: string): string | null {
  const offset = DAY_OFFSET[day];
  if (offset === undefined) return null;
  const monday = new Date(`${weekOf}T00:00:00Z`);
  if (isNaN(monday.getTime())) return null;
  monday.setUTCDate(monday.getUTCDate() + offset);
  return monday.toISOString().slice(0, 10);
}

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

function hoursUntil(dateStr: string, timeStr: string, timeZone: string): number | null {
  const t24 = to24Hour(timeStr);
  if (!t24) return null;
  const mealAt = localWallClockToUTC(`${dateStr}T${t24}:00`, timeZone || 'UTC');
  return (mealAt.getTime() - Date.now()) / 3_600_000;
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

    // Only meals from this week or last week can plausibly still be
    // "coming up" — a wide-enough net that a family in any timezone isn't
    // missed, cheap prefilter same as schedule-alerts' ±1-day window
    // (hoursUntil below is the real correctness check).
    const now = new Date();
    const thisMonday = new Date(now);
    thisMonday.setUTCDate(thisMonday.getUTCDate() - ((thisMonday.getUTCDay() + 6) % 7));
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    const weekWindow = [lastMonday.toISOString().slice(0, 10), thisMonday.toISOString().slice(0, 10)];

    const { data: meals, error: mealsErr } = await supabase
      .from('family_meals')
      .select('id, family_id, day, week_of, title, type, start_time, timezone, chef_id, reminder_sent')
      .in('week_of', weekWindow)
      .not('start_time', 'is', null)
      .eq('reminder_sent', false);
    if (mealsErr) throw new Error(`Meals fetch failed: ${mealsErr.message}`);

    if (!meals?.length) return json({ ok: true, fired: 0, dryRun, message: 'No upcoming timed meals' });

    const familyIds = [...new Set(meals.map(m => m.family_id).filter(Boolean))];
    const { data: members } = await supabase
      .from('members').select('id, name, role, family_id').in('family_id', familyIds.length ? familyIds : ['__none__']);
    const parentsByFamily: Record<string, { id: string }[]> = {};
    const memberById: Record<string, any> = {};
    for (const m of (members ?? [])) {
      memberById[m.id] = m;
      if (m.role === 'parent') (parentsByFamily[m.family_id] ??= []).push({ id: m.id });
    }

    const results: Record<string, unknown>[] = [];

    for (const meal of meals) {
      const dateStr = mealDateStr(meal.week_of, meal.day);
      if (!dateStr) { results.push({ mealId: meal.id, fired: false, reason: 'unresolvable_date' }); continue; }

      const hours = hoursUntil(dateStr, meal.start_time as string, meal.timezone);
      if (hours === null) { results.push({ mealId: meal.id, fired: false, reason: `unparseable start_time="${meal.start_time}"` }); continue; }

      // T-1h window, ±0.25h either side to tolerate cron jitter — meal-
      // reminders runs every 15min, tighter than schedule-alerts' 30min
      // cadence since a missed meal reminder is more time-sensitive.
      if (hours > 1.25 || hours < 0.75) { results.push({ mealId: meal.id, fired: false, reason: `hours_until=${hours.toFixed(2)} not in T-1h window` }); continue; }

      const parents = parentsByFamily[meal.family_id] ?? [];
      if (!parents.length) { results.push({ mealId: meal.id, fired: false, reason: 'no_parents' }); continue; }

      const chef = meal.chef_id ? memberById[meal.chef_id] : null;
      const memberIds = parents.map(p => p.id);

      if (!dryRun) {
        await fetch(notifierUrl, {
          method: 'POST', headers: authHeader,
          body: JSON.stringify({
            type: 'meal_reminder', memberIds, familyId: meal.family_id,
            payload: {
              mealId: meal.id, mealTitle: meal.title, mealType: meal.type,
              day: meal.day, timeLabel: meal.start_time,
              chefName: chef?.name?.split(' ')[0],
            },
            persist: true,
          }),
        }).catch(e => console.warn('[meal-reminders] notifier error:', e.message));

        await supabase.from('family_meals').update({ reminder_sent: true }).eq('id', meal.id);
      }

      results.push({ mealId: meal.id, fired: true, hours_until: Math.round(hours * 10) / 10 });
    }

    const fired = results.filter(r => r.fired).length;
    return json({ ok: true, fired, dryRun, results });

  } catch (err: any) {
    console.error('[meal-reminders] fatal:', err);
    return json({ ok: false, error: err.message }, 500);
  }
});
