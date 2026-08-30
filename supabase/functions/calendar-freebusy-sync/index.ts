// FamilyCube — Edge Function: calendar-freebusy-sync
// Fetches ONLY busy/free time blocks (no titles, no locations, no notes —
// FreeBusy APIs never return event content) from a member's connected
// Google/Outlook calendar and materializes them as category:'Work'
// calendar_events rows, tagged synced_from_connection_id so a later sync
// can cleanly replace exactly its own prior rows without touching a
// manually-entered Work event.
//
// This is the ONLY thing a connected calendar is used for — no event is
// ever pushed OUT to Google/Outlook, and no external event content is
// ever read or stored. Once materialized, FamilyCube's own existing
// conflict detection (features/hub/lib/detectAssigneeConflicts.ts's
// detectWorkConflicts, and ParentView.tsx's inline cases C/D) picks these
// up automatically — they look identical to a hand-typed Work event.
//
// Called: on-demand right after a connection is created (CalendarSyncScreen),
// and whenever Schedule/Hub is opened for a family with an active
// connection (kept fresh reactively, not on a fixed cron — "dynamic" per
// user direction, since the whole point is catching a NEW conflict the
// moment it's relevant to look at, not on a schedule unrelated to when
// anyone's actually checking).
//
// Deploy: supabase functions deploy calendar-freebusy-sync
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidAccessToken, type CalendarConnectionRow } from '../_shared/calendarTokens.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYNC_WINDOW_DAYS = 14; // enough runway for near-term ride/event planning without fetching a year of busy blocks

interface BusyBlock { start: string; end: string; } // ISO datetimes, UTC

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { memberId, familyId } = await req.json() as { memberId?: string; familyId?: string };
    if (!memberId && !familyId) return json({ ok: false, error: 'memberId or familyId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let query = supabase.from('calendar_connections').select('*').eq('status', 'active');
    query = memberId ? query.eq('member_id', memberId) : query.eq('family_id', familyId!);
    const { data: connections, error } = await query;
    if (error) throw new Error(error.message);
    if (!connections?.length) return json({ ok: true, synced: 0, reason: 'no active connections' });

    let synced = 0;
    for (const connection of connections as CalendarConnectionRow[]) {
      try {
        await syncOneConnection(supabase, connection);
        synced++;
      } catch (e: any) {
        console.error(`[calendar-freebusy-sync] ${connection.provider} sync failed for ${connection.id}:`, e?.message ?? e);
        await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
      }
    }

    return json({ ok: true, synced });
  } catch (e: any) {
    console.error('[calendar-freebusy-sync]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'sync failed' }, 500);
  }
});

async function syncOneConnection(supabase: any, connection: CalendarConnectionRow): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + SYNC_WINDOW_DAYS * 86400_000);

  const busyBlocks = connection.provider === 'google'
    ? await fetchGoogleFreeBusy(connection, accessToken, now, windowEnd)
    : await fetchOutlookFreeBusy(accessToken, now, windowEnd);

  // Replace exactly this connection's own previously-synced Work events —
  // never touches a manually-entered Work event (those have
  // synced_from_connection_id = null).
  await supabase.from('calendar_events').delete().eq('synced_from_connection_id', connection.id);

  if (busyBlocks.length > 0) {
    const rows = busyBlocks.map((block, i) => {
      const start = new Date(block.start);
      const end = new Date(block.end);
      return {
        id: `wk_${connection.id}_${i}_${start.getTime()}`,
        family_id: connection.family_id,
        member_id: connection.member_id,
        title: 'Work', // no real title exists — FreeBusy never returns event content
        date: start.toISOString().slice(0, 10),
        start_time: start.toISOString().slice(11, 16),
        end_time: end.toISOString().slice(11, 16),
        all_day: false,
        type: 'work',
        category: 'Work',
        synced_from_connection_id: connection.id,
      };
    });
    const { error: insertError } = await supabase.from('calendar_events').insert(rows);
    if (insertError) throw new Error(`insert Work events failed: ${insertError.message}`);

    // Push, not just a passive Hub banner — live-requested: "Not only
    // banner right we should send push to both parents and effect
    // person." Notifies the connected parent (whose work calendar is the
    // cause) AND whoever's actually affected — either that same parent
    // (their own event collided with their own work) or the helper/driver
    // they're assigned to on someone else's event.
    await notifyNewWorkConflicts(supabase, connection, rows);
  }

  await supabase.from('calendar_connections').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', connection.id);
}

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return Math.abs((ah * 60 + am) - (bh * 60 + bm));
}

async function notifyNewWorkConflicts(supabase: any, connection: CalendarConnectionRow, workRows: any[]): Promise<void> {
  const dates = [...new Set(workRows.map(r => r.date))];
  if (!dates.length) return;

  const { data: familyEvents } = await supabase.from('calendar_events')
    .select('id, title, date, start_time, member_id, helper_name, helper_status, driver_name, driver_status, category, conflict_acknowledged, conflict_notified_pair')
    .eq('family_id', connection.family_id)
    .in('date', dates)
    .not('start_time', 'is', null)
    .neq('category', 'Work')
    .eq('conflict_acknowledged', false)
    .is('deleted_at', null);
  if (!familyEvents?.length) return;

  const { data: members } = await supabase.from('members').select('id, name').eq('family_id', connection.family_id);
  const connectedMemberName = (members ?? []).find((m: any) => m.id === connection.member_id)?.name ?? 'A parent';

  for (const familyEv of familyEvents) {
    const assigneeName = familyEv.helper_name ?? familyEv.driver_name;
    const assigneeStatus = familyEv.helper_name ? familyEv.helper_status : familyEv.driver_status;
    const isOwnEvent = familyEv.member_id === connection.member_id;
    const isAssignedHelper = assigneeName && assigneeStatus !== 'rejected'
      && (members ?? []).find((m: any) => m.name === assigneeName)?.id === connection.member_id;
    if (!isOwnEvent && !isAssignedHelper) continue; // this Work block has nothing to do with this event

    const workRow = workRows.find(w => w.date === familyEv.date && minutesBetween(w.start_time, familyEv.start_time) < 30);
    if (!workRow) continue;

    // Keyed by the family event alone, not workRow.id:familyEv.id — a
    // family member can have BOTH a manually-entered Work event and an
    // auto-synced one overlapping the same slot (audit finding), and
    // pairing per-work-row would let each notify independently for what
    // the user experiences as one conflict. One notification per family
    // event is enough regardless of how many Work rows explain it.
    const pairKey = `freebusy:${familyEv.id}`;
    if (familyEv.conflict_notified_pair === pairKey) continue; // already pushed for this exact event

    const affectedMemberId = isOwnEvent ? familyEv.member_id : (members ?? []).find((m: any) => m.name === assigneeName)?.id;
    const recipientIds = [...new Set([connection.member_id, affectedMemberId].filter(Boolean))];
    // "Both parents" per the live direction — also tell every OTHER parent
    // in the family, not just whoever's directly involved, so a co-parent
    // can step in without the affected person having to relay it themselves.
    const otherParentIds = (members ?? []).filter((m: any) => m.id !== connection.member_id && m.id !== affectedMemberId).map((m: any) => m.id);
    // Only broadcast to other parents, not every kid/teen/senior — mirrors
    // schedule-conflict-sweep's own parent-focused notification scope.
    const { data: parentRows } = await supabase.from('members').select('id').eq('family_id', connection.family_id).eq('role', 'parent').in('id', otherParentIds);
    const allRecipients = [...new Set([...recipientIds, ...(parentRows ?? []).map((m: any) => m.id)])];

    const reason = `${connectedMemberName.split(' ')[0]}'s work conflicts with "${familyEv.title}"`;
    await supabase.functions.invoke('family-notifier', {
      body: {
        type: 'schedule_conflict',
        familyId: connection.family_id,
        memberIds: allRecipients,
        payload: { reason, eventIds: [familyEv.id] },
      },
    }).catch((e: any) => console.warn('[calendar-freebusy-sync] notify failed', familyEv.id, e?.message));

    await supabase.from('calendar_events').update({ conflict_notified_pair: pairKey, conflict_notified_at: new Date().toISOString() }).eq('id', familyEv.id);
  }
}

async function fetchGoogleFreeBusy(connection: CalendarConnectionRow, accessToken: string, timeMin: Date, timeMax: Date): Promise<BusyBlock[]> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: connection.external_calendar_id ?? 'primary' }],
    }),
  });
  if (!res.ok) throw new Error(`Google freeBusy failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const calId = connection.external_calendar_id ?? 'primary';
  const busy = json.calendars?.[calId]?.busy ?? [];
  return busy.map((b: any) => ({ start: b.start, end: b.end }));
}

async function fetchOutlookFreeBusy(accessToken: string, startTime: Date, endTime: Date): Promise<BusyBlock[]> {
  // getSchedule works against /me (the connected account's own calendar)
  // rather than a stored calendar id — Graph resolves "me" from the token.
  const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schedules: ['me'],
      startTime: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      endTime: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
      availabilityViewInterval: 30,
    }),
  });
  if (!res.ok) throw new Error(`Outlook getSchedule failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const items = json.value?.[0]?.scheduleItems ?? [];
  return items
    .filter((item: any) => item.status === 'busy' || item.status === 'oof' || item.status === 'tentative')
    .map((item: any) => ({ start: item.start.dateTime + 'Z', end: item.end.dateTime + 'Z' }));
}
