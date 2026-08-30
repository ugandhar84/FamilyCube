// FamilyCube — Edge Function: calendar-webhook-outlook
// Receives Microsoft Graph change notifications for a PERSONAL-purpose
// calendar subscription (registered via calendar-channel-renewal, which
// only registers subscriptions for purpose='personal' connections).
// Graph's validation handshake (a GET/POST with a `validationToken` query
// param) must be echoed back verbatim as plain text within 10 seconds.
//
// Deploy: supabase functions deploy calendar-webhook-outlook --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidAccessToken, type CalendarConnectionRow } from '../_shared/calendarTokens.ts';
import { outlookBodyToPortablePatch } from '../_shared/calendarFieldMapping.ts';

serve(async (req) => {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let notifications: any[];
  try {
    notifications = (await req.json()).value ?? [];
  } catch {
    return new Response('bad request', { status: 400 });
  }

  for (const note of notifications) {
    const subscriptionId = note.subscriptionId;
    const clientState = note.clientState;
    if (!subscriptionId || !clientState) continue;

    const { data: connection } = await supabase.from('calendar_connections')
      .select('*').eq('webhook_channel_id', subscriptionId).eq('provider', 'outlook').eq('purpose', 'personal').maybeSingle();

    if (!connection || connection.channel_token !== clientState) continue;

    try {
      await reconcileOutlookChanges(supabase, connection as CalendarConnectionRow);
    } catch (e: any) {
      console.error('[calendar-webhook-outlook] reconcile failed', connection.id, e?.message ?? e);
      await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
    }
  }

  return new Response(null, { status: 202 });
});

async function reconcileOutlookChanges(supabase: any, connection: CalendarConnectionRow): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  let url = connection.delta_link
    ?? `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${new Date().toISOString()}&endDateTime=${new Date(Date.now() + 365 * 86400_000).toISOString()}`;
  const changedItems: any[] = [];
  let nextDeltaLink: string | null = null;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'odata.maxpagesize=50' } });
    if (res.status === 410) {
      const body = await res.json();
      url = body?.['@odata.nextLink'] ?? null;
      await supabase.from('calendar_connections').update({ delta_link: null }).eq('id', connection.id);
      continue;
    }
    if (!res.ok) throw new Error(`Outlook delta failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    changedItems.push(...(json.value ?? []));
    url = json['@odata.nextLink'] ?? null;
    if (json['@odata.deltaLink']) nextDeltaLink = json['@odata.deltaLink'];
  }

  for (const item of changedItems) {
    await reconcileOneOutlookEvent(supabase, connection, item);
  }

  if (nextDeltaLink) await supabase.from('calendar_connections').update({ delta_link: nextDeltaLink }).eq('id', connection.id);
}

async function reconcileOneOutlookEvent(supabase: any, connection: CalendarConnectionRow, item: any): Promise<void> {
  const { data: link } = await supabase.from('event_external_links')
    .select('*').eq('connection_id', connection.id).eq('external_event_id', item.id).maybeSingle();

  if (item['@removed']) {
    if (link) {
      await supabase.from('calendar_events').update({ deleted_at: new Date().toISOString(), deleted_by: 'external:outlook' }).eq('id', link.event_id);
      await supabase.from('event_external_links').delete().eq('id', link.id);
    }
    return;
  }

  const patch = outlookBodyToPortablePatch(item);

  if (link) {
    const { data: localRow } = await supabase.from('calendar_events').select('updated_at, deleted_at').eq('id', link.event_id).maybeSingle();
    if (!localRow || localRow.deleted_at) return;
    const externalModified = item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).getTime() : Date.now();
    const localModified = localRow.updated_at ? new Date(localRow.updated_at).getTime() : 0;
    if (externalModified <= localModified) return;
    await supabase.from('calendar_events').update({
      title: patch.title, date: patch.date, start_time: patch.startTime, end_time: patch.endTime,
      all_day: patch.allDay, location: patch.location, notes: patch.notes,
      last_external_sync_at: new Date().toISOString(), last_external_sync_provider: 'outlook', last_external_sync_account: connection.connected_account_email ?? null,
    }).eq('id', link.event_id);
    await supabase.from('event_external_links').update({ last_pulled_at: new Date().toISOString(), external_etag: item['@odata.etag'] ?? null }).eq('id', link.id);
  } else {
    const newId = crypto.randomUUID();
    await supabase.from('calendar_events').insert({
      id: newId, family_id: connection.family_id, member_id: connection.member_id,
      title: patch.title, date: patch.date, start_time: patch.startTime, end_time: patch.endTime,
      all_day: patch.allDay ?? false, location: patch.location, notes: patch.notes,
      type: 'event', category: 'Event',
      last_external_sync_at: new Date().toISOString(), last_external_sync_provider: 'outlook', last_external_sync_account: connection.connected_account_email ?? null,
    });
    await supabase.from('event_external_links').insert({
      event_id: newId, connection_id: connection.id, external_event_id: item.id,
      external_etag: item['@odata.etag'] ?? null, last_pulled_at: new Date().toISOString(),
    });
  }
}
