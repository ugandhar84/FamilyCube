// FamilyCube — Edge Function: smart-device-program
// Parent-invoked: replaces a device's ENTIRE program/schedule atomically
// (see smart_device_programs' own migration comment on why this is a
// full replace, not a per-period patch) — full multi-period schedule
// editing, per the user's own explicit decision to build this from day
// one rather than a phased read-first approach.
//
// Deploy: supabase functions deploy smart-device-program
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//          SMART_HUB_ENCRYPTION_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAdapter, type SmartHubProgram } from '../_shared/smartHub/index.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function isValidProgram(p: any): p is SmartHubProgram {
  if (!p || !Array.isArray(p.periods) || !Array.isArray(p.holds)) return false;
  return p.periods.every((period: any) =>
    typeof period.id === 'string' && typeof period.name === 'string' &&
    Array.isArray(period.days) && typeof period.startTime === 'string' && typeof period.endTime === 'string'
  );
}

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

    const body = await req.json() as { memberId: string; deviceId: string; program: SmartHubProgram };
    if (!body.memberId || !body.deviceId || !body.program) return json({ error: 'memberId, deviceId, and program are required' }, 400);
    if (!isValidProgram(body.program)) return json({ error: 'Malformed program' }, 400);

    const { data: member } = await supabase.from('members').select('id, role, family_id').eq('id', body.memberId).single();
    if (!member) return json({ error: 'Member not found' }, 404);
    if (member.role !== 'parent') return json({ error: 'Only a parent can edit a device program' }, 403);

    const { data: device } = await supabase.from('smart_devices')
      .select('*, smart_device_accounts(*)')
      .eq('id', body.deviceId).eq('family_id', member.family_id).single();
    if (!device) return json({ error: 'Device not found' }, 404);
    const account = (device as any).smart_device_accounts;
    if (!account) return json({ error: 'Device has no connected account' }, 404);

    const adapter = getAdapter(account.vendor);
    await adapter.setProgram(device.vendor_device_id, body.program);

    const now = new Date().toISOString();
    const { data: saved, error: saveErr } = await supabase.from('smart_device_programs').upsert({
      device_id: device.id, family_id: member.family_id,
      program: body.program, synced_at: now, updated_by: member.id, updated_at: now,
    }, { onConflict: 'device_id' }).select().single();
    if (saveErr) {
      console.error('[smart-device-program] save failed:', saveErr.message);
      return json({ error: 'Program was set on the device but could not be saved locally — it will resync shortly' }, 500);
    }

    return json({ program: saved });
  } catch (err: any) {
    console.error('[smart-device-program] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
