// FamilyCube — Edge Function: calendar-sync-cleanup-external
// Live-requested: "delete all events which we synced to Google/Apple" —
// clarified to mean events this app PUSHED OUT to the provider, and to
// keep the local FamilyCube event untouched, only remove the external
// copy. (Apple has no OAuth connection at all — its equivalent cleanup is
// clearAppleSyncedEvents in lib/calendarSync2Way.ts, run entirely
// on-device via EventKit.)
//
// For a given Google/Outlook connection, walks every event_external_links
// row for it, deletes the external event via the provider's API (reusing
// the same deleteExternalEvent shape calendar-sync-push already uses for a
// single event), then deletes the link row. calendar_events itself is
// never touched — the local event stays exactly as it is, and would get
// pushed back out fresh (as a brand new external event) the next time it's
// edited, same as any never-synced event.
//
// Deploy: supabase functions deploy calendar-sync-cleanup-external
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { connectionId, memberId } = await req.json() as { connectionId: string; memberId: string };
    if (!connectionId || !memberId) return json({ ok: false, error: 'connectionId, memberId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Same ownership check calendar-disconnect uses — client-supplied
    // memberId trusted the way every fire-and-forget invoke in this app
    // trusts the caller's own active member id, but this at least stops
    // one family's connection from being wiped by an unrelated member id.
    const { data: connection, error: connError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('id', connectionId)
      .maybeSingle();
    if (connError) return json({ ok: false, error: connError.message }, 500);
    if (!connection) return json({ ok: false, error: 'Connection not found' }, 404);
    if (connection.member_id !== memberId) return json({ ok: false, error: 'Not your connection' }, 403);

    const { data: links, error: linksError } = await supabase
      .from('event_external_links')
      .select('id, event_id, external_event_id')
      .eq('connection_id', connectionId);
    if (linksError) return json({ ok: false, error: linksError.message }, 500);
    if (!links?.length) return json({ ok: true, deleted: 0, failed: 0 });

    const accessToken = await getValidAccessToken(supabase, connection as CalendarConnectionRow);

    let deleted = 0;
    let failed = 0;
    for (const link of links) {
      try {
        await deleteExternalEvent(connection as CalendarConnectionRow, accessToken, link.external_event_id);
        await supabase.from('event_external_links').delete().eq('id', link.id);
        // Was only ever set when a push created/updated the link — once the
        // external copy is gone, the local row's own "synced" badge
        // (EventCard.tsx) would otherwise keep claiming a link that no
        // longer exists on either side.
        await supabase.from('calendar_events').update({
          last_external_sync_at: null,
          last_external_sync_provider: null,
          last_external_sync_account: null,
          last_external_sync_member_id: null,
        }).eq('id', link.event_id);
        deleted++;
      } catch (e: any) {
        console.error(`[calendar-sync-cleanup-external] failed to delete ${link.external_event_id}:`, e?.message ?? e);
        failed++;
      }
    }

    return json({ ok: true, deleted, failed });
  } catch (e: any) {
    console.error('[calendar-sync-cleanup-external]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'cleanup failed' }, 500);
  }
});

async function deleteExternalEvent(connection: CalendarConnectionRow, accessToken: string, externalId: string): Promise<void> {
  const url = connection.provider === 'google'
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.external_calendar_id ?? 'primary')}/events/${externalId}`
    : `https://graph.microsoft.com/v1.0/me/events/${externalId}`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`${connection.provider} delete failed: ${res.status} ${await res.text()}`);
  }
}
