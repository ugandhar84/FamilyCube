// FamilyCube — Edge Function: calendar-webhook-google
// Receives Google Calendar push notifications for a PERSONAL-purpose
// connection (registered via the `watch` API — see
// calendar-channel-renewal, which only ever registers channels for
// purpose='personal' connections; work-purpose connections use FreeBusy
// polling instead and never have a channel). Google's push is a PING
// ONLY, never a diff — on receiving one, this fetches the actual
// incremental change set via the stored sync_token and reconciles it into
// calendar_events.
//
// Deploy: supabase functions deploy calendar-webhook-google --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidAccessToken, type CalendarConnectionRow } from '../_shared/calendarTokens.ts';
import { googleBodyToPortablePatch } from '../_shared/calendarFieldMapping.ts';

serve(async (req) => {
  const channelId = req.headers.get('X-Goog-Channel-Id');
  const channelToken = req.headers.get('X-Goog-Channel-Token');
  const resourceState = req.headers.get('X-Goog-Resource-State');

  if (!channelId || !channelToken) {
    return new Response('missing channel headers', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: connection } = await supabase.from('calendar_connections')
    .select('*').eq('webhook_channel_id', channelId).eq('provider', 'google').eq('purpose', 'personal').maybeSingle();

  if (!connection || connection.channel_token !== channelToken) {
    return new Response('unauthorized', { status: 401 });
  }

  if (resourceState === 'sync') return new Response('ok', { status: 200 });

  try {
    await reconcileGoogleChanges(supabase, connection as CalendarConnectionRow);
    return new Response('ok', { status: 200 });
  } catch (e: any) {
    console.error('[calendar-webhook-google] reconcile failed', connection.id, e?.message ?? e);
    await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
    return new Response('error logged', { status: 200 });
  }
});

async function reconcileGoogleChanges(supabase: any, connection: CalendarConnectionRow): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  const calendarId = encodeURIComponent(connection.external_calendar_id ?? 'primary');
  let syncToken = connection.sync_token;
  let pageToken: string | undefined;
  const changedItems: any[] = [];

  do {
    const params = new URLSearchParams();
    if (pageToken) params.set('pageToken', pageToken);
    else if (syncToken) params.set('syncToken', syncToken);
    else params.set('timeMin', new Date().toISOString());

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 410) {
      await supabase.from('calendar_connections').update({ sync_token: null }).eq('id', connection.id);
      return reconcileGoogleChanges(supabase, { ...connection, sync_token: null });
    }
    if (!res.ok) throw new Error(`Google events.list failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    changedItems.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
    if (json.nextSyncToken) syncToken = json.nextSyncToken;
  } while (pageToken);

  for (const item of changedItems) {
    await reconcileOneGoogleEvent(supabase, connection, item);
  }

  if (syncToken) await supabase.from('calendar_connections').update({ sync_token: syncToken }).eq('id', connection.id);
}

async function reconcileOneGoogleEvent(supabase: any, connection: CalendarConnectionRow, item: any): Promise<void> {
  const { data: link } = await supabase.from('event_external_links')
    .select('*').eq('connection_id', connection.id).eq('external_event_id', item.id).maybeSingle();

  if (item.status === 'cancelled') {
    if (link) {
      await supabase.from('calendar_events').update({ deleted_at: new Date().toISOString(), deleted_by: 'external:google' }).eq('id', link.event_id);
      await supabase.from('event_external_links').delete().eq('id', link.id);
    }
    return;
  }

  const patch = googleBodyToPortablePatch(item);

  if (link) {
    const { data: localRow } = await supabase.from('calendar_events').select('updated_at, deleted_at').eq('id', link.event_id).maybeSingle();
    if (!localRow || localRow.deleted_at) return;
    const externalModified = item.updated ? new Date(item.updated).getTime() : Date.now();
    const localModified = localRow.updated_at ? new Date(localRow.updated_at).getTime() : 0;
    if (externalModified <= localModified) return; // conflict rule: local wins, next outbound push corrects the external side
    await supabase.from('calendar_events').update({
      title: patch.title, date: patch.date, start_time: patch.startTime, end_time: patch.endTime,
      all_day: patch.allDay, location: patch.location, notes: patch.notes,
      last_external_sync_at: new Date().toISOString(), last_external_sync_provider: 'google', last_external_sync_account: connection.connected_account_email ?? null,
    }).eq('id', link.event_id);
    await supabase.from('event_external_links').update({ last_pulled_at: new Date().toISOString(), external_etag: item.etag ?? null }).eq('id', link.id);
  } else {
    const newId = crypto.randomUUID();
    await supabase.from('calendar_events').insert({
      id: newId, family_id: connection.family_id, member_id: connection.member_id,
      title: patch.title, date: patch.date, start_time: patch.startTime, end_time: patch.endTime,
      all_day: patch.allDay ?? false, location: patch.location, notes: patch.notes,
      type: 'event', category: 'Event',
      last_external_sync_at: new Date().toISOString(), last_external_sync_provider: 'google', last_external_sync_account: connection.connected_account_email ?? null,
    });
    await supabase.from('event_external_links').insert({
      event_id: newId, connection_id: connection.id, external_event_id: item.id,
      external_etag: item.etag ?? null, last_pulled_at: new Date().toISOString(),
    });
  }
}
