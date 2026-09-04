// FamilyCube — Edge Function: calendar-cleanup-orphaned-google-events
// ONE-TIME cleanup. Live-reported: hundreds of "Drop-off"/pickup test
// events left on the user's real, PRIMARY Google Calendar (mixed with
// their own real events — this app has no dedicated "FamilyCube"
// calendar on Google, unlike the Apple sync path) after repeated daily-
// rule recurring test series were pushed out then locally deleted. The
// existing calendar-sync-cleanup-external / calendar-cleanup-duplicate-
// series functions only delete events this app still has an
// event_external_links row for — but that link table was already cleared
// by an earlier cleanup pass, leaving these Google-side events completely
// orphaned with no local tracking left to find them by.
//
// This function instead lists events DIRECTLY from the Google Calendar
// API within a date range and deletes any whose title matches a filter —
// no dependency on event_external_links at all. ALWAYS dry-run first
// (the default) to review the exact match list before deleting anything.
//
// Run once manually, not deployed to any cron. Delete after use.
// Invoke:
//   curl -X POST .../calendar-cleanup-orphaned-google-events \
//     -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
//     -d '{"connectionId": "...", "titleFilter": "Drop-off", "from": "2026-09-01", "to": "2028-12-31", "dryRun": true}'

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
    const { connectionId, titleFilter, from, to, dryRun = true } = await req.json() as {
      connectionId?: string; titleFilter?: string; from?: string; to?: string; dryRun?: boolean;
    };
    if (!connectionId || !titleFilter || !from || !to) {
      return json({ ok: false, error: 'connectionId, titleFilter, from, to required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: connection, error: connErr } = await supabase
      .from('calendar_connections').select('*').eq('id', connectionId).maybeSingle();
    if (connErr || !connection) return json({ ok: false, error: 'connection not found' }, 404);
    if (connection.provider !== 'google') return json({ ok: false, error: 'this cleanup is Google-only' }, 400);

    const accessToken = await getValidAccessToken(supabase, connection as CalendarConnectionRow);
    const calendarId = connection.external_calendar_id ?? 'primary';

    // List every event in range whose title matches — Google's own `q`
    // param does a full-text search (title+description+location), which
    // is a superset of what we want but cheap to filter tighter
    // client-side afterward on title specifically.
    const matches: { id: string; summary: string; start: string }[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set('timeMin', `${from}T00:00:00Z`);
      url.searchParams.set('timeMax', `${to}T00:00:00Z`);
      url.searchParams.set('q', titleFilter);
      url.searchParams.set('singleEvents', 'true'); // expand recurring instances so each is individually deletable
      url.searchParams.set('maxResults', '250');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`Google list failed: ${res.status} ${await res.text()}`);
      const data = await res.json();
      for (const item of data.items ?? []) {
        const summary: string = item.summary ?? '';
        if (summary.toLowerCase().includes(titleFilter.toLowerCase())) {
          matches.push({ id: item.id, summary, start: item.start?.dateTime ?? item.start?.date ?? '?' });
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    if (dryRun) {
      return json({ ok: true, dryRun: true, found: matches.length, sample: matches.slice(0, 20) });
    }

    let deleted = 0;
    const errors: string[] = [];
    for (const m of matches) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${m.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          throw new Error(`delete failed: ${res.status} ${await res.text()}`);
        }
        deleted++;
      } catch (e: any) {
        errors.push(`${m.id} (${m.summary}): ${e?.message ?? e}`);
      }
    }

    return json({ ok: true, found: matches.length, deleted, errors });
  } catch (e: any) {
    console.error('[calendar-cleanup-orphaned-google-events]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'cleanup failed' }, 500);
  }
});
