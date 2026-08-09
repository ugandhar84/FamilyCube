// PawBond — Edge Function: send-streak-recovery
// Runs hourly. At 21:00 in the user's LOCAL timezone (before midnight streak reset),
// finds ALL pets with streak ≥ 3 that haven't been logged today in the user's timezone.
// Multi-pet: bundles all at-risk pets into one push ("Max and Luna's streaks are at risk!").
// Deduped once per user per local day via notifications table.
//
// Deploy:  supabase functions deploy send-streak-recovery
// Cron:    0 * * * *

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from '../_shared/prefs.ts';
import { getBlockedPetIds } from '../_shared/petStatus.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TARGET_HOUR   = 21; // 9 PM local time

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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

function localDateStr(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

function listNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date();

  // All pets with a streak ≥ 3
  const { data: pets } = await db
    .from('pets')
    .select('id, name, emoji, owner_id, care_streak, last_streak_date')
    .gte('care_streak', 3)
    .not('last_streak_date', 'is', null)
    .is('memorial_at', null);

  if (!pets?.length) return json({ sent: 0, reason: 'no eligible pets' });

  const { lostIds, deceasedIds } = await getBlockedPetIds(db, pets.map((p: any) => p.id));

  // Get owner timezones
  const ownerIds = [...new Set(pets.map((p: any) => p.owner_id))];
  const { data: profiles } = await db
    .from('profiles')
    .select('id, timezone')
    .in('id', ownerIds);

  const tzByUser = new Map<string, string | null>();
  for (const p of (profiles ?? [])) tzByUser.set(p.id, p.timezone);

  // Only process users whose local time is TARGET_HOUR right now
  const usersAtTargetHour = new Set(
    ownerIds.filter(uid => localHour(tzByUser.get(uid)) === TARGET_HOUR)
  );
  if (!usersAtTargetHour.size) return json({ sent: 0, reason: 'no users at target hour' });

  // Group all at-risk pets per user (hasn't logged today in their timezone)
  const atRiskByUser = new Map<string, any[]>();
  for (const pet of pets) {
    if (!usersAtTargetHour.has(pet.owner_id)) continue;
    if (lostIds.has(pet.id) || deceasedIds.has(pet.id)) continue;

    const tz = tzByUser.get(pet.owner_id) ?? null;
    const todayLocal = localDateStr(tz);
    if (pet.last_streak_date === todayLocal) continue; // already logged today

    if (!atRiskByUser.has(pet.owner_id)) atRiskByUser.set(pet.owner_id, []);
    atRiskByUser.get(pet.owner_id)!.push(pet);
  }

  if (!atRiskByUser.size) return json({ sent: 0, reason: 'all users already logged today' });

  const toNotifyIds = [...atRiskByUser.keys()];
  const { allowed } = await filterByPref(db, toNotifyIds, 'notif_daily');
  if (!allowed.length) return json({ sent: 0, reason: 'all blocked by prefs' });

  // Dedup: one streak-recovery push per user per local day
  const { data: recentNotifs } = await db
    .from('notifications')
    .select('user_id')
    .in('user_id', allowed)
    .eq('type', 'streak_recovery')
    .gte('created_at', new Date(now.getTime() - 86_400_000).toISOString());

  const alreadySent = new Set((recentNotifs ?? []).map((n: any) => n.user_id));
  const toNotify = allowed.filter((uid: string) => !alreadySent.has(uid));
  if (!toNotify.length) return json({ sent: 0, reason: 'all deduped' });

  // Push tokens
  const { data: tokens } = await db
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', toNotify);

  const tokensByUser = new Map<string, string>();
  for (const t of (tokens ?? [])) tokensByUser.set(t.user_id, t.token);

  const messages: any[]  = [];
  const notifRows: any[] = [];

  for (const uid of toNotify) {
    const userPets = atRiskByUser.get(uid);
    if (!userPets?.length) continue;
    const token = tokensByUser.get(uid);
    if (!token) continue;

    const petNames  = userPets.map(p => p.name);
    const petIds    = userPets.map(p => p.id);
    const maxStreak = Math.max(...userPets.map(p => p.care_streak));
    const names     = listNames(petNames);
    const plural    = petNames.length > 1;

    const title = `${plural ? petNames.map(n => `${n}'s`).join(' & ') : `${names}'s`} streak${plural ? 's are' : ' is'} at risk! 🔥`;
    const body  = `Log care for ${names} before midnight to keep the ${maxStreak}-day streak${plural ? 's' : ''} alive!`;

    messages.push({ to: token, title, body, data: { type: 'streak_recovery', petIds }, sound: 'default' });
    notifRows.push({
      user_id: uid, type: 'streak_recovery', title, body,
      meta: { pet_ids: petIds, max_streak: maxStreak }, is_read: false,
    });
  }

  if (!messages.length) return json({ sent: 0 });

  await Promise.all([
    fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    }),
    db.from('notifications').insert(notifRows),
  ]);

  return json({ sent: messages.length });
});
