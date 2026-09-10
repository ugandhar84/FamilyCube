// FamilyCube — Edge Function: homeowner-notes-sweeper
// Runs daily (Supabase cron). For every active (not completed) homeowner
// note with a due_date, sends a push via family-notifier to every parent
// in that family: once when the note is exactly 7 days from due, and again
// on the due day itself [live-requested: "a week before and on the day"].
// week_before_notified_at/due_day_notified_at (migration
// 20260948300000_homeowner_notes_reminder_tracking.sql) guard against
// re-sending the same reminder every time this sweep runs on the same day.
//
// Cron schedule (see accompanying migration's cron.schedule call):
//   once daily, 13:00 UTC (roughly morning US time)
//
// Deploy: supabase functions deploy homeowner-notes-sweeper
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function fmtDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    const weekOutStr = new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);

    const { data: notes, error } = await supabase
      .from('homeowner_notes')
      .select('id, family_id, title, due_date, week_before_notified_at, due_day_notified_at')
      .is('completed_at', null)
      .in('due_date', [todayStr, weekOutStr]);
    if (error) throw new Error(`notes fetch failed: ${error.message}`);

    let weekBeforeSent = 0;
    let dueDaySent = 0;
    const errors: string[] = [];

    for (const note of notes ?? []) {
      try {
        const now = new Date().toISOString();

        if (note.due_date === weekOutStr && !note.week_before_notified_at) {
          const { error: notifyErr } = await supabase.functions.invoke('family-notifier', {
            body: {
              type: 'homeowner_note_due',
              familyId: note.family_id,
              persist: true,
              payload: { when: 'week_before', title: note.title, noteId: note.id, dueDateDisplay: fmtDateDisplay(note.due_date) },
            },
          });
          if (notifyErr) throw new Error(notifyErr.message ?? 'family-notifier invoke failed');
          await supabase.from('homeowner_notes').update({ week_before_notified_at: now }).eq('id', note.id);
          weekBeforeSent++;
        }

        if (note.due_date === todayStr && !note.due_day_notified_at) {
          const { error: notifyErr } = await supabase.functions.invoke('family-notifier', {
            body: {
              type: 'homeowner_note_due',
              familyId: note.family_id,
              persist: true,
              payload: { when: 'today', title: note.title, noteId: note.id, dueDateDisplay: fmtDateDisplay(note.due_date) },
            },
          });
          if (notifyErr) throw new Error(notifyErr.message ?? 'family-notifier invoke failed');
          await supabase.from('homeowner_notes').update({ due_day_notified_at: now }).eq('id', note.id);
          dueDaySent++;
        }
      } catch (e: any) {
        errors.push(`note ${note.id}: ${e.message}`);
      }
    }

    return json({ ok: true, notesChecked: notes?.length ?? 0, weekBeforeSent, dueDaySent, errors });
  } catch (err: any) {
    console.error('[homeowner-notes-sweeper] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
