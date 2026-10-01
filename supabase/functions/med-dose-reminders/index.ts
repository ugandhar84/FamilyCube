// FamilyCube — Edge Function: med-dose-reminders
// Dose-time nudge to the medication's OWN subject — the piece that was
// missing entirely. med-reminders (this function's sibling) only escalates
// to PARENTS, and only 30+ minutes after a dose was missed, deliberately
// excluding the subject themselves (see its own header comment). Nothing
// else in this codebase ever pushed "it's time to take your medication" to
// the assigned person at their actual scheduled time (live-reported:
// "medication reminder nudges are not going to the person assigned").
//
// Fires once per medication per scheduled dose time, within a short window
// after that time arrives — not early, and not repeating for the same dose.
// family_medications.taken_dates (the real per-dose-time history —
// useMedications.ts's toggleMed) is checked so a dose already marked taken
// (e.g. logged early) is never nudged.
//
// Call on a cron, e.g. every 5 minutes: */5 * * * *
// Deploy: supabase functions deploy med-dose-reminders
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

// Same convention as med-reminders.ts — no per-medication timezone column,
// falls back to the subject's own member timezone.
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

// Mirrors encodeTakenEntry (features/vault/tabs/health/types.ts) — must
// stay byte-identical so a dose the app already marked taken is recognized
// here. Single-dose meds (one frequency_times entry) encode as a bare date;
// multi-dose meds encode as "date@HH:MM".
function encodeTakenEntry(date: string, time: string | null): string {
  return time ? `${date}@${time}` : date;
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
      .select('id, family_id, member_id, name, dosage, dosage_unit, frequency_times, taken_dates, dose_notified_entries, is_active, start_date, end_date')
      .eq('is_active', true);
    if (medsErr) throw new Error(`Meds fetch failed: ${medsErr.message}`);

    if (!meds?.length) return json({ ok: true, fired: 0, dryRun, message: 'No active meds' });

    const memberIds = [...new Set(meds.map(m => m.member_id).filter(Boolean))];
    const { data: members } = await supabase
      .from('members').select('id, name, timezone').in('id', memberIds.length ? memberIds : ['__none__']);
    const memberById: Record<string, any> = Object.fromEntries((members ?? []).map(m => [m.id, m]));

    const results: Record<string, unknown>[] = [];

    for (const med of meds) {
      const subject = memberById[med.member_id];
      if (!subject) { results.push({ medId: med.id, fired: false, reason: 'subject_not_found' }); continue; }
      const tz = subject.timezone || 'UTC';
      const today = localDateStr(tz);

      if (med.start_date && med.start_date > today) { results.push({ medId: med.id, fired: false, reason: 'not_started_yet' }); continue; }
      if (med.end_date && med.end_date < today) { results.push({ medId: med.id, fired: false, reason: 'course_ended' }); continue; }

      const times: string[] = Array.isArray(med.frequency_times) && med.frequency_times.length
        ? med.frequency_times : ['08:00'];
      const multiDose = times.length > 1;
      const takenDates: string[] = Array.isArray(med.taken_dates) ? med.taken_dates : [];
      // Old entries (prior days) are irrelevant and would otherwise grow
      // this column forever — trim to just today's entries before adding
      // any new one.
      let notifiedEntries: string[] = (Array.isArray(med.dose_notified_entries) ? med.dose_notified_entries : [])
        .filter((e: string) => e.startsWith(today));

      const { hour: nowH, minute: nowM } = localHourMinute(tz);
      const nowMins = nowH * 60 + nowM;

      for (const time of times) {
        const [h, m] = time.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        const doseMins = h * 60 + m;
        // Fire once the dose time has arrived, within a 10-minute catch-up
        // window — wide enough to survive a 5-minute cron tick landing
        // slightly late, narrow enough that a genuinely missed dose still
        // falls through to med-reminders' own 30-min escalation to parents
        // instead of this function nudging indefinitely.
        const minsSinceDose = nowMins - doseMins;
        if (minsSinceDose < 0 || minsSinceDose >= 10) continue;

        const entry = encodeTakenEntry(today, multiDose ? time : null);
        if (takenDates.includes(entry)) continue; // already logged taken
        if (notifiedEntries.includes(entry)) continue; // already nudged for this dose

        if (!dryRun) {
          await fetch(notifierUrl, {
            method: 'POST', headers: authHeader,
            body: JSON.stringify({
              type: 'medication_due', memberIds: [med.member_id], familyId: med.family_id,
              payload: {
                memberId: med.member_id,
                medName: med.name,
                dosage: med.dosage ? `${med.dosage}${med.dosage_unit ? ' ' + med.dosage_unit : ''}` : undefined,
              },
              persist: true,
            }),
          }).catch(e => console.warn('[med-dose-reminders] notifier error:', e.message));
        }

        notifiedEntries = [...notifiedEntries, entry];
        results.push({ medId: med.id, fired: true, time, entry });
      }

      if (!dryRun && notifiedEntries.length !== (med.dose_notified_entries ?? []).length) {
        await supabase.from('family_medications')
          .update({ dose_notified_entries: notifiedEntries })
          .eq('id', med.id);
      }
    }

    const fired = results.filter(r => r.fired).length;
    return json({ ok: true, fired, dryRun, results });

  } catch (err: any) {
    console.error('[med-dose-reminders] fatal:', err);
    return json({ ok: false, error: err.message }, 500);
  }
});
