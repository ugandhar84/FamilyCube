// FamilyCube — Edge Function: calendar-google-tasks-poll
// Inbound-only sync: Google Tasks (a completely separate API from Google
// Calendar — tasks.googleapis.com, its own tasks.readonly OAuth scope)
// becomes a Chore in the Quests tab. A Google Task created via the
// Calendar app's own "+ -> Task" flow (distinct from "+ -> Event") lives
// here, not in calendar.events — confirmed live: a task created that way
// never showed up via calendar-google-poll because it's a different API
// entirely.
//
// No syncToken concept exists for Tasks (unlike Calendar) — Google's own
// incremental mechanism is `updatedMin`, a plain "modified since this
// timestamp" filter, so this simply re-fetches everything updated since
// the last successful poll each time (cheap: personal task lists are
// small, nowhere near Calendar's potential event volume).
//
// Outbound (a FamilyCube-created chore pushing back to Google Tasks) is
// NOT implemented — this is a one-way pull, matching what was actually
// asked for ("sync Google Tasks too" in the context of an inbound-miss
// bug report), not a request for round-trip chore/task sync.
//
// Deploy: supabase functions deploy calendar-google-tasks-poll --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidAccessToken, type CalendarConnectionRow } from '../_shared/calendarTokens.ts';

interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string; // RFC 3339, date-only precision despite the timestamp format
  updated: string;
  deleted?: boolean;
  hidden?: boolean;
}

serve(async (req) => {
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const { memberId, familyId } = body as { memberId?: string; familyId?: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let query = supabase.from('calendar_connections').select('*')
      .eq('provider', 'google').eq('purpose', 'personal').eq('status', 'active');
    if (memberId) query = query.eq('member_id', memberId);
    else if (familyId) query = query.eq('family_id', familyId);
    const { data: connections, error } = await query;
    if (error) throw new Error(error.message);
    if (!connections?.length) return new Response(JSON.stringify({ ok: true, polled: 0 }), { status: 200 });

    let polled = 0;
    for (const connection of connections as (CalendarConnectionRow & { last_tasks_poll_at?: string })[]) {
      try {
        await pollOneConnection(supabase, connection);
        polled++;
      } catch (e: any) {
        // Missing tasks.readonly scope (a connection made before this
        // feature existed) shows up here as a 403 — non-fatal, just skip;
        // the member needs to reconnect to pick up the new scope, same as
        // any other OAuth scope addition. Don't flip the whole connection
        // to 'error' over this alone since Calendar sync for the same
        // connection is unaffected and still works.
        console.warn(`[calendar-google-tasks-poll] skipped connection ${connection.id}:`, e?.message ?? e);
      }
    }

    return new Response(JSON.stringify({ ok: true, polled }), { status: 200 });
  } catch (e: any) {
    console.error('[calendar-google-tasks-poll]', e?.message ?? e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? 'poll failed' }), { status: 500 });
  }
});

async function pollOneConnection(supabase: any, connection: CalendarConnectionRow & { last_tasks_poll_at?: string }): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  const params = new URLSearchParams({ showHidden: 'true', showDeleted: 'true' });
  if (connection.last_tasks_poll_at) params.set('updatedMin', connection.last_tasks_poll_at);

  const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) throw new Error('tasks.readonly scope missing — member needs to reconnect');
  if (!res.ok) throw new Error(`Google Tasks list failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const tasks: GoogleTask[] = json.items ?? [];

  for (const task of tasks) {
    await reconcileOneTask(supabase, connection, task);
  }

  await supabase.from('calendar_connections').update({ last_tasks_poll_at: new Date().toISOString() }).eq('id', connection.id);
}

async function reconcileOneTask(supabase: any, connection: CalendarConnectionRow, task: GoogleTask): Promise<void> {
  const { data: link } = await supabase.from('google_task_links')
    .select('*').eq('connection_id', connection.id).eq('external_task_id', task.id).maybeSingle();

  if (task.deleted) {
    if (link) {
      await supabase.from('chore_tasks').delete().eq('id', link.chore_id);
      await supabase.from('google_task_links').delete().eq('id', link.id);
    }
    return;
  }

  const dueDate = task.due ? task.due.slice(0, 10) : null; // 'YYYY-MM-DD' — due is date-only despite RFC 3339 format
  const status = task.status === 'completed' ? 'done' : 'todo';

  if (link) {
    // Portable-fields-only patch, same conflict boundary as Calendar sync
    // — title/notes/due-date/completion status only, never touches
    // FamilyCube-only chore fields (coins, XP, assignee, photo proof) that
    // a Google Task has no concept of at all.
    await supabase.from('chore_tasks').update({
      title: task.title || 'Untitled task',
      description: task.notes ?? null,
      due_date: dueDate,
      status,
    }).eq('id', link.chore_id);
    await supabase.from('google_task_links').update({ last_pulled_at: new Date().toISOString() }).eq('id', link.id);
  } else {
    const choreId = crypto.randomUUID();
    await supabase.from('chore_tasks').insert({
      id: choreId,
      title: task.title || 'Untitled task',
      description: task.notes ?? null,
      category_type: 'routine',
      category: 'Google Tasks',
      base_points: 0,
      coins_reward: 0,
      xp_reward: 0,
      status,
      assigned_to_id: connection.member_id,
      is_pool: false,
      family_id: connection.family_id,
      created_by_id: connection.member_id,
      requires_photo: false,
      recurrence_rule: { frequency: 'once' },
      due_date: dueDate,
      timezone: 'UTC',
    });
    await supabase.from('google_task_links').insert({
      connection_id: connection.id, chore_id: choreId, external_task_id: task.id,
    });
  }
}
