// PawBond — Edge Function: send-reengagement
// Runs hourly. At 10 AM in the user's LOCAL timezone, sends a "We miss you"
// push to users who haven't opened the app in 3, 7, or 14 days.
// Multi-pet: lists ALL pets in one bundled push ("Max, Luna and Bella miss you!").
// Deduped once per window per user per day via notifications table.
//
// Deploy:  supabase functions deploy send-reengagement
// Cron:    0 * * * *

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from '../_shared/prefs.ts';
import { getBlockedPetIds } from '../_shared/petStatus.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TARGET_HOUR   = 10; // 10 AM local time

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

/** "Max", "Max and Luna", "Max, Luna and Bella" */
function listNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function getMessage(petNames: string[], days: number): { title: string; body: string } {
  const names = listNames(petNames);
  const plural = petNames.length > 1;
  if (days <= 3) return {
    title: `${names} ${plural ? 'miss' : 'misses'} you! 🐾`,
    body:  `It's been a couple of days. Tap to check in and keep the streak alive!`,
  };
  if (days <= 7) return {
    title: `A week without ${names}? 😢`,
    body:  `Don't let the bond fade — ${names} ${plural ? 'are' : 'is'} waiting for a care check-in!`,
  };
  return {
    title: `Come back to PawBond! 🐾`,
    body:  `${names} need${plural ? '' : 's'} you. Log in to catch up on health, mood, and more.`,
  };
}

const WINDOWS: Array<{ days: number }> = [{ days: 3 }, { days: 7 }, { days: 14 }];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date();
  let sent = 0;
  let skipped = 0;

  for (const window of WINDOWS) {
    const cutoff       = new Date(now.getTime() -  window.days      * 86_400_000).toISOString();
    const recentCutoff = new Date(now.getTime() - (window.days + 1) * 86_400_000).toISOString();

    // Users whose last_seen falls exactly in this window bucket
    const { data: profiles } = await db
      .from('profiles')
      .select('id, timezone')
      .lte('last_seen_at', cutoff)
      .gt('last_seen_at', recentCutoff)
      .not('last_seen_at', 'is', null);

    if (!profiles?.length) continue;

    // Only users whose local clock is at TARGET_HOUR right now
    const atTargetHour = (profiles as any[]).filter(p => localHour(p.timezone) === TARGET_HOUR);
    if (!atTargetHour.length) continue;

    const userIds = atTargetHour.map((p: any) => p.id);
    const { allowed } = await filterByPref(db, userIds, 'notif_daily');
    if (!allowed.length) continue;

    // Dedup: skip users who already got this window's push in the last 24 h
    const { data: recentNotifs } = await db
      .from('notifications')
      .select('user_id, meta')
      .in('user_id', allowed)
      .eq('type', 'reengagement')
      .gte('created_at', new Date(now.getTime() - 86_400_000).toISOString());

    const alreadySent = new Set(
      (recentNotifs ?? [])
        .filter((n: any) => n.meta?.days === window.days)
        .map((n: any) => n.user_id)
    );
    const toNotify = allowed.filter((uid: string) => !alreadySent.has(uid));
    if (!toNotify.length) continue;

    // Get ALL pets per user (not just one) — bundle names into one push
    const { data: pets } = await db
      .from('pets')
      .select('id, name, emoji, owner_id')
      .in('owner_id', toNotify)
      .is('memorial_at', null)
      .order('created_at', { ascending: true });

    const { lostIds, deceasedIds } = await getBlockedPetIds(db, (pets ?? []).map((p: any) => p.id));

    // Group pets by owner, filtering blocked ones
    const petsByUser = new Map<string, any[]>();
    for (const pet of (pets ?? [])) {
      if (lostIds.has(pet.id) || deceasedIds.has(pet.id)) continue;
      if (!petsByUser.has(pet.owner_id)) petsByUser.set(pet.owner_id, []);
      petsByUser.get(pet.owner_id)!.push(pet);
    }

    const { data: tokens } = await db
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', toNotify);

    const tokensByUser = new Map<string, string>();
    for (const t of (tokens ?? [])) tokensByUser.set(t.user_id, t.token);

    const messages: any[]  = [];
    const notifRows: any[] = [];

    for (const uid of toNotify) {
      const userPets = petsByUser.get(uid);
      if (!userPets?.length) { skipped++; continue; }
      const token = tokensByUser.get(uid);
      if (!token) { skipped++; continue; }

      const petNames = userPets.map(p => p.name);
      const petIds   = userPets.map(p => p.id);
      const { title, body } = getMessage(petNames, window.days);

      messages.push({ to: token, title, body, data: { type: 'reengagement', petIds }, sound: 'default' });
      notifRows.push({ user_id: uid, type: 'reengagement', title, body, meta: { pet_ids: petIds, days: window.days }, is_read: false });
    }

    if (!messages.length) continue;

    await Promise.all([
      fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      }),
      db.from('notifications').insert(notifRows),
    ]);

    sent += messages.length;
  }

  return json({ sent, skipped });
});
