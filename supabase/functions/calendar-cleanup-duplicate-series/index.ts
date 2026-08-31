// FamilyCube — Edge Function: calendar-cleanup-duplicate-series
// ONE-TIME cleanup for the calendar-backfill-sync bug (fixed alongside
// this function): backfill pushed every individual occurrence row of a
// recurring series separately, instead of only the anchor, duplicating
// the anchor's own recurring Google event with ~83 extra standalone
// events per series. Those got read back in by the inbound poll as new,
// unlinked local rows (category='Event', series_id=null), since their
// Google recurring-instance ids never matched what the separate pushes
// had stored in event_external_links.
//
// Deletes, for a given connection_id: every calendar_events row that is
// (a) linked via event_external_links to that connection, (b) has no
// series_id of its own (i.e. it's not part of a real local recurring
// series), confirming it's one of the duplicate reconciled-back rows —
// removes the Google event via the same delete path calendar-sync-push
// uses, then the link row, then soft-deletes the local row.
//
// Run once manually, not deployed to any cron. Delete after use.
// Invoke: curl -X POST .../calendar-cleanup-duplicate-series \
//   -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
//   -d '{"connectionId": "...", "titleFilter": "...", "dryRun": true}'

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
    const { connectionId, titleFilter, dryRun } = await req.json() as {
      connectionId?: string; titleFilter?: string; dryRun?: boolean;
    };
    if (!connectionId) return json({ ok: false, error: 'connectionId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: connection, error: connErr } = await supabase
      .from('calendar_connections').select('*').eq('id', connectionId).maybeSingle();
    if (connErr || !connection) return json({ ok: false, error: 'connection not found' }, 404);

    let query = supabase
      .from('event_external_links')
      .select('id, external_event_id, event_id, calendar_events!inner(id, title, series_id, deleted_at)')
      .eq('connection_id', connectionId)
      .is('calendar_events.series_id', null)
      .is('calendar_events.deleted_at', null);
    if (titleFilter) query = query.ilike('calendar_events.title', `%${titleFilter}%`);

    const { data: links, error: linksErr } = await query;
    if (linksErr) throw new Error(linksErr.message);
    if (!links?.length) return json({ ok: true, found: 0, deleted: 0 });

    if (dryRun) {
      return json({ ok: true, found: links.length, dryRun: true, sample: links.slice(0, 5) });
    }

    const accessToken = await getValidAccessToken(supabase, connection as CalendarConnectionRow);
    let deleted = 0;
    const errors: string[] = [];

    for (const link of links) {
      try {
        if (connection.provider === 'google') {
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.external_calendar_id ?? 'primary')}/events/${link.external_event_id}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
          );
          // 410 Gone means Google already considers it deleted — fine, proceed.
          if (!res.ok && res.status !== 404 && res.status !== 410) {
            throw new Error(`Google delete failed: ${res.status} ${await res.text()}`);
          }
        } else {
          const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${link.external_event_id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok && res.status !== 404) {
            throw new Error(`Outlook delete failed: ${res.status} ${await res.text()}`);
          }
        }

        await supabase.from('event_external_links').delete().eq('id', link.id);
        await supabase.from('calendar_events').update({ deleted_at: new Date().toISOString() }).eq('id', link.event_id);
        deleted++;
      } catch (e: any) {
        errors.push(`${link.event_id}: ${e?.message ?? e}`);
      }
    }

    return json({ ok: true, found: links.length, deleted, errors });
  } catch (e: any) {
    console.error('[calendar-cleanup-duplicate-series]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'cleanup failed' }, 500);
  }
});
