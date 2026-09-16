// FamilyCube — Edge Function: calendar-sync-clean-slate
// Live-requested: "complete delete upon the reconnect and resync the
// family cube calendar so that way it will be also clean slate" —
// disconnecting a personal calendar connection cascades event_external_
// links for THAT connection (calendar-disconnect), which wipes the
// dedup fingerprint _shared/googleReconcile.ts's check_likely_duplicate_
// event relies on. On reconnect, every occurrence Google returns for a
// recurring series looks "new" again (no link, and no local row on that
// exact date to dedupe-match against for any date beyond the first),
// live-confirmed: 42 separate local rows created from a single disconnect
// + reconnect of one recurring "Drop-off to School" Google event.
//
// Rather than trying to make the dedup match survive a link-table wipe
// (fragile — it only ever matches a pre-existing LOCAL row on the exact
// incoming date, not a whole series), this deletes every local row this
// member's Google sync ever created (source_provider = 'google',
// member_id-scoped) BEFORE a fresh connect+resync — a genuine clean
// slate, so nothing is left over to collide or double up with what the
// resync pulls in fresh.
//
// Scoped to source_provider (not connection_id, which no longer exists
// post-disconnect) and member_id, NOT family_id — a family can have
// multiple members each with their own Google connection, and this must
// only ever clear the one who's actually reconnecting.
//
// Deploy: supabase functions deploy calendar-sync-clean-slate
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
    const { memberId, provider } = await req.json() as { memberId?: string; provider?: string };
    if (!memberId || !provider) return json({ ok: false, error: 'memberId and provider required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: staleEvents, error: selectError } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('member_id', memberId)
      .eq('source_provider', provider)
      .is('deleted_at', null);
    if (selectError) return json({ ok: false, error: selectError.message }, 500);
    if (!staleEvents?.length) return json({ ok: true, deleted: 0, deletedIds: [] });

    const ids = staleEvents.map(e => e.id);
    const now = new Date().toISOString();
    // Hard delete, not soft — these rows are about to be recreated fresh
    // by the resync that follows this call, and a soft-deleted row with
    // the same title/date sitting around is exactly the kind of stale
    // state check_likely_duplicate_event could dedupe-match against
    // incorrectly (its own query already filters deleted_at is null, so
    // this wouldn't actually cause a NEW bug, but a real clean slate
    // means genuinely gone, not just hidden).
    const { error: deleteError } = await supabase.from('calendar_events').delete().in('id', ids);
    if (deleteError) return json({ ok: false, error: deleteError.message }, 500);

    return json({ ok: true, deleted: ids.length, deletedIds: ids });
  } catch (e: any) {
    console.error('[calendar-sync-clean-slate]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'clean slate failed' }, 500);
  }
});
