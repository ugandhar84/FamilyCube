// FamilyCube — Edge Function: calendar-sync-push
// Called fire-and-forget from store/eventStore.ts's addEvent/updateEvent/
// deleteEvent, immediately after each optimistic local write. Pushes the
// change to every PERSONAL-purpose Google/Outlook connection the event's
// creator has — work-purpose connections are never pushed to at all (they
// exist only for FreeBusy conflict-checking, see calendar-freebusy-sync,
// and store no event content).
//
// Deploy: supabase functions deploy calendar-sync-push
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidAccessToken, type CalendarConnectionRow } from '../_shared/calendarTokens.ts';
import { localRowToPortable, portableToGoogleBody, portableToOutlookBody, type LocalEventRow } from '../_shared/calendarFieldMapping.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { eventId, familyId, memberId, action } = await req.json() as {
      eventId: string; familyId: string; memberId: string; action: 'create' | 'update' | 'delete';
    };
    if (!eventId || !familyId || !memberId || !action) {
      return json({ ok: false, error: 'eventId, familyId, memberId, action required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: connections } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('member_id', memberId)
      .eq('status', 'active')
      .eq('purpose', 'personal');
    if (!connections?.length) return json({ ok: true, pushed: 0, reason: 'no active personal connections' });

    let eventRow: LocalEventRow | null = null;
    if (action !== 'delete') {
      const { data } = await supabase.from('calendar_events')
        .select('id, title, date, start_time, end_time, all_day, location, notes, updated_at, is_series_anchor, recurrence_rule')
        .eq('id', eventId).maybeSingle();
      if (!data) return json({ ok: true, pushed: 0, reason: 'event not found (already deleted?)' });
      eventRow = data as LocalEventRow;
    }

    let pushed = 0;
    for (const connection of connections as CalendarConnectionRow[]) {
      try {
        const accessToken = await getValidAccessToken(supabase, connection);
        await pushToProvider(supabase, connection, accessToken, eventId, eventRow, action);
        pushed++;
      } catch (e: any) {
        console.error(`[calendar-sync-push] ${connection.provider} push failed for connection ${connection.id}:`, e?.message ?? e);
        await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
      }
    }

    await supabase.from('calendar_connections').update({ last_synced_at: new Date().toISOString() })
      .eq('member_id', memberId).eq('purpose', 'personal').eq('status', 'active');

    return json({ ok: true, pushed });
  } catch (e: any) {
    console.error('[calendar-sync-push]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'push failed' }, 500);
  }
});

async function pushToProvider(
  supabase: any,
  connection: CalendarConnectionRow,
  accessToken: string,
  eventId: string,
  eventRow: LocalEventRow | null,
  action: 'create' | 'update' | 'delete',
): Promise<void> {
  const { data: link } = await supabase.from('event_external_links')
    .select('*').eq('connection_id', connection.id).eq('event_id', eventId).maybeSingle();

  if (action === 'delete') {
    if (!link) return;
    await deleteExternalEvent(connection, accessToken, link.external_event_id);
    await supabase.from('event_external_links').delete().eq('id', link.id);
    return;
  }

  if (!eventRow) return;
  const portable = localRowToPortable(eventRow);

  if (link) {
    await updateExternalEvent(connection, accessToken, link.external_event_id, portable);
    await supabase.from('event_external_links').update({ last_pushed_at: new Date().toISOString() }).eq('id', link.id);
  } else {
    const externalId = await createExternalEvent(connection, accessToken, portable);
    await supabase.from('event_external_links').insert({
      event_id: eventId, connection_id: connection.id, external_event_id: externalId,
      last_pushed_at: new Date().toISOString(),
    });
  }
}

async function createExternalEvent(connection: CalendarConnectionRow, accessToken: string, portable: ReturnType<typeof localRowToPortable>): Promise<string> {
  if (connection.provider === 'google') {
    const body = portableToGoogleBody(portable, null);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.external_calendar_id ?? 'primary')}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google create failed: ${res.status} ${await res.text()}`);
    return (await res.json()).id;
  } else {
    const body = portableToOutlookBody(portable, null);
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Outlook create failed: ${res.status} ${await res.text()}`);
    return (await res.json()).id;
  }
}

async function updateExternalEvent(connection: CalendarConnectionRow, accessToken: string, externalId: string, portable: ReturnType<typeof localRowToPortable>): Promise<void> {
  if (connection.provider === 'google') {
    const body = portableToGoogleBody(portable, null);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.external_calendar_id ?? 'primary')}/events/${externalId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google update failed: ${res.status} ${await res.text()}`);
  } else {
    const body = portableToOutlookBody(portable, null);
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${externalId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Outlook update failed: ${res.status} ${await res.text()}`);
  }
}

async function deleteExternalEvent(connection: CalendarConnectionRow, accessToken: string, externalId: string): Promise<void> {
  const url = connection.provider === 'google'
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.external_calendar_id ?? 'primary')}/events/${externalId}`
    : `https://graph.microsoft.com/v1.0/me/events/${externalId}`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`${connection.provider} delete failed: ${res.status} ${await res.text()}`);
  }
}
