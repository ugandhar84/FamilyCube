// PawBond — Edge Function: send-appointment-reminder
// Runs every hour. Fires three reminder windows per appointment:
//   7d  → 10:00 AM local time, 7 days before
//   1d  → 2:00 PM local time, 1 day before
//   2h  → within 2 hours of the appointment
// Each window uses its own DB flag so only one notification fires per window.
//
// Deploy:  supabase functions deploy send-appointment-reminder
// Cron:    0 * * * *

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';
import { getBlockedPetIds, isBlocked } from '../_shared/petStatus.ts';
import { filterByTier } from '../_shared/requirePro.ts';

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

/** Local hour (0–23) for a user's timezone right now. */
function localHour(tz: string | null | undefined): number {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(now);
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  } catch {
    return now.getUTCHours();
  }
}

/** Format appointment time in a user's timezone. */
function fmtTime(aptDate: Date, tz: string | null | undefined): string {
  try {
    return aptDate.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: tz ?? 'UTC',
    });
  } catch {
    return aptDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }
}

/** Format a date for display (e.g. "Mon Jul 21"). */
function fmtDate(aptDate: Date, tz: string | null | undefined): string {
  try {
    return aptDate.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: tz ?? 'UTC',
    });
  } catch {
    return aptDate.toDateString();
  }
}

type Window = '7d' | '1d' | '2h' | 'done';

interface WindowConfig {
  flag:     string;       // DB column name
  minMs:    number;       // appointment must be at least this far away
  maxMs:    number;       // appointment must be at most this far away
  localHourMin: number;   // only fire in this local hour range (7d, 1d windows)
  localHourMax: number;
  use2hLogic: boolean;    // 2h window fires any time of day
}

const WINDOWS: Record<Window, WindowConfig> = {
  'done': {
    flag: 'reminder_complete_sent',
    minMs: -24 * 60 * 60 * 1000,  // up to 24h PAST (widened from 3h — catches all same-day + next-morning checks)
    maxMs: -1  * 60 * 60 * 1000,  // at least 1h past
    localHourMin: 0, localHourMax: 24,
    use2hLogic: true,
  },
  '7d': {
    flag: 'reminder_7d_sent',
    minMs: 6.5 * 24 * 60 * 60 * 1000,  // 6.5 days
    maxMs: 7.5 * 24 * 60 * 60 * 1000,  // 7.5 days
    localHourMin: 10, localHourMax: 11, // fire at 10 AM local
    use2hLogic: false,
  },
  '1d': {
    flag: 'reminder_1d_sent',
    minMs: 20 * 60 * 60 * 1000,   // 20h
    maxMs: 28 * 60 * 60 * 1000,   // 28h
    localHourMin: 14, localHourMax: 15, // fire at 2 PM local
    use2hLogic: false,
  },
  '2h': {
    flag: 'reminder_2h_sent',
    minMs: 0,
    maxMs: 2.25 * 60 * 60 * 1000, // 2h 15min
    localHourMin: 0, localHourMax: 24,  // any time
    use2hLogic: true,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date();
  let totalSent = 0;

  for (const [windowKey, cfg] of Object.entries(WINDOWS) as [Window, WindowConfig][]) {
    // For 'done' window: look for past appointments not yet completed/cancelled
    const windowMin = new Date(now.getTime() + cfg.minMs);
    const windowMax = new Date(now.getTime() + cfg.maxMs);

    const baseQuery = supabase
      .from('appointments')
      .select('*, pets(name, emoji, owner_id, accent_color)')
      .eq(cfg.flag, false);

    const { data: appointments } = windowKey === 'done'
      ? await baseQuery
          .not('status', 'in', '("completed","cancelled")')
          .eq('reminder_2h_sent', true)   // only prompt if the user was actually reminded
          .gte('scheduled_at', windowMin.toISOString())
          .lte('scheduled_at', windowMax.toISOString())
      : await baseQuery
          .in('status', ['scheduled', 'upcoming'])
          .gte('scheduled_at', windowMin.toISOString())
          .lte('scheduled_at', windowMax.toISOString());

    if (!appointments?.length) continue;

    const apptPetIds = [...new Set((appointments as any[]).map((a: any) => a.pet_id))];
    const blockedSets = await getBlockedPetIds(supabase, apptPetIds);

    for (const apt of appointments) {
      const pet = apt.pets;
      if (!pet) continue;
      if (isBlocked(apt.pet_id, blockedSets)) continue;

      const aptTime = new Date(apt.scheduled_at);
      const diffMs  = aptTime.getTime() - now.getTime();
      const hoursUntil = Math.round(diffMs / (1000 * 60 * 60));

      // Build recipient list: owner + caretakers
      const { data: familyMembers } = await supabase
        .from('pet_family')
        .select('user_id')
        .eq('pet_id', apt.pet_id)
        .eq('role', 'caretaker');

      const familyIds = (familyMembers ?? []).map((m: any) => m.user_id);
      const ownerIsProPlus = (await filterByTier(supabase, [pet.owner_id], 'pro')).length > 0;
      const tierAllowed = ownerIsProPlus
        ? [...new Set(familyIds)]
        : await filterByTier(supabase, [...new Set(familyIds)], 'pro');
      const allUserIds = [...new Set([pet.owner_id, ...tierAllowed])];

      // Preference + quiet hours gate
      const { allowed: allowedIds } = await filterByPref(supabase, allUserIds, 'notif_appointment');
      if (!allowedIds.length) continue;

      // Get tokens + timezones
      const [tokenRes, tzRes] = await Promise.all([
        supabase.from('push_tokens').select('user_id, token')
          .in('user_id', allowedIds).like('token', 'ExponentPushToken%'),
        supabase.from('profiles').select('id, timezone').in('id', allowedIds),
      ]);

      const tokens = (tokenRes.data ?? []) as { user_id: string; token: string }[];
      const userTzMap = new Map<string, string | null>(
        (tzRes.data ?? []).map((r: any) => [r.id, r.timezone ?? null]),
      );

      // For 7d/1d windows: only fire in the target local hour
      const filteredTokens = cfg.use2hLogic
        ? tokens
        : tokens.filter(t => {
            const h = localHour(userTzMap.get(t.user_id));
            return h >= cfg.localHourMin && h < cfg.localHourMax;
          });

      if (!filteredTokens.length) continue;

      // Build notification copy per window
      const buildNotif = (token: string, userId: string): object => {
        const tz = userTzMap.get(userId);
        const timeStr = fmtTime(aptTime, tz);
        const dateStr = fmtDate(aptTime, tz);
        const clinic  = apt.clinic_name ?? 'the vet';
        const petEmoji = pet.emoji ?? '🐾';

        let title: string;
        let body: string;

        if (windowKey === 'done') {
          title = `✅ How did ${pet.name}'s appointment go?`;
          body  = `${petEmoji} ${apt.type} at ${clinic} was earlier today. Tap to mark it as complete.`;
        } else if (windowKey === '7d') {
          title = `📅 Upcoming vet visit next week!`;
          body  = `${petEmoji} ${pet.name}'s ${apt.type} on ${dateStr} at ${timeStr} · ${clinic}. Need to reschedule? Tap for clinic info.`;
        } else if (windowKey === '1d') {
          title = `📅 Vet appointment tomorrow`;
          body  = `${petEmoji} ${pet.name}'s ${apt.type} is tomorrow at ${timeStr} · ${clinic}. Get the carrier/leash ready!`;
        } else {
          title = `🚗 Vet appointment in ${hoursUntil < 1 ? 'under an hour' : `${hoursUntil}h`}`;
          body  = `${petEmoji} ${pet.name}'s ${apt.type} starts at ${timeStr} · ${clinic}. Time to head out!`;
        }

        return {
          to: token, sound: 'default', title, body,
          data: {
            type: windowKey === 'done' ? 'appointment_complete_prompt' : 'appointment_reminder',
            window: windowKey,
            appointment_id: apt.id,
            pet_id: apt.pet_id,
          },
          priority: windowKey === '2h' ? 'high' : 'normal',
          channelId: 'reminders',
        };
      };

      const messages = filteredTokens.map(t => buildNotif(t.token, t.user_id));

      // Mark window as sent before firing (idempotent on retry)
      await supabase.from('appointments').update({ [cfg.flag]: true }).eq('id', apt.id);

      // In-app notification log
      const logType = windowKey === 'done' ? 'appointment_complete_prompt' : 'appointment_reminder';
      await supabase.from('notification_logs').insert(
        filteredTokens.map(t => {
          const msg = buildNotif(t.token, t.user_id) as any;
          return {
            user_id: t.user_id,
            title:   msg.title,
            body:    msg.body,
            type:    logType,
            data:    { appointment_id: apt.id, window: windowKey },
          };
        }),
      );

      // Push — batch 100
      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100);
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });
        if (res.ok) {
          const result = await res.json();
          totalSent += (result.data ?? []).filter((d: any) => d.status === 'ok').length;
        } else {
          console.error(`[appointment-reminder] Expo batch ${windowKey} failed: ${res.status}`);
        }
      }
    }
  }

  return json({ success: true, sent: totalSent });
});
