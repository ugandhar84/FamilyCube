// PawBond — Edge Function: send-lost-owner-checkin
//
// Runs every hour. For each active lost alert, sends warm check-in messages
// to the pet PARENT at 5 defined milestones after the alert was created:
//
//   6h  — Reassurance + immediate action tips
//   24h — Community update: how many neighbours were alerted
//   4d  — Extended search tips (NextDoor, Facebook, microchip registry)
//   7d  — Gentle mid-search check-in + mark-as-found CTA
//   14d — Final warm message + strong mark-as-found CTA
//
// Dedup: one message per (alert_id, phase) stored in notification_logs.
// Respects quiet hours via shared prefs helper.
//
// Deploy:  supabase functions deploy send-lost-owner-checkin
// Cron:    0 * * * *  (every hour)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';

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
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CRON_SECRET = Deno.env.get('CRON_SECRET');
  const incoming = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  return CRON_SECRET ? incoming === CRON_SECRET : incoming === SERVICE_KEY;
}

function localHour(tz: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  } catch { return new Date().getUTCHours(); }
}

// ── Check-in phases ────────────────────────────────────────────────────────────
// afterHours: minimum hours since alert was created before this phase fires.
// deliverHour: local hour (0-23) at which the push is delivered. -1 = any hour.

interface Phase {
  id: string;
  afterHours: number;
  deliverHour: number; // preferred local hour, -1 = any (for 6h which is time-sensitive)
  title: (petName: string, petEmoji: string) => string;
  body:  (petName: string, neighboursAlerted: number) => string;
}

const PHASES: Phase[] = [
  {
    id: '6h',
    afterHours: 6,
    deliverHour: -1, // fire as soon as the window opens
    title: (name, emoji) => `${emoji} We're searching for ${name}`,
    body: (name) =>
      `Your alert is out there — neighbours are watching. While you wait:\n` +
      `• Call nearby vets & shelters with ${name}'s microchip number\n` +
      `• Put an unwashed piece of your clothing outside — the scent helps\n` +
      `• Post in local Facebook groups & Nextdoor with today's photo\n\n` +
      `You're doing everything right. 🐾`,
  },
  {
    id: '24h',
    afterHours: 24,
    deliverHour: 10, // 10 AM local
    title: (name, emoji) => `${emoji} Still looking for ${name} — Day 2`,
    body: (name, alerted) =>
      `${alerted > 0 ? `${alerted} neighbours` : 'Your community'} have been alerted and are keeping an eye out for ${name}.\n\n` +
      `Today's tip: refresh your lost-pet post with a new photo or detail — algorithms favour new activity and more people will see it.\n\n` +
      `Tap to update your alert or share to social media. 💛`,
  },
  {
    id: '4d',
    afterHours: 96,
    deliverHour: 10,
    title: (name, emoji) => `${emoji} Day 4 — keep the search going`,
    body: (name) =>
      `Most pets are found within the first week — there's real reason for hope.\n\n` +
      `Next steps:\n` +
      `• Register ${name} as missing at petfbi.org & pawboost.com\n` +
      `• Contact your microchip registry to mark as lost\n` +
      `• Flyers near schools, dog parks, and food spots work — pets follow food\n\n` +
      `We're rooting for you and ${name}. 🌟`,
  },
  {
    id: '7d',
    afterHours: 168,
    deliverHour: 10,
    title: (name, emoji) => `${emoji} One week — how are you holding up?`,
    body: (name) =>
      `A week is a long time and we know how hard this is. ${name} is still out there and so is your community.\n\n` +
      `If ${name} has been found, please mark the alert as resolved — it lets your neighbours know and helps reunite other lost pets faster.\n\n` +
      `Sending you strength. 🐾💙`,
  },
  {
    id: '14d',
    afterHours: 336,
    deliverHour: 10,
    title: (name, emoji) => `${emoji} Still searching for ${name}`,
    body: (name) =>
      `Two weeks and you haven't given up — that says everything about how much ${name} means to you.\n\n` +
      `A few last things to try:\n` +
      `• Set a humane trap near your home with familiar bedding & food\n` +
      `• Check your neighbourhood's security cameras\n` +
      `• Contact local animal control daily — intakes aren't always online\n\n` +
      `If ${name} comes home, tap "Mark as Found" — we'd love to hear the good news. 🎉`,
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = Date.now();

  // Fetch all active (not found, not expired) lost alerts with pet + reporter info
  const { data: alerts, error: alertsErr } = await supabase
    .from('lost_alerts')
    .select(`
      id, created_at, expires_at, reported_by, pet_id,
      pets ( name, emoji, owner_id ),
      profiles!lost_alerts_reported_by_fkey ( id, timezone )
    `)
    .eq('is_found', false)
    .order('created_at', { ascending: true });

  if (alertsErr || !alerts?.length) {
    return json({ success: true, sent: 0, reason: alertsErr?.message ?? 'no active alerts' });
  }

  // How many neighbours were alerted per alert (for the 24h message)
  const alertIds = alerts.map((a: any) => a.id);
  const { data: recipientCounts } = await supabase
    .from('alert_recipients')
    .select('alert_id')
    .in('alert_id', alertIds);

  const neighboursMap: Record<string, number> = {};
  for (const row of (recipientCounts ?? []) as any[]) {
    neighboursMap[row.alert_id] = (neighboursMap[row.alert_id] ?? 0) + 1;
  }

  let totalSent = 0;

  for (const alert of alerts as any[]) {
    const pet      = alert.pets;
    const ownerId  = pet?.owner_id ?? alert.reported_by;
    if (!ownerId || !pet) continue;

    const ownerTz      = alert.profiles?.timezone ?? null;
    const localH       = localHour(ownerTz);
    const ageHours     = (now - new Date(alert.created_at).getTime()) / 3_600_000;
    const neighboursAlerted = neighboursMap[alert.id] ?? 0;

    // Preference gate — use the sos/lost pref bucket
    const { allowed } = await filterByPref(supabase, [ownerId], 'notif_lost');
    if (!allowed.length) continue;

    // Push token
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', ownerId)
      .like('token', 'ExponentPushToken%')
      .limit(5);
    if (!tokens?.length) continue;

    for (const phase of PHASES) {
      // Not yet reached this phase's time window
      if (ageHours < phase.afterHours) break; // phases are ordered — no point checking further

      // Quiet hours: prefer deliverHour, but allow ±1h window; skip entirely if user is asleep
      if (phase.deliverHour >= 0) {
        const diff = Math.abs(localH - phase.deliverHour);
        const crossesMidnight = Math.abs(localH - phase.deliverHour + 24) <= 1 || Math.abs(localH - phase.deliverHour - 24) <= 1;
        if (diff > 1 && !crossesMidnight) continue;
        // Hard quiet hours: never push between midnight and 7 AM
        if (localH >= 0 && localH < 7) continue;
      }

      // Dedup: only send each phase once per alert
      const { count: alreadySent } = await supabase
        .from('notification_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ownerId)
        .eq('type', 'lost_owner_checkin')
        .contains('data', { alert_id: alert.id, phase: phase.id });

      if ((alreadySent ?? 0) > 0) continue;

      const title = phase.title(pet.name, pet.emoji ?? '🐾');
      const body  = phase.body(pet.name, neighboursAlerted);

      // Log first (prevents double-send if push fails)
      const { error: logErr } = await supabase.from('notification_logs').insert({
        user_id: ownerId,
        title,
        body,
        type: 'lost_owner_checkin',
        data: {
          alert_id: alert.id,
          pet_id: alert.pet_id,
          pet_name: pet.name,
          phase: phase.id,
          neighbours_alerted: neighboursAlerted,
        },
      });
      if (logErr) {
        console.error(`[lost-owner-checkin] log failed for alert ${alert.id} phase ${phase.id}:`, logErr.message);
        continue;
      }

      const messages = (tokens as { token: string }[]).map(t => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: {
          type: 'lost_owner_checkin',
          alert_id: alert.id,
          pet_id: alert.pet_id,
          phase: phase.id,
          screen: 'sos',
        },
        priority: 'normal',
        channelId: 'lost_alerts',
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

      console.log(`[lost-owner-checkin] ✅ Sent phase ${phase.id} for alert ${alert.id} (${pet.name})`);
    }
  }

  return json({ success: true, sent: totalSent });
});
