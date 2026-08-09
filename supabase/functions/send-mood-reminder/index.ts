// PawBond — Edge Function: send-mood-reminder
// Runs hourly. At 3 PM local time, if zero mood scans exist for ANY active pet
// today, sends ONE bundled push per user listing all pets that need a check-in.
// Deduped: one push per user per day.
// Stagger note: 3 PM chosen so it doesn't collide with appointment 1-day reminder (2 PM).
//
// Deploy:  supabase functions deploy send-mood-reminder
// Cron:    0 * * * *

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

function localDateStr(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}

/** Format a list of pet names into natural language. */
function listNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

const PROMPTS: Array<(names: string, single: boolean) => { title: string; body: string }> = [
  (names, single) => ({
    title: `How ${single ? 'is' : 'are'} ${names} feeling today? 🐾`,
    body: `Tap to do a quick mood scan — it only takes a second!`,
  }),
  (names, single) => ({
    title: `Daily mood check-in 📸`,
    body: `No mood scan yet today for ${names}. Snap a photo to see how ${single ? 'they are' : 'they are all'} doing.`,
  }),
  (names, single) => ({
    title: `Time to check on ${names}! 🌟`,
    body: `How's ${single ? names + '\'s' : 'everyone\'s'} mood today? A quick scan keeps your trend going.`,
  }),
  (names, _single) => ({
    title: `Mood tracker 🐶`,
    body: `You haven't logged a mood scan for ${names} yet today. Tap to check in!`,
  }),
];

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

  // Group non-lost, non-deceased pets by owner
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

    // Only fire at 3 PM local time (staggered away from appointment 1-day reminder at 2 PM)
    if (h !== 15) continue;

    const today = localDateStr(ownerTz);

    // Already sent today for this user?
    const { count: alreadySent } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ownerId)
      .eq('type', 'mood_reminder')
      .contains('data', { date: today });

    if ((alreadySent ?? 0) > 0) continue;

    // Find which pets have zero mood scans today
    const unscannedPets: any[] = [];
    for (const pet of ownerPets) {
      const { count: scansToday } = await supabase
        .from('mood_logs')
        .select('id', { count: 'exact', head: true })
        .eq('pet_id', pet.id)
        .eq('date', today);

      if ((scansToday ?? 0) === 0) unscannedPets.push(pet);
    }

    if (!unscannedPets.length) continue;

    // Preference gate
    const { allowed } = await filterByPref(supabase, [ownerId], 'notif_daily');
    if (!allowed.length) continue;

    // Push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', ownerId)
      .like('token', 'ExponentPushToken%');

    if (!tokens?.length) continue;

    const dayOfYear = Math.floor(
      (new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
    );
    const names  = listNames(unscannedPets.map(p => p.name));
    const single = unscannedPets.length === 1;
    const { title, body } = PROMPTS[dayOfYear % PROMPTS.length](names, single);

    const petIds = unscannedPets.map(p => p.id);

    const { error: logErr } = await supabase.from('notification_logs').insert({
      user_id: ownerId, title, body,
      type: 'mood_reminder',
      data: { pet_ids: petIds, pet_id: petIds[0], date: today },
    });

    if (logErr) {
      console.error(`[mood-reminder] log insert failed for ${ownerId}:`, logErr.message);
      continue;
    }

    const messages = (tokens as { token: string }[]).map(t => ({
      to: t.token, sound: 'default', title, body,
      data: { type: 'mood_reminder', pet_ids: petIds, pet_id: petIds[0] },
      priority: 'normal',
      channelId: 'reminders',
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

  return json({ success: true, sent: totalSent });
});
