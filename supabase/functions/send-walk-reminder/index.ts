// PawBond — Edge Function: send-walk-reminder
// Runs every 30 minutes. At 7:00–7:30 PM local time, checks if a walk was
// logged today for each "walkable" pet (dog, cat, rabbit). Sends ONE bundled
// push per owner for all unwalkd pets. Skips if any walk was already logged.
//
// Walk check window: any walk logged between 00:00–19:00 local time today.
// Notify window:     19:00–19:30 local time (once per pet per day).
//
// Deploy:  supabase functions deploy send-walk-reminder
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

/** Pet species that should get walk reminders */
const WALKABLE_SPECIES = new Set(['dog', 'cat', 'rabbit']);

/** Format a list of pet names naturally: "Max", "Max and Luna", "Max, Luna, and Buddy" */
function listNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Only fetch walkable species
  const { data: pets } = await supabase
    .from('pets')
    .select(`id, name, emoji, species, owner_id, profiles!pets_owner_id_fkey ( id, timezone )`)
    .eq('is_active', true)
    .in('species', [...WALKABLE_SPECIES]);

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
    const m       = localMinute(ownerTz);
    const today   = localDateStr(ownerTz);

    // Only fire at 18:00–18:30 local time (before dinner at 19:00)
    if (h !== 18 || m > 30) continue;

    // Already sent a walk reminder today for this user?
    const { count: alreadySent } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ownerId)
      .eq('type', 'walk_reminder')
      .contains('data', { date: today });

    if ((alreadySent ?? 0) > 0) continue;

    // Preference gate — reuse notif_daily flag
    const { allowed } = await filterByPref(supabase, [ownerId], 'notif_daily');
    if (!allowed.length) continue;

    // Find pets with no walk logged today
    const unwalkedPets: any[] = [];
    for (const pet of ownerPets) {
      const { count: logged } = await supabase
        .from('daily_checklist')
        .select('id', { count: 'exact', head: true })
        .eq('pet_id', pet.id)
        .eq('type', 'walk')
        .eq('completed', true)
        .eq('date', today);

      if ((logged ?? 0) === 0) unwalkedPets.push(pet);
    }

    if (!unwalkedPets.length) continue;

    // Push tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', ownerId)
      .like('token', 'ExponentPushToken%');

    if (!tokens?.length) continue;

    const names = listNames(unwalkedPets.map(p => p.name));
    const title = `🦮 Time for a walk!`;
    const body  = unwalkedPets.length === 1
      ? `${unwalkedPets[0].emoji ?? '🐾'} ${names} hasn't been walked today. A quick stroll goes a long way!`
      : `${names} haven't been walked today. Time for an evening stroll!`;

    const petIds = unwalkedPets.map(p => p.id);

    // Log for dedup — abort push if insert fails (prevents duplicates on constraint errors)
    const { error: logErr } = await supabase.from('notification_logs').insert({
      user_id: ownerId, title, body,
      type: 'walk_reminder',
      data: { pet_ids: petIds, pet_id: petIds[0], date: today },
    });

    if (logErr) {
      console.error(`[walk-reminder] log insert failed for ${ownerId}:`, logErr.message);
      continue;
    }

    const messages = (tokens as { token: string }[]).map(t => ({
      to: t.token, sound: 'default', title, body,
      data: { type: 'walk_reminder', pet_ids: petIds, pet_id: petIds[0] },
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
