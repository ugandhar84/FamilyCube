// PawBond — Edge Function: send-vaccine-reminder
// Runs hourly at :23. For each vaccine whose next_due falls in a reminder window:
//   • 7 days away  → "Due in 7 days"  (once per vaccine per due date)
//   • 1 day away   → "Due tomorrow"   (once per vaccine per due date)
//   • Today        → "Due today"      (once per vaccine per due date)
//   • Overdue      → "Overdue"        (once per ISO week until updated)
//
// Delivery rules:
//   • Only sends during 10–11 AM in each user's stored timezone (staggered: daily tip=8AM, breakfast=9AM, vaccine=10AM)
//   • Gated on notif_health preference + quiet hours
//   • Deduped via notification_logs — no spam across hourly runs
//
// Deploy:  supabase functions deploy send-vaccine-reminder
// Cron:    23 * * * *

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';
import { getBlockedPetIds } from '../_shared/petStatus.ts';
import { filterByTier } from '../_shared/requirePro.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isCronAuthorized(req: Request): boolean {
  const auth  = req.headers.get('authorization') ?? '';
  const token = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return auth === `Bearer ${token}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ── Timezone helpers ──────────────────────────────────────────────────────────

/** True when it is currently 10:00–10:59 AM in the given IANA timezone.
 *  Staggered to 10 AM so it doesn't collide with daily tip (8 AM) or breakfast reminder (9 AM). */
function isMorningFor(tz: string | null | undefined): boolean {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false,
      timeZone: tz ?? 'UTC',
    }).formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    return h >= 10 && h < 11;
  } catch {
    return now.getUTCHours() >= 8 && now.getUTCHours() < 10;
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Local date string "YYYY-MM-DD" for a given IANA timezone. */
function localDateStr(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Calendar days from today (in the given timezone) until a date string. Negative = overdue. */
function daysUntil(dateStr: string, tz?: string | null): number {
  const due = new Date(dateStr);
  const todayStr = localDateStr(tz);
  const today = new Date(todayStr);
  due.setUTCHours(0, 0, 0, 0);
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** ISO year-week string — dedup key for weekly overdue reminders. */
function isoWeek(d: Date): string {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now  = new Date();
  // +8 UTC days so UTC+14 users' local "7 days away" still lands in the query window.
  // Per-user reclassification below filters to exactly the right reminder type.
  const in7d = new Date(now.getTime() + 8 * 86_400_000).toISOString().slice(0, 10);

  // ── 1. Vaccines due within 7 days or overdue, for active pets ────────────
  const { data: vaccines, error: vacErr } = await supabase
    .from('vaccines')
    .select('id, pet_id, name, next_due, pets!inner(id, name, emoji, owner_id)')
    .not('next_due', 'is', null)
    .lte('next_due', in7d);

  if (vacErr) {
    console.error('[vaccine-reminder] query error:', vacErr);
    return json({ error: vacErr.message }, 500);
  }

  if (!vaccines || vaccines.length === 0) {
    return json({ success: true, sent: 0, reason: 'no vaccines due' });
  }

  // Filter out inactive / memorial / lost pets
  const allVacPetIds = [...new Set((vaccines as any[]).map((v: any) => v.pet_id))];
  const blockedSets = await getBlockedPetIds(supabase, allVacPetIds);
  const active = vaccines.filter((v: any) => {
    const p = v.pets;
    return p && p.is_active !== false && p.status !== 'memorial' && p.status !== 'deceased'
      && !blockedSets.lostIds.has(v.pet_id);
  });

  // ── 2. Dedup data — must load BEFORE the jobs loop so overdue cap check works ──
  // Key = userId:vaccineId:reminderType:nextDue so owner and each family member
  // are tracked independently — adding a family member later still gets their copy.
  const thisYear = now.getUTCFullYear();
  const { data: sentLogs } = await supabase
    .from('notification_logs')
    .select('user_id, data')
    .eq('type', 'vaccine_reminder')
    .gte('created_at', `${thisYear}-01-01T00:00:00Z`);

  // sentKeys = Set of "userId:vaccineId:reminderType:nextDue"
  const sentKeys = new Set<string>(
    (sentLogs ?? []).flatMap((l: any) => {
      const keys: string[] = (l.data as any)?.dedup_keys ?? [];
      return keys.map(k => `${l.user_id}:${k}`);
    })
  );

  // Count distinct weeks an overdue reminder fired per vaccine (cap = 4 weeks).
  const overdueWeeksByVaccine = new Map<string, Set<string>>();
  for (const l of (sentLogs ?? [])) {
    for (const k of ((l.data as any)?.dedup_keys ?? []) as string[]) {
      if (!k.includes(':overdue:')) continue;
      const [vacId, , weekStr] = k.split(':');
      if (!overdueWeeksByVaccine.has(vacId)) overdueWeeksByVaccine.set(vacId, new Set());
      overdueWeeksByVaccine.get(vacId)!.add(weekStr);
    }
  }

  // ── 3. Classify into reminder type + dedup key ────────────────────────────
  type ReminderType = '7d' | '1d' | 'today' | 'overdue';

  interface Job {
    vaccine: any;
    pet: any;
    ownerId: string;
    days: number;
    reminderType: ReminderType;
    // suffix shared across users — uid is prepended per recipient at send time
    dedupSuffix: string;
  }

  const jobs: Job[] = [];

  for (const v of active) {
    const pet  = (v as any).pets;
    const days = daysUntil(v.next_due);

    let reminderType: ReminderType;
    let dedupSuffix: string;

    if      (days === 7)  { reminderType = '7d';      dedupSuffix = `${v.id}:7d:${v.next_due}`; }
    else if (days === 1)  { reminderType = '1d';      dedupSuffix = `${v.id}:1d:${v.next_due}`; }
    else if (days === 0)  { reminderType = 'today';   dedupSuffix = `${v.id}:today:${v.next_due}`; }
    else if (days < 0) {
      // Cap overdue reminders at 4 weekly nudges — after that, stop until user updates the date.
      if ((overdueWeeksByVaccine.get(v.id)?.size ?? 0) >= 4) continue;
      reminderType = 'overdue'; dedupSuffix = `${v.id}:overdue:${isoWeek(now)}`;
    }
    else continue; // 2–6 days away — no reminder for those gaps

    jobs.push({ vaccine: v, pet, ownerId: pet.owner_id, days, reminderType, dedupSuffix });
  }

  if (jobs.length === 0) return json({ success: true, sent: 0, reason: 'no jobs in reminder windows' });

  // ── 4. Gather caretakers per pet (not caregiver/viewer — they don't do vet visits) ──
  const petIds = [...new Set(jobs.map(j => j.pet.id))];
  const { data: familyRows } = await supabase
    .from('pet_family')
    .select('pet_id, user_id')
    .in('pet_id', petIds)
    .eq('role', 'caretaker');

  const familyByPet = new Map<string, string[]>();
  for (const row of (familyRows ?? [])) {
    if (!familyByPet.has(row.pet_id)) familyByPet.set(row.pet_id, []);
    familyByPet.get(row.pet_id)!.push(row.user_id);
  }

  // ── 5. All recipient IDs for this run ─────────────────────────────────────
  const ownerIds   = [...new Set(jobs.map(j => j.ownerId))];
  const familyIds  = [...new Set(jobs.flatMap(j => familyByPet.get(j.pet.id) ?? []))];

  // ── 6. Subscription tier gate — vaccine reminders are a Pro+ feature ────────
  // Owners always receive reminders regardless of tier.
  // Caretakers inherit the pet owner's tier (context-tier rule):
  //   - gather the unique owner IDs for all caretaker family members
  //   - if a caretaker's pet owner is Pro+, that caretaker passes regardless of own tier
  //   - otherwise fall back to the caretaker's own tier

  // Build map: caretaker userId → their pet's ownerId
  const caretakerToOwner = new Map<string, string>();
  for (const job of jobs) {
    for (const uid of (familyByPet.get(job.pet.id) ?? [])) {
      caretakerToOwner.set(uid, job.ownerId);
    }
  }
  // Which owners are Pro+?
  const uniqueOwnerIds = [...new Set([...caretakerToOwner.values()])];
  const proOwnerIds = new Set(await filterByTier(supabase, uniqueOwnerIds, 'pro'));

  const tierAllowedFamilyIds = (
    await Promise.all(
      familyIds.map(async (uid) => {
        const ownerId = caretakerToOwner.get(uid);
        if (ownerId && proOwnerIds.has(ownerId)) return uid; // inherits Pro
        return null;
      })
    )
  ).filter(Boolean) as string[];

  // For caretakers not covered by owner inheritance, check own tier
  const notInherited = familyIds.filter(uid => !tierAllowedFamilyIds.includes(uid));
  const ownTierAllowed = await filterByTier(supabase, notInherited, 'pro');

  const allUserIds = [...new Set([...ownerIds, ...tierAllowedFamilyIds, ...ownTierAllowed])];

  // ── 7. Preference gate (notif_health) + quiet hours ───────────────────────
  const { allowed: allowedUserIds } = await filterByPref(supabase, allUserIds, 'notif_health');
  const allowedSet = new Set(allowedUserIds);

  // ── 8. Push tokens + timezones in parallel ────────────────────────────────
  const [tokenRes, tzRes] = await Promise.all([
    supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', allowedUserIds)
      .like('token', 'ExponentPushToken%'),
    supabase
      .from('profiles')
      .select('id, timezone')
      .in('id', allowedUserIds),
  ]);

  const tokensByUser = new Map<string, string[]>();
  for (const t of (tokenRes.data ?? [])) {
    if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
    tokensByUser.get(t.user_id)!.push(t.token);
  }

  const userTzMap = new Map<string, string | null>(
    (tzRes.data ?? []).map((r: any) => [r.id, r.timezone ?? null])
  );

  // ── 9. Build per-job messages, gated on morning window per user ───────────
  function buildMessage(job: Job): { title: string; body: string } {
    const petLabel = `${job.pet.emoji ?? ''} ${job.pet.name}`.trim();
    const absDays  = Math.abs(job.days);
    switch (job.reminderType) {
      case '7d':
        return {
          title: `💉 Vaccination due in 7 days`,
          body:  `${petLabel}'s ${job.vaccine.name} is due in 7 days. Book your vet soon.`,
        };
      case '1d':
        return {
          title: `💉 Vaccination due tomorrow`,
          body:  `${petLabel}'s ${job.vaccine.name} is due tomorrow. Don't forget the vet!`,
        };
      case 'today':
        return {
          title: `💉 Vaccination due today`,
          body:  `${petLabel}'s ${job.vaccine.name} is due today. Time to visit the vet!`,
        };
      case 'overdue':
        return {
          title: `⚠️ Vaccination overdue`,
          body:  `${petLabel}'s ${job.vaccine.name} was due ${absDays} day${absDays !== 1 ? 's' : ''} ago. Please schedule a vet visit.`,
        };
    }
  }

  // ── 9b. Group jobs per recipient user — ONE bundled push per user ───────────
  // Map: userId → list of jobs (with per-user timezone reclassification) that passed all gates
  const jobsByUser = new Map<string, Job[]>();

  for (const job of jobs) {
    const recipients = [
      job.ownerId,
      ...(familyByPet.get(job.pet.id) ?? []),
    ];

    for (const uid of recipients) {
      if (!allowedSet.has(uid)) continue;
      const tz = userTzMap.get(uid);
      if (tz && !isMorningFor(tz)) continue;

      // Reclassify using this user's local date so UTC+/- users get the right label and dedup key.
      const localDays = daysUntil(job.vaccine.next_due, tz);
      let localType: ReminderType;
      let localSuffix: string;
      if      (localDays === 7) { localType = '7d';      localSuffix = `${job.vaccine.id}:7d:${job.vaccine.next_due}`; }
      else if (localDays === 1) { localType = '1d';      localSuffix = `${job.vaccine.id}:1d:${job.vaccine.next_due}`; }
      else if (localDays === 0) { localType = 'today';   localSuffix = `${job.vaccine.id}:today:${job.vaccine.next_due}`; }
      else if (localDays < 0)  { localType = 'overdue'; localSuffix = `${job.vaccine.id}:overdue:${isoWeek(now)}`; }
      else continue; // outside reminder windows for this user's timezone

      if (sentKeys.has(`${uid}:${localSuffix}`)) continue;

      const userJob: Job = { ...job, days: localDays, reminderType: localType, dedupSuffix: localSuffix };
      if (!jobsByUser.has(uid)) jobsByUser.set(uid, []);
      jobsByUser.get(uid)!.push(userJob);
    }
  }

  // Build one bundled message per user listing all their pending vaccines
  function buildBundledMessage(userJobs: Job[]): { title: string; body: string } {
    if (userJobs.length === 1) return buildMessage(userJobs[0]);

    // Summarise urgency by worst-case type in this batch
    const types = userJobs.map(j => j.reminderType);
    const urgent = types.includes('today') || types.includes('overdue');
    const title = urgent ? `⚠️ ${userJobs.length} vaccines need attention` : `💉 ${userJobs.length} vaccines coming up`;

    const lines = userJobs.map(j => {
      const label = `${j.pet.emoji ?? ''} ${j.pet.name}`.trim();
      const absDays = Math.abs(j.days);
      const when =
        j.reminderType === 'today'    ? 'today'
        : j.reminderType === '1d'    ? 'tomorrow'
        : j.reminderType === '7d'    ? 'in 7 days'
        : `${absDays}d overdue`;
      return `${label}: ${j.vaccine.name} (${when})`;
    }).join(', ');

    return { title, body: lines };
  }

  const pushMessages: any[] = [];
  const logRows: any[]      = [];

  for (const [uid, userJobs] of jobsByUser) {
    const { title, body } = buildBundledMessage(userJobs);
    const petIds   = [...new Set(userJobs.map(j => j.pet.id))];
    const vacIds   = userJobs.map(j => j.vaccine.id);
    const dedupKeys = userJobs.map(j => j.dedupSuffix);

    logRows.push({
      user_id: uid, title, body,
      type: 'vaccine_reminder',
      data: {
        pet_ids:       petIds,
        pet_id:        petIds[0],
        vaccine_ids:   vacIds,
        dedup_keys:    dedupKeys,
        // Also store individual dedup keys so the sentKeys check works on re-runs
        ...Object.fromEntries(dedupKeys.map(k => [`dedup_key_${k}`, true])),
      },
    });

    for (const token of (tokensByUser.get(uid) ?? [])) {
      pushMessages.push({
        to: token, sound: 'default', title, body,
        data: { type: 'vaccine_reminder', pet_ids: petIds, pet_id: petIds[0], vaccine_ids: vacIds },
        priority: 'high',
        channelId: 'reminders',
      });
    }
  }

  // ── 10. Write in-app logs ─────────────────────────────────────────────────
  if (logRows.length > 0) {
    const { error: logErr } = await supabase.from('notification_logs').insert(logRows);
    if (logErr) console.error('[vaccine-reminder] log insert error:', logErr);
  }

  // ── 10. Send push in batches of 100 ──────────────────────────────────────
  let sentCount = 0;
  for (let i = 0; i < pushMessages.length; i += 100) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(pushMessages.slice(i, i + 100)),
      });
      if (res.ok) {
        const result = await res.json();
        sentCount += (result.data ?? []).filter((d: any) => d.status === 'ok').length;
      } else {
        console.error('[vaccine-reminder] Expo batch failed:', res.status);
      }
    } catch (err) {
      console.error('[vaccine-reminder] fetch error:', err);
    }
  }

  return json({
    success: true,
    sent: sentCount,
    logged: logRows.length,
    vaccinesChecked: vaccines.length,
    pending: jobs.length,
  });
});
