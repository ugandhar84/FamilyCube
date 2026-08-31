// FamilyCube — Edge Function: calendar-backfill-sync
// Called once, right after a PERSONAL Google/Outlook connection is made,
// to push every pre-existing FamilyCube event the member already owns —
// calendar-sync-push only ever fires from addEvent/updateEvent/deleteEvent,
// so anything created BEFORE the connection existed would otherwise never
// reach the external calendar at all. Reuses calendar-sync-push itself
// (one invocation per event, action:'create') rather than duplicating its
// push/field-mapping logic, so there is exactly one place that logic lives.
//
// Full history, past and future — a member who connects mid-way through
// using the app expects their whole existing Schedule to show up, not
// just events from today onward.
//
// Deploy: supabase functions deploy calendar-backfill-sync
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { memberId, familyId } = await req.json() as { memberId?: string; familyId?: string };
    if (!memberId || !familyId) return json({ ok: false, error: 'memberId and familyId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Only this member's OWN events — calendar-sync-push already scopes a
    // push to the event creator's connections, so backfilling someone
    // else's events here would just be wasted invocations that push 0.
    //
    // Exclude non-anchor recurring occurrences (series_id set, is_series_
    // anchor false/null): addRecurringEvent's own push (via calendar-
    // sync-push's calendarFieldMapping.ts) only ever sends an RRULE on the
    // ANCHOR row, so Google represents the whole series as one recurring
    // event expanded from that single push. Backfilling every individual
    // occurrence row on top of that created a second, separately-pushed
    // plain event per day, duplicating the anchor's own recurring series
    // on Google — confirmed live via event_external_links: every
    // occurrence had its own linked external id in addition to the
    // recurring series Google itself was already expanding via
    // singleEvents=true on the inbound poll, which then reconciled the
    // series' per-day instances back in as yet more new local rows. Only
    // the anchor (or a genuinely non-recurring event) needs a real push;
    // the other occurrence rows are local-only materializations already
    // covered by the anchor's own recurrence rule.
    const { data: events, error } = await supabase.from('calendar_events')
      .select('id')
      .eq('created_by', memberId)
      .is('deleted_at', null)
      .or('series_id.is.null,is_series_anchor.eq.true');
    if (error) throw new Error(error.message);
    if (!events?.length) return json({ ok: true, backfilled: 0, reason: 'no existing events' });

    let backfilled = 0;
    for (const ev of events) {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('calendar-sync-push', {
          body: { eventId: ev.id, familyId, memberId, action: 'create' },
        });
        if (invokeError) throw new Error(invokeError.message);
        if (data?.ok) backfilled++;
      } catch (e: any) {
        // One event's push failing (e.g. a transient API error) shouldn't
        // abort the whole backfill — log and move on to the rest.
        console.error(`[calendar-backfill-sync] push failed for event ${ev.id}:`, e?.message ?? e);
      }
    }

    return json({ ok: true, backfilled, total: events.length });
  } catch (e: any) {
    console.error('[calendar-backfill-sync]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'backfill failed' }, 500);
  }
});
