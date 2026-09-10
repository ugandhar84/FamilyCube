// FamilyCube — Edge Function: smart-device-control
// Parent-invoked: sets or cancels a one-off hold (immediate setpoint/mode
// change distinct from editing the program itself — see the adapter
// interface's own comment on setHold vs setProgram).
//
// Deploy: supabase functions deploy smart-device-control
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//          SMART_HUB_ENCRYPTION_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAdapter } from '../_shared/smartHub/index.ts';
import { decryptToken } from '../_shared/smartHub/tokenCrypto.ts';

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

    const body = await req.json() as {
      memberId: string;
      deviceId: string;
      action: 'set_hold' | 'cancel_hold';
      hold?: { type: string; targetTempHeatF: number | null; targetTempCoolF: number | null; startsAt: string; endsAt: string | null };
      holdId?: string;
    };
    if (!body.memberId || !body.deviceId || !body.action) return json({ error: 'memberId, deviceId, and action are required' }, 400);

    const { data: member } = await supabase.from('members').select('id, role, family_id').eq('id', body.memberId).single();
    if (!member) return json({ error: 'Member not found' }, 404);
    if (member.role !== 'parent') return json({ error: 'Only a parent can control a smart device' }, 403);

    const { data: device } = await supabase.from('smart_devices')
      .select('*, smart_device_accounts(*)')
      .eq('id', body.deviceId).eq('family_id', member.family_id).single();
    if (!device) return json({ error: 'Device not found' }, 404);
    const account = (device as any).smart_device_accounts;
    if (!account) return json({ error: 'Device has no connected account' }, 404);

    const adapter = getAdapter(account.vendor);
    const accessToken = await decryptToken(account.access_token_enc); // reserved for a real vendor's Bearer header — the mock adapter doesn't need it

    if (body.action === 'set_hold') {
      if (!body.hold) return json({ error: 'hold is required for set_hold' }, 400);
      const hold = await adapter.setHold(device.vendor_device_id, body.hold as any);
      const state = await adapter.getDeviceState(device.vendor_device_id);
      const now = new Date().toISOString();
      await supabase.from('smart_devices').update({ last_state: state, last_synced_at: now, updated_at: now }).eq('id', device.id);
      return json({ hold, state });
    }

    if (body.action === 'cancel_hold') {
      if (!body.holdId) return json({ error: 'holdId is required for cancel_hold' }, 400);
      await adapter.cancelHold(device.vendor_device_id, body.holdId);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (err: any) {
    console.error('[smart-device-control] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
