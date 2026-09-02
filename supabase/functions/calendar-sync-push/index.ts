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

    // Every pushed event's dateTime/timeZone previously went out with
    // timezone hardcoded to null — toZonedDate then treated the event's
    // local wall-clock time as if it were already UTC, shifting every
    // synced event by exactly this member's UTC offset (live-reported:
    // a 9:00 AM CST event landed at 4-5 AM on Google Calendar).
    // members.timezone is now stamped with the device's real IANA zone on
    // every setActiveMember() profile switch (store/familyStore.ts) — the
    // right source for a shared family device, since it's always the
    // physical device's own zone for whoever is currently active on it,
    // regardless of whose login it is. Falls back to profiles.timezone
    // (written on sign-in/foreground) for a member switched to before this
    // stamping existed, or whose own device never ran the updated app.
    const { data: memberRow } = await supabase.from('members').select('timezone, auth_user_id').eq('id', memberId).maybeSingle();
    let timezone: string | null = memberRow?.timezone ?? null;
    if (!timezone && memberRow?.auth_user_id) {
      const { data: profileRow } = await supabase.from('profiles').select('timezone').eq('id', memberRow.auth_user_id).maybeSingle();
      timezone = profileRow?.timezone ?? null;
    }

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
        await pushToProvider(supabase, connection, accessToken, eventId, eventRow, action, timezone);
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
  timezone: string | null,
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
    await updateExternalEvent(connection, accessToken, link.external_event_id, portable, timezone);
    await supabase.from('event_external_links').update({ last_pushed_at: new Date().toISOString() }).eq('id', link.id);
  } else {
    const externalId = await createExternalEvent(connection, accessToken, portable, timezone);
    await supabase.from('event_external_links').insert({
      event_id: eventId, connection_id: connection.id, external_event_id: externalId,
      last_pushed_at: new Date().toISOString(),
    });
  }
  // Was only ever set by INBOUND sync (googleReconcile.ts) — an
  // app-created event that got pushed OUT to a connected calendar never
  // got its own "synced" badge (EventCard.tsx renders it off exactly
  // these two columns), even though it's just as genuinely synced as one
  // that came in the other direction. Live-reported: pushed event visible
  // on Google Calendar, no sync indicator on the app's own card.
  await supabase.from('calendar_events').update({
    last_external_sync_at: new Date().toISOString(),
    last_external_sync_provider: connection.provider,
    last_external_sync_account: connection.connected_account_email ?? null,
    last_external_sync_member_id: connection.member_id,
  }).eq('id', eventId);
}

async function createExternalEvent(connection: CalendarConnectionRow, accessToken: string, portable: ReturnType<typeof localRowToPortable>, timezone: string | null): Promise<string> {
  if (connection.provider === 'google') {
    const body = portableToGoogleBody(portable, timezone);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.external_calendar_id ?? 'primary')}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google create failed: ${res.status} ${await res.text()}`);
    return (await res.json()).id;
  } else {
    const body = portableToOutlookBody(portable, timezone);
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Outlook create failed: ${res.status} ${await res.text()}`);
    return (await res.json()).id;
  }
}

async function updateExternalEvent(connection: CalendarConnectionRow, accessToken: string, externalId: string, portable: ReturnType<typeof localRowToPortable>, timezone: string | null): Promise<void> {
  if (connection.provider === 'google') {
    const body = portableToGoogleBody(portable, timezone);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.external_calendar_id ?? 'primary')}/events/${externalId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google update failed: ${res.status} ${await res.text()}`);
  } else {
    const body = portableToOutlookBody(portable, timezone);
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
