// FamilyCube — Edge Function: calendar-sync-cleanup-inbound
// The mirror image of calendar-sync-cleanup-external: that function deletes
// events this app PUSHED OUT to a provider without touching the local
// FamilyCube copy; this one deletes the local FamilyCube copy of events
// PULLED IN from a provider, without touching anything on the external
// calendar itself. Same "keep the connection, keep syncing, just clear
// what's already here" shape as the outbound cleanup, opposite direction.
//
// An inbound-pulled event is identified by source_provider != 'app' (set
// once, at creation — see FamilyEvent.sourceProvider in store/eventStore.ts)
// AND an event_external_links row for this specific connection (a family
// can have more than one connection for the same provider across
// different members, so this is scoped per-connection, matching the
// outbound cleanup's own scoping, not "every Google-sourced event in the
// family").
//
// Soft-deletes via deleted_at/deleted_by, the same pattern eventStore.ts's
// deleteEvent uses — never a hard delete, consistent with every other
// delete path in this app. Does NOT call calendar-sync-push: these events
// already exist on the external calendar (that's how they got here) and
// this cleanup is explicitly "leave the external side alone," so no
// outbound delete call is made for them, deliberately asymmetric with a
// normal deleteEvent call.
//
// Deploy: supabase functions deploy calendar-sync-cleanup-inbound
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
    const { connectionId, memberId } = await req.json() as { connectionId: string; memberId: string };
    if (!connectionId || !memberId) return json({ ok: false, error: 'connectionId, memberId required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Same ownership check calendar-sync-cleanup-external/calendar-disconnect
    // use — client-supplied memberId trusted the way every fire-and-forget
    // invoke in this app trusts the caller's own active member id, but this
    // at least stops one family's connection from being wiped by an
    // unrelated member id.
    const { data: connection, error: connError } = await supabase
      .from('calendar_connections')
      .select('id, member_id, provider')
      .eq('id', connectionId)
      .maybeSingle();
    if (connError) return json({ ok: false, error: connError.message }, 500);
    if (!connection) return json({ ok: false, error: 'Connection not found' }, 404);
    if (connection.member_id !== memberId) return json({ ok: false, error: 'Not your connection' }, 403);

    const { data: links, error: linksError } = await supabase
      .from('event_external_links')
      .select('id, event_id')
      .eq('connection_id', connectionId);
    if (linksError) return json({ ok: false, error: linksError.message }, 500);
    if (!links?.length) return json({ ok: true, deleted: 0 });

    // Only rows this connection's provider actually pulled IN — a link row
    // can also represent an app-created event this connection later pushed
    // OUT (calendar-sync-push links both directions the same way), and
    // those must be left alone here; that direction is
    // calendar-sync-cleanup-external's job, not this one.
    const eventIds = links.map(l => l.event_id);
    const { data: inboundEvents, error: eventsError } = await supabase
      .from('calendar_events')
      .select('id')
      .in('id', eventIds)
      .eq('source_provider', connection.provider)
      .is('deleted_at', null);
    if (eventsError) return json({ ok: false, error: eventsError.message }, 500);
    if (!inboundEvents?.length) return json({ ok: true, deleted: 0 });

    const now = new Date().toISOString();
    const { error: deleteError } = await supabase
      .from('calendar_events')
      .update({ deleted_at: now, deleted_by: memberId })
      .in('id', inboundEvents.map(e => e.id));
    if (deleteError) return json({ ok: false, error: deleteError.message }, 500);

    // Remove the link rows for exactly the events just soft-deleted — the
    // outbound-direction links for this connection (app-created events
    // pushed out) are untouched, same reasoning as the inbound-only filter
    // above.
    await supabase.from('event_external_links').delete().in('event_id', inboundEvents.map(e => e.id));

    return json({ ok: true, deleted: inboundEvents.length });
  } catch (e: any) {
    console.error('[calendar-sync-cleanup-inbound]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'cleanup failed' }, 500);
  }
});
