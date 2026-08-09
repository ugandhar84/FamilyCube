// PawBond — Edge Function: send-feeding-reminder
// Runs every 30 minutes. For each meal window, collects ALL active pets per user
// that haven't been fed yet, then sends ONE bundled push per user (not per pet).
//
// Meal windows (local time):
//   Breakfast → check at 9:00–9:30 AM  (window: no log between 06:00–09:00)
//   Lunch     → check at 13:00–13:30   (window: no log between 11:00–13:00)
//   Dinner    → check at 19:00–19:30   (window: no log between 17:00–19:00)
//
// Dedup: one push per user per meal per day.
//
// Deploy:  supabase functions deploy send-feeding-reminder
// Cron:    */30 * * * *

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';
import { getBlockedPetIds, isBlocked } from '../_shared/petStatus.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function isCronAuthorized(req: Request): boolean {
  const auth  = req.headers.get('authorization') ?? '';
  const token = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return auth === `Bearer ${token}`;
}

function localHour(tz: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  } catch { return new Date().getUTCHours(); }
}

function localMinute(tz: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      minute: 'numeric', timeZone: tz ?? 'UTC',
    }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  } catch { return new Date().getUTCMinutes(); }
}

function localDateStr(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

function localTimeToUTC(tz: string | null | undefined, hour: number, minute = 0): string {
  const today = localDateStr(tz);
  const pad   = (n: number) => String(n).padStart(2, '0');
  try {
    // Use noon UTC as a stable reference to read the timezone offset
    // (avoids DST edges near midnight that could shift the date).
    const noonUTC = new Date(`${today}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(noonUTC);
    const localH = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '12', 10);
    const localM = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0',  10);
    // UTC offset in minutes (positive = east of UTC, negative = west)
    const offsetMins = (localH * 60 + localM) - 12 * 60;
    // Target UTC = desired local time − offset
    const targetMins = hour * 60 + minute - offsetMins;
    const base = new Date(`${today}T00:00:00Z`);
    base.setUTCMinutes(base.getUTCMinutes() + targetMins);
    return base.toISOString();
  } catch {
    return `${today}T${pad(hour)}:${pad(minute)}:00Z`;
  }
}

/** Format a list of pet names into natural language: "Max", "Max and Luna", "Max, Luna, and Buddy" */
function listNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

type Meal = 'breakfast' | 'lunch' | 'dinner';

const MEAL_CONFIG: Record<Meal, {
  emoji: string;
  checkHour: number;
  windowStartHour: number;
  windowEndHour: number;
}> = {
  breakfast: { emoji: '🌅', checkHour: 9,  windowStartHour: 6,  windowEndHour: 9  },
  lunch:     { emoji: '☀️', checkHour: 13, windowStartHour: 11, windowEndHour: 13 },
  dinner:    { emoji: '🌙', checkHour: 19, windowStartHour: 17, windowEndHour: 19 },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: pets } = await supabase
    .from('pets')
    .select(`id, name, emoji, owner_id, profiles!pets_owner_id_fkey ( id, timezone )`)
    .eq('is_active', true);

  if (!pets?.length) return json({ success: true, sent: 0 });

  const blockedSets = await getBlockedPetIds(supabase, pets.map((p: any) => p.id));

  // Group active (non-lost, non-deceased) pets by owner_id
  const byOwner = new Map<string, any[]>();
  for (const pet of pets as any[]) {
    if (isBlocked(pet.id, blockedSets)) continue;
    const list = byOwner.get(pet.owner_id) ?? [];
    list.push(pet);
    byOwner.set(pet.owner_id, list);
  }

  let totalSent = 0;

  for (const [ownerId, ownerPets] of byOwner) {
    const ownerTz = ownerPets[0].profiles?.timezone ?? null;
    const h       = localHour(ownerTz);
    const m       = localMinute(ownerTz);
    const today   = localDateStr(ownerTz);

    for (const [meal, cfg] of Object.entries(MEAL_CONFIG) as [Meal, typeof MEAL_CONFIG[Meal]][]) {
      if (h !== cfg.checkHour || m > 30) continue;

      // Preference gate
      const { allowed } = await filterByPref(supabase, [ownerId], 'notif_daily');
      if (!allowed.length) continue;

      // Find which pets haven't been fed AND haven't already been notified today
      // Dedup key: user_id + meal + date + pet_id (per-pet, not per-bundle)
      const windowStart = localTimeToUTC(ownerTz, cfg.windowStartHour);
      const windowEnd   = localTimeToUTC(ownerTz, cfg.windowEndHour);

      // Find which pets haven't been fed AT ALL today (any meal type).
      // If a pet had even one meal logged today, they're being cared for — skip them.
      const unfedfPets: any[] = [];
      for (const pet of ownerPets) {
        const dayStart = localTimeToUTC(ownerTz, 0);
        const dayEnd   = localTimeToUTC(ownerTz, 23, 59);
        const { count: anyMealToday } = await supabase
          .from('feeding_logs')
          .select('id', { count: 'exact', head: true })
          .eq('pet_id', pet.id)
          .in('meal_type', ['meal', 'breakfast', 'lunch', 'dinner'])
          .gte('fed_at', dayStart)
          .lte('fed_at', dayEnd);

        if ((anyMealToday ?? 0) === 0) unfedfPets.push(pet);
      }

      if (!unfedfPets.length) continue;

      // Check if we already sent a notification covering exactly these unfed pets.
      // If the user fed some pets after the first reminder, the unfed set shrinks —
      // we should send a follow-up for the remaining ones.
      const unfedIds = unfedfPets.map(p => p.id).sort();
      const { data: prevLogs } = await supabase
        .from('notification_logs')
        .select('data')
        .eq('user_id', ownerId)
        .eq('type', 'feeding_reminder')
        .contains('data', { meal, date: today })
        .order('created_at', { ascending: false })
        .limit(1);

      if (prevLogs?.length) {
        const prevIds: string[] = ((prevLogs[0].data as any)?.pet_ids ?? []).slice().sort();
        // Same set of unfed pets as last time — already notified, skip
        if (JSON.stringify(prevIds) === JSON.stringify(unfedIds)) continue;
      }

      // Push tokens
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', ownerId)
        .like('token', 'ExponentPushToken%');

      if (!tokens?.length) continue;

      const names    = listNames(unfedfPets.map(p => p.name));
      const mealCap  = meal.charAt(0).toUpperCase() + meal.slice(1);
      const title    = `${cfg.emoji} ${mealCap} time!`;
      const isSingle = unfedfPets.length === 1;
      const body     = isSingle
        ? `${unfedfPets[0].emoji ?? '🐾'} ${names} hasn't eaten yet — tap ✓ Fed or open to log.`
        : `${names} haven't eaten yet — tap to log their ${meal}.`;

      // One log row per owner per meal per day — not per pet.
      // The data.pet_ids array carries all unfed pets for dedup on re-runs.
      const petIds = unfedfPets.map(p => p.id);
      const { error: logErr } = await supabase.from('notification_logs').insert({
        user_id: ownerId, title, body,
        type: 'feeding_reminder',
        data: { pet_ids: petIds, pet_id: petIds[0], meal, date: today },
      });

      if (logErr) {
        console.error(`[feeding-reminder] log insert failed for ${ownerId}/${meal}:`, logErr.message);
        continue;
      }

      const messages = (tokens as { token: string }[]).map(t => ({
        to: t.token, sound: 'default', title, body,
        data: { type: 'feeding_reminder', pet_ids: petIds, pet_id: petIds[0], meal },
        priority: 'normal',
        channelId: 'reminders',
        // Action button only when a single pet — multi-pet can't be logged in one tap
        ...(isSingle ? { categoryId: 'FEEDING_REMINDER' } : {}),
      }));

      for (let i = 0; i < messages.length; i += 100) {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(messages.slice(i, i + 100)),
        });
        if (res.ok) {
          const r = await res.json();
          totalSent += (r.data ?? []).filter((d: any) => d.status === 'ok').length;
        }
      }
    }
  }

  return json({ success: true, sent: totalSent });
});
