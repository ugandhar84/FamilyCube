// FamilyCube — Edge Function: calendar-channel-renewal
// Daily cron (pg_cron) — Google watch channels expire weekly, Outlook
// calendar subscriptions expire in ~3 days max; both must be actively
// renewed before expiry or inbound sync silently stops. ONLY applies to
// PERSONAL-purpose connections — work-purpose connections use FreeBusy
// polling (calendar-freebusy-sync) and never have a webhook channel at all.
//
// Deploy: supabase functions deploy calendar-channel-renewal --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getValidAccessToken, type CalendarConnectionRow } from '../_shared/calendarTokens.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GOOGLE_WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/calendar-webhook-google`;
const OUTLOOK_WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/calendar-webhook-outlook`;

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const cutoff = new Date(Date.now() + 2 * 86400_000).toISOString();
  const { data: connections, error } = await supabase.from('calendar_connections')
    .select('*').eq('status', 'active').eq('purpose', 'personal')
    .or(`channel_expires_at.is.null,channel_expires_at.lt.${cutoff}`);

  if (error) {
    console.error('[calendar-channel-renewal] fetch failed', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
  if (!connections?.length) return new Response(JSON.stringify({ ok: true, renewed: 0 }), { status: 200 });

  let renewed = 0;
  for (const connection of connections as CalendarConnectionRow[]) {
    try {
      await stopOldChannelIfAny(supabase, connection);
      if (connection.provider === 'google') await registerGoogleChannel(supabase, connection);
      else await registerOutlookSubscription(supabase, connection);
      renewed++;
    } catch (e: any) {
      console.error(`[calendar-channel-renewal] ${connection.provider} renewal failed for ${connection.id}:`, e?.message ?? e);
      await supabase.from('calendar_connections').update({ status: 'error', last_error: String(e?.message ?? e) }).eq('id', connection.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, renewed }), { status: 200 });
});

async function stopOldChannelIfAny(supabase: any, connection: CalendarConnectionRow & { webhook_channel_id?: string; webhook_resource_id?: string }): Promise<void> {
  if (connection.provider !== 'google' || !connection.webhook_channel_id || !connection.webhook_resource_id) return;
  try {
    const accessToken = await getValidAccessToken(supabase, connection);
    await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: connection.webhook_channel_id, resourceId: connection.webhook_resource_id }),
    });
  } catch (e) {
    console.warn('[calendar-channel-renewal] stop old Google channel failed (non-fatal)', String(e));
  }
}

async function registerGoogleChannel(supabase: any, connection: CalendarConnectionRow): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomUUID();
  const calendarId = encodeURIComponent(connection.external_calendar_id ?? 'primary');

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/watch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: channelId, type: 'web_hook', address: GOOGLE_WEBHOOK_URL, token: channelToken }),
  });
  if (!res.ok) throw new Error(`Google watch registration failed: ${res.status} ${await res.text()}`);
  const json = await res.json();

  await supabase.from('calendar_connections').update({
    webhook_channel_id: channelId,
    webhook_resource_id: json.resourceId,
    channel_token: channelToken,
    channel_expires_at: new Date(Number(json.expiration)).toISOString(),
  }).eq('id', connection.id);
}

async function registerOutlookSubscription(supabase: any, connection: CalendarConnectionRow): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, connection);
  const clientState = crypto.randomUUID();
  const expirationDateTime = new Date(Date.now() + 2.5 * 86400_000).toISOString();

  const res = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'created,updated,deleted',
      notificationUrl: OUTLOOK_WEBHOOK_URL,
      resource: '/me/events',
      expirationDateTime,
      clientState,
    }),
  });
  if (!res.ok) throw new Error(`Outlook subscription registration failed: ${res.status} ${await res.text()}`);
  const json = await res.json();

  await supabase.from('calendar_connections').update({
    webhook_channel_id: json.id,
    channel_token: clientState,
    channel_expires_at: json.expirationDateTime,
  }).eq('id', connection.id);
}
