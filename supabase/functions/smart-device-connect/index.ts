// FamilyCube — Edge Function: smart-device-connect
// Connects a smart-home vendor account for the family (parent-only) and
// syncs its device list. Against the 'mock' vendor today (Ecobee's
// developer program is closed; Honeywell/Resideo real OAuth is the
// planned next step — see docs/smart-hub-mock-adapter.md), this is an
// instant "connect" with no real OAuth redirect; a real vendor would
// instead return an authorization URL for the client to open, with the
// actual token exchange happening in a separate smart-device-oauth-callback
// function once that vendor is wired up.
//
// Deploy: supabase functions deploy smart-device-connect
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//          SMART_HUB_ENCRYPTION_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAdapter } from '../_shared/smartHub/index.ts';
import { encryptToken } from '../_shared/smartHub/tokenCrypto.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await authClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json() as { memberId: string; vendor?: string; label?: string };
    if (!body.memberId) return json({ error: 'memberId is required' }, 400);
    const vendor = body.vendor ?? 'mock';

    // Parent-only feature end to end — see the schema migration's own
    // header comment ("Only parents feature so accommodate accordingly").
    const { data: member } = await supabase.from('members').select('id, role, family_id').eq('id', body.memberId).single();
    if (!member) return json({ error: 'Member not found' }, 404);
    if (member.role !== 'parent') return json({ error: 'Only a parent can connect a smart-home account' }, 403);

    const adapter = getAdapter(vendor);
    // Mock's own refreshTokens doubles as "get an initial token pair" —
    // a real vendor's connect flow would instead complete an actual OAuth
    // authorization-code exchange here.
    const tokens = await adapter.refreshTokens('');

    const { data: account, error: accountErr } = await supabase.from('smart_device_accounts').insert({
      family_id: member.family_id,
      vendor,
      connected_by: member.id,
      access_token_enc: await encryptToken(tokens.accessToken),
      refresh_token_enc: await encryptToken(tokens.refreshToken),
      token_expires_at: tokens.expiresAt,
      vendor_account_label: body.label ?? null,
      status: 'connected',
    }).select().single();
    if (accountErr || !account) {
      console.error('[smart-device-connect] account insert failed:', accountErr?.message);
      return json({ error: 'Could not save the connected account' }, 500);
    }

    const vendorDevices = await adapter.listDevices();
    const deviceRows = vendorDevices.map(d => ({
      account_id: account.id,
      family_id: member.family_id,
      vendor_device_id: d.vendorDeviceId,
      device_type: d.deviceType,
      display_name: d.displayName,
      last_synced_at: new Date().toISOString(),
    }));
    const { data: devices, error: devicesErr } = deviceRows.length
      ? await supabase.from('smart_devices').upsert(deviceRows, { onConflict: 'account_id,vendor_device_id' }).select()
      : { data: [], error: null };
    if (devicesErr) console.warn('[smart-device-connect] device upsert failed:', devicesErr.message);

    return json({ account, devices: devices ?? [] });
  } catch (err: any) {
    console.error('[smart-device-connect] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
