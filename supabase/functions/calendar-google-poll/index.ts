// FamilyCube — Edge Function: calendar-google-poll
// The REAL inbound-sync path for Personal Google connections — Google's
// channels.watch push requires the webhook `address` domain to be
// verified in Google Search Console under the same Cloud project as the
// OAuth client, which isn't achievable on a supabase.co domain we don't
// control DNS for. Confirmed live: watch registration "succeeds" but
// Google never actually delivers a push to this project's webhook.
//
// Runs on a schedule (see the cron migration) instead, reusing the exact
// same reconcileGoogleChanges logic calendar-webhook-google would have
// used had a real push arrived — sync_token makes each poll cheap (only
// fetches what actually changed since last time), so polling every few
// minutes is a reasonable, low-cost substitute for instant push.
// Outlook keeps using its own real subscription-based push (Microsoft
// Graph has no equivalent domain-verification requirement), so this
// poller is Google-only.
//
// Deploy: supabase functions deploy calendar-google-poll --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { CalendarConnectionRow } from '../_shared/calendarTokens.ts';
import { reconcileGoogleChanges } from '../_shared/googleReconcile.ts';

serve(async (req) => {
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const { memberId, familyId } = body as { memberId?: string; familyId?: string };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let query = supabase.from('calendar_connections').select('*')
      .eq('provider', 'google').eq('purpose', 'personal').eq('status', 'active');
    if (memberId) query = query.eq('member_id', memberId);
    else if (familyId) query = query.eq('family_id', familyId);
    const { data: connections, error } = await query;
    if (error) throw new Error(error.message);
    if (!connections?.length) return new Response(JSON.stringify({ ok: true, polled: 0 }), { status: 200 });

    let polled = 0;
    for (const connection of connections as CalendarConnectionRow[]) {
      try {
        await reconcileGoogleChanges(supabase, connection);
        polled++;
      } catch (e: any) {
        console.error(`[calendar-google-poll] reconcile failed for ${connection.id}:`, e?.message ?? e);
        await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, polled }), { status: 200 });
  } catch (e: any) {
    console.error('[calendar-google-poll]', e?.message ?? e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? 'poll failed' }), { status: 500 });
  }
});
