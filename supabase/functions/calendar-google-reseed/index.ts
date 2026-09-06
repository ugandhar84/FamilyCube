// FamilyCube — Edge Function: calendar-google-reseed
// Daily cron (see 20260906084333_calendar_sync_window_90_days.sql). Keeps
// Google's 2-way sync bounded to a rolling 90-day window over the life of
// a connection, not just on the day it was first connected.
//
// Why this exists: Google's Events.list syncToken cannot be combined with
// timeMin/timeMax (Google rejects the request) — reconcileGoogleChanges'
// 90-day timeMax only ever applies on the very FIRST sync for a
// connection (no sync_token yet). Every poll after that uses syncToken
// alone with no date bound, so a recurring series added on Google months
// into the connection's life would still get pulled in full, unbounded —
// the opposite of what the original 90-day comment intended.
//
// Fix: periodically drop sync_token for connections overdue for reseed.
// reconcileGoogleChanges already has a real, tested "no sync_token ->
// fresh 90-day-bounded initial sync" path (it's exactly what runs on
// first connect, and what runs after Google returns a 410) — so nulling
// the token and calling it is sufficient; no new sync logic needed.
//
// Deploy: supabase functions deploy calendar-google-reseed --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { CalendarConnectionRow } from '../_shared/calendarTokens.ts';
import { reconcileGoogleChanges } from '../_shared/googleReconcile.ts';

// 7 days, not e.g. 90 — the goal is keeping the WINDOW itself fresh (an
// event added on Google today should fall inside some future reseed's
// 90-day bound reasonably soon), not matching the window's own length. A
// 90-day reseed cadence would mean a newly added far-future recurring
// event could go unseen for up to 90 days after being created.
const RESEED_AFTER_MS = 7 * 86400_000;

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const cutoff = new Date(Date.now() - RESEED_AFTER_MS).toISOString();
    const { data: connections, error } = await supabase.from('calendar_connections')
      .select('*').eq('provider', 'google').eq('purpose', 'personal').eq('status', 'active')
      .or(`last_full_sync_at.is.null,last_full_sync_at.lt.${cutoff}`);
    if (error) throw new Error(error.message);
    if (!connections?.length) return new Response(JSON.stringify({ ok: true, reseeded: 0 }), { status: 200 });

    let reseeded = 0;
    for (const connection of connections as CalendarConnectionRow[]) {
      try {
        // sync_token: null forces reconcileGoogleChanges down its existing
        // fresh-sync branch (timeMin=today, timeMax=+90 days) rather than
        // an incremental syncToken call — the same path a 410 already
        // triggers, just proactively instead of reactively.
        await reconcileGoogleChanges(supabase, { ...connection, sync_token: null });
        await supabase.from('calendar_connections')
          .update({ last_full_sync_at: new Date().toISOString() }).eq('id', connection.id);
        reseeded++;
      } catch (e: any) {
        console.error(`[calendar-google-reseed] reseed failed for ${connection.id}:`, e?.message ?? e);
        await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, reseeded }), { status: 200 });
  } catch (e: any) {
    console.error('[calendar-google-reseed]', e?.message ?? e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? 'reseed failed' }), { status: 500 });
  }
});
