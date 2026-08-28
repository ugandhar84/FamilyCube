// Family Cube — Edge Function: mark-call-reminder-answered
// Called by the client (AppDelegate.swift's callObserver, via a bridged JS
// call) the moment CXCall.hasConnected fires for a call reminder. Marks the
// matching call_reminder_log row answered=true so call-reminder-sweeper's
// missed-call follow-up (retry call + push notification ~3 min later) never
// fires for a call the person actually picked up — without this, every
// answered call would ALSO get a redundant "did you miss this?" push.
//
// Deploy: supabase functions deploy mark-call-reminder-answered
//
// call_reminder_log has no client-facing write policy (service-role-only,
// by design — see 20260819080000_call_reminder_alerts.sql), so this uses
// the service role internally rather than opening UPDATE access to the
// table itself. Still requires a valid session (verify_jwt default) so an
// unauthenticated caller can't mark arbitrary reminders answered.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { itemType, itemId, dueAtIso } = await req.json();
    if (!itemType || !itemId || !dueAtIso) {
      return json({ error: 'itemType, itemId, and dueAtIso are required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // due_at is stored rounded to the minute (see call-reminder-sweeper's
    // dueAtKey) — round the same way here so this UPDATE actually matches
    // the claim row the sweeper wrote.
    const dueAtKey = new Date(Math.floor(new Date(dueAtIso).getTime() / 60000) * 60000).toISOString();

    const { error } = await supabase
      .from('call_reminder_log')
      .update({ answered: true })
      .eq('item_type', itemType)
      .eq('item_id', itemId)
      .eq('due_at', dueAtKey);

    if (error) {
      console.error('[mark-call-reminder-answered]', error);
      return json({ ok: false, error: error.message }, 500);
    }

    return json({ ok: true });
  } catch (e: any) {
    console.error('[mark-call-reminder-answered]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
