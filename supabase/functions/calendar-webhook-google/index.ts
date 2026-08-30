// FamilyCube — Edge Function: calendar-webhook-google
// Receives Google Calendar push notifications for a PERSONAL-purpose
// connection (registered via the `watch` API — see
// calendar-channel-renewal, which only ever registers channels for
// purpose='personal' connections; work-purpose connections use FreeBusy
// polling instead and never have a channel).
//
// IMPORTANT: Google's channels.watch push requires the webhook `address`
// domain to be verified in Google Search Console under the SAME Cloud
// project as the OAuth client — not achievable on a supabase.co domain we
// don't control DNS for. In practice Google never actually calls this
// endpoint on this project (confirmed: watch registration "succeeds" but
// no push ever arrives). calendar-google-poll is the real inbound-sync
// path today, on a schedule instead of push. This function is kept as a
// harmless no-op-safe fallback in case a custom domain + Search Console
// verification is set up later, at which point real pushes would start
// arriving here with zero further code changes needed.
//
// Deploy: supabase functions deploy calendar-webhook-google --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { CalendarConnectionRow } from '../_shared/calendarTokens.ts';
import { reconcileGoogleChanges } from '../_shared/googleReconcile.ts';

serve(async (req) => {
  const channelId = req.headers.get('X-Goog-Channel-Id');
  const channelToken = req.headers.get('X-Goog-Channel-Token');
  const resourceState = req.headers.get('X-Goog-Resource-State');

  if (!channelId || !channelToken) {
    return new Response('missing channel headers', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: connection } = await supabase.from('calendar_connections')
    .select('*').eq('webhook_channel_id', channelId).eq('provider', 'google').eq('purpose', 'personal').maybeSingle();

  if (!connection || connection.channel_token !== channelToken) {
    return new Response('unauthorized', { status: 401 });
  }

  if (resourceState === 'sync') return new Response('ok', { status: 200 });

  try {
    await reconcileGoogleChanges(supabase, connection as CalendarConnectionRow);
    return new Response('ok', { status: 200 });
  } catch (e: any) {
    console.error('[calendar-webhook-google] reconcile failed', connection.id, e?.message ?? e);
    await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
    return new Response('error logged', { status: 200 });
  }
});
