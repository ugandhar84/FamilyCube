// Shared Google Calendar incremental-changes reconciliation — extracted
// from calendar-webhook-google so both the webhook (kept in case a custom
// domain + Search Console verification is set up later, enabling real
// push) and calendar-google-poll (the actual working inbound-sync path,
// since Google's channels.watch push requires the webhook's domain to be
// verified in Search Console under the same Cloud project as the OAuth
// client — not achievable on a supabase.co domain we don't control DNS
// for) share exactly one implementation of "fetch what changed since
// sync_token and apply it."
import { getValidAccessToken, type CalendarConnectionRow } from './calendarTokens.ts';
import { googleBodyToPortablePatch } from './calendarFieldMapping.ts';

export async function reconcileGoogleChanges(supabase: any, connection: CalendarConnectionRow): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  const calendarId = encodeURIComponent(connection.external_calendar_id ?? 'primary');
  let syncToken = connection.sync_token;
  let pageToken: string | undefined;
  const changedItems: any[] = [];

  do {
    const params = new URLSearchParams();
    if (pageToken) {
      // pageToken is treated as a fully opaque cursor carrying the
      // original query forward — sent alone, no other params alongside it.
      params.set('pageToken', pageToken);
    } else {
      // singleEvents=true always on the first page of a sync — without
      // it, a recurring series comes back as one MASTER record carrying
      // its ORIGINAL start date (e.g. a yearly bank reminder from 2017),
      // which timeMin does NOT filter out even though the series itself
      // is still ongoing; singleEvents expands the series into individual
      // occurrences instead, so timeMin correctly limits results to
      // today-onward occurrences only. Must stay set the same way on
      // every call using a given sync token going forward (Google
      // requires singleEvents to stay consistent for a sync token's
      // lifetime) — but this connection's sync_token is only ever
      // persisted from nextSyncToken AFTER pagination completes with
      // singleEvents=true already applied to the whole page sequence, so
      // that invariant holds without needing to resend it here too.
      params.set('singleEvents', 'true');
      if (syncToken) {
        // timeMin/timeMax cannot be combined with syncToken (Google
        // rejects the request) — not needed here anyway, since a
        // syncToken-based call only ever returns the actual delta
        // (created/changed/deleted items) rather than re-expanding every
        // occurrence of every recurring series again.
        params.set('syncToken', syncToken);
      } else {
        // Start of today, not the current instant — using `now` here
        // would exclude an event created earlier today, before this sync
        // happened to run.
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        params.set('timeMin', startOfToday.toISOString());
        // Bounds how far a recurring series (yearly birthday/bill
        // reminders etc.) gets expanded on this FIRST sync — without it,
        // singleEvents=true expands a recurring series with no end date
        // years into the future, one row per occurrence (confirmed live:
        // 182 rows from a handful of recurring reminders). 90 days is
        // enough to catch a real recurring family commitment (e.g. a
        // weekly piano lesson) without importing a decade of bank/birthday
        // reminders that have nothing to do with family scheduling.
        const in90Days = new Date();
        in90Days.setDate(in90Days.getDate() + 90);
        params.set('timeMax', in90Days.toISOString());
      }
    }

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
