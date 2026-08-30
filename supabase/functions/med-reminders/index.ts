// FamilyCube — Edge Function: med-reminders
// Missed-dose escalation to parents. family_medications' actual "taken"
// state (what HealthTab.tsx/useMedications.ts's toggleMed reads/writes) is
// a single per-day taken_date flag, not per-dose-time — so this can only
// ever detect "no dose logged yet today," not which specific dose time was
// missed when a medication has multiple frequency_times. Escalates once
// per medication per day, after the LATEST scheduled time of the day has
// passed by escalation_after_min (defaults to 30, matching the user's
// explicit ask — "after 30min past" — for any medication that hasn't set
// its own value via AddMedModal's Missed-Dose Alert step).
//
// Call on a cron, e.g. every 10 minutes: */10 * * * *
// Deploy: supabase functions deploy med-reminders
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

// No per-medication timezone column exists (unlike calendar_events/
// family_meals) — frequency_times are plain "HH:MM" 24h strings with no
// stated zone. Falls back to the family's own representative-member
// timezone, same convention ask-cube/index.ts and grocery-reminders both
// already use.
function localHourMinute(timeZone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    return {
      hour: parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10),
      minute: parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10),
    };
  } catch {
    const now = new Date();
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

function localDateStr(timeZone: string, when?: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(when ?? new Date());
  } catch {
    return (when ?? new Date()).toISOString().slice(0, 10);
  }
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

    const { data: meds, error: medsErr } = await supabase
      .from('family_medications')
      .select('id, family_id, member_id, name, frequency_times, taken_date, escalation_enabled, escalation_after_min, last_escalated_at, is_active, start_date, end_date')
      .eq('is_active', true)
      .eq('escalation_enabled', true);
    if (medsErr) throw new Error(`Meds fetch failed: ${medsErr.message}`);

    if (!meds?.length) return json({ ok: true, fired: 0, dryRun, message: 'No escalation-enabled meds' });

    const familyIds = [...new Set(meds.map(m => m.family_id).filter(Boolean))];
    const { data: members } = await supabase
      .from('members').select('id, name, role, family_id, timezone').in('family_id', familyIds.length ? familyIds : ['__none__']);
    const memberById: Record<string, any> = {};
    const parentsByFamily: Record<string, { id: string }[]> = {};
    for (const m of (members ?? [])) {
      memberById[m.id] = m;
      if (m.role === 'parent') (parentsByFamily[m.family_id] ??= []).push({ id: m.id });
    }

    const results: Record<string, unknown>[] = [];

    for (const med of meds) {
      const subject = memberById[med.member_id];
      const tz = subject?.timezone || 'UTC';
      const today = localDateStr(tz);

      // Within the medication's own active date range, if set.
      if (med.start_date && med.start_date > today) { results.push({ medId: med.id, fired: false, reason: 'not_started_yet' }); continue; }
      if (med.end_date && med.end_date < today) { results.push({ medId: med.id, fired: false, reason: 'course_ended' }); continue; }

      if (med.taken_date === today) { results.push({ medId: med.id, fired: false, reason: 'already_taken_today' }); continue; }

      // Already escalated today — once per medication per day, not once
      // per cron tick. last_escalated_at is a UTC timestamptz; comparing
      // its raw date substring against `today` (computed in the subject's
      // OWN timezone) breaks for any zone behind UTC, since a UTC
      // timestamp written at, say, 9:33pm Eastern already reads as the
      // NEXT calendar day in UTC — confirmed live: a med escalated once
      // still re-fired on the very next sweep because of exactly this
      // mismatch. Convert last_escalated_at into the same local zone
      // before comparing.
      if (med.last_escalated_at && localDateStr(tz, new Date(med.last_escalated_at)) === today) {
        results.push({ medId: med.id, fired: false, reason: 'already_escalated_today' });
        continue;
      }

      const times: string[] = Array.isArray(med.frequency_times) ? med.frequency_times : [];
      if (!times.length) { results.push({ medId: med.id, fired: false, reason: 'no_scheduled_times' }); continue; }

      const { hour: nowH, minute: nowM } = localHourMinute(tz);
      const nowMins = nowH * 60 + nowM;
      const leadMin = med.escalation_after_min || 30;

      // Escalate off the LATEST scheduled time that has already passed by
      // leadMin — a med with two dose times isn't nagged about the morning
      // dose while the evening one hasn't even arrived yet.
      const passedTimes = times
        .map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; })
        .filter(mins => !isNaN(mins) && nowMins - mins >= leadMin);
      if (!passedTimes.length) { results.push({ medId: med.id, fired: false, reason: 'no_dose_time_past_lead_window_yet' }); continue; }

      // Excludes the medication's own subject even when they're a parent
      // themselves (e.g. a parent tracking their own prescription) — the
      // whole point of an escalation is telling someone ELSE that this
      // person hasn't logged their dose; the subject already knows.
      // Otherwise they'd get a push phrased in the third person about their
      // own missed dose (confirmed live: "Praveena hasn't logged..." sent
      // straight to Praveena).
      const memberIds = (parentsByFamily[med.family_id] ?? [])
        .map(p => p.id)
        .filter(id => id !== med.member_id);
      if (!memberIds.length) { results.push({ medId: med.id, fired: false, reason: 'no_parents_besides_subject' }); continue; }

      const minutesLate = nowMins - Math.max(...passedTimes);

      if (!dryRun) {
        await fetch(notifierUrl, {
          method: 'POST', headers: authHeader,
          body: JSON.stringify({
            type: 'medication_missed', memberIds, familyId: med.family_id,
            payload: {
              subjectMemberId: med.member_id, memberName: subject?.name,
              medName: med.name, minutesLate,
            },
            persist: true,
          }),
        }).catch(e => console.warn('[med-reminders] notifier error:', e.message));

        await supabase.from('family_medications').update({ last_escalated_at: new Date().toISOString() }).eq('id', med.id);
      }

      results.push({ medId: med.id, fired: true, minutesLate });
    }

    const fired = results.filter(r => r.fired).length;
    return json({ ok: true, fired, dryRun, results });

  } catch (err: any) {
    console.error('[med-reminders] fatal:', err);
    return json({ ok: false, error: err.message }, 500);
  }
});
