// FamilyCube — Edge Function: calendar-disconnect
// Deletes a calendar_connections row (and its dependents). Required
// because calendar_connections has NO insert/update/delete grant to the
// `authenticated` role at all (token columns are service-role-only —
// see the table's own migration comment) — a client-side
// `supabase.from('calendar_connections').delete()` fails outright with a
// permissions error, which is exactly what CalendarSyncScreen.tsx's
// "Disconnect" button hit before this function existed (audit finding).
//
// Deploy: supabase functions deploy calendar-disconnect
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

    // Ownership check — memberId must actually own this connection.
    // Client-supplied memberId is trusted the same way every other
    // fire-and-forget invoke in this app trusts the caller's own active
    // member id (no separate JWT-to-member verification layer exists
    // anywhere else in this codebase either); this at least prevents one
    // family's connection id being deleted by an unrelated member id.
    const { data: connection, error: fetchError } = await supabase
      .from('calendar_connections')
      .select('id, member_id, purpose, provider')
      .eq('id', connectionId)
      .maybeSingle();
    if (fetchError) return json({ ok: false, error: fetchError.message }, 500);
    if (!connection) return json({ ok: false, error: 'Connection not found' }, 404);
    if (connection.member_id !== memberId) return json({ ok: false, error: 'Not your connection' }, 403);

    // For a Google personal-purpose connection, best-effort stop the
    // watch channel before deleting — otherwise Google keeps sending push
    // notifications to a webhook that will just 401 them forever (harmless
    // but noisy, and counts against Google's per-account channel quota).
    if (connection.provider === 'google' && connection.purpose === 'personal') {
      try {
        const { data: full } = await supabase.from('calendar_connections').select('*').eq('id', connectionId).single();
        if (full?.webhook_channel_id && full?.webhook_resource_id) {
          const { getValidAccessToken } = await import('../_shared/calendarTokens.ts');
          const accessToken = await getValidAccessToken(supabase, full);
          await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: full.webhook_channel_id, resourceId: full.webhook_resource_id }),
          });
        }
      } catch (e) {
        console.warn('[calendar-disconnect] stop Google channel failed (non-fatal)', String(e));
      }
    }

    // event_external_links cascades on connection delete (foreign key
    // on delete cascade — see 20260930150000's recreation of the table),
    // so no separate cleanup needed for personal-purpose links.
    // Work-purpose synced Work events need explicit cleanup — they don't
    // reference calendar_connections via a cascading FK in a way that
    // removes them automatically (synced_from_connection_id IS a
    // cascading FK per its own migration, so this is actually also
    // automatic — deleted here anyway as a defensive, explicit step in
    // case that assumption ever changes).
    await supabase.from('calendar_events').delete().eq('synced_from_connection_id', connectionId);

    const { error: deleteError } = await supabase.from('calendar_connections').delete().eq('id', connectionId);
    if (deleteError) return json({ ok: false, error: deleteError.message }, 500);

    return json({ ok: true });
  } catch (e: any) {
    console.error('[calendar-disconnect]', e?.message ?? e);
    return json({ ok: false, error: e?.message ?? 'Disconnect failed' }, 500);
  }
});
