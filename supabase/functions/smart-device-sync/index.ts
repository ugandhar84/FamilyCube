// FamilyCube — Edge Function: smart-device-sync
// Refreshes tokens (when close to expiry), pulls current state + program +
// filter info for every connected device, and writes them back. Runs on a
// schedule (all accounts) AND is callable directly with a familyId for an
// on-demand "pull to refresh" from the client.
//
// Deploy: supabase functions deploy smart-device-sync
// Cron:   */5 * * * *  (every 5 minutes)
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMART_HUB_ENCRYPTION_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAdapter } from '../_shared/smartHub/index.ts';
import { encryptToken, decryptToken } from '../_shared/smartHub/tokenCrypto.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // familyId is optional — omitted, this syncs every connected account
    // (the cron path); provided, it's scoped to one family (the client's
    // manual pull-to-refresh path, which shouldn't wait on every OTHER
    // family's sync too).
    let familyId: string | undefined;
    try { familyId = (await req.json())?.familyId; } catch { /* cron calls with no body */ }

    let query = supabase.from('smart_device_accounts').select('*').eq('status', 'connected');
    if (familyId) query = query.eq('family_id', familyId);
    const { data: accounts, error: accountsErr } = await query;
    if (accountsErr) throw new Error(`accounts fetch failed: ${accountsErr.message}`);

    let syncedDevices = 0;
    const errors: string[] = [];

    for (const account of accounts ?? []) {
      try {
        const adapter = getAdapter(account.vendor);
        let accessToken = await decryptToken(account.access_token_enc);

        // Refresh proactively if within 5 minutes of expiry, rather than
        // waiting for a real 401 — avoids a sync cycle failing outright
        // mid-way through a family's device list over token timing.
        const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
        if (expiresAt - Date.now() < 5 * 60_000) {
          const refreshToken = await decryptToken(account.refresh_token_enc);
          const fresh = await adapter.refreshTokens(refreshToken);
          accessToken = fresh.accessToken;
          await supabase.from('smart_device_accounts').update({
            access_token_enc: await encryptToken(fresh.accessToken),
            refresh_token_enc: await encryptToken(fresh.refreshToken),
            token_expires_at: fresh.expiresAt,
            status: 'connected',
            last_error: null,
            updated_at: new Date().toISOString(),
          }).eq('id', account.id);
        }

        const { data: devices } = await supabase.from('smart_devices').select('*').eq('account_id', account.id);
        for (const device of devices ?? []) {
          const [state, program, filterInfo] = await Promise.all([
            adapter.getDeviceState(device.vendor_device_id),
            adapter.getProgram(device.vendor_device_id),
            adapter.getFilterInfo(device.vendor_device_id),
          ]);

          const now = new Date().toISOString();
          await supabase.from('smart_devices').update({
            last_state: state, last_synced_at: now, updated_at: now,
          }).eq('id', device.id);

          await supabase.from('smart_device_programs').upsert({
            device_id: device.id, family_id: device.family_id,
            program, synced_at: now, updated_at: now,
          }, { onConflict: 'device_id' });

          // Only overwrite filter tracking's vendor-sourced fields when
          // the vendor genuinely supports it — never clobber a parent's
          // own manual interval config (source = 'manual') with vendor
          // data the device doesn't actually have.
          if (filterInfo.supported) {
            const nextDue = filterInfo.lifeRemainingPct !== null
              ? new Date(Date.now() + (filterInfo.lifeRemainingPct / 100) * 90 * 24 * 3600_000).toISOString().slice(0, 10)
              : null;
            await supabase.from('smart_device_filter_tracking').upsert({
              device_id: device.id, family_id: device.family_id,
              source: 'vendor', next_due_date: nextDue,
              vendor_runtime_data: filterInfo.raw, updated_at: now,
            }, { onConflict: 'device_id' });
          }

          syncedDevices++;
        }
      } catch (e: any) {
        errors.push(`account ${account.id}: ${e.message}`);
        await supabase.from('smart_device_accounts').update({
          status: 'error', last_error: e.message, updated_at: new Date().toISOString(),
        }).eq('id', account.id);
      }
    }

    return json({ ok: true, accountsProcessed: accounts?.length ?? 0, syncedDevices, errors });
  } catch (err: any) {
    console.error('[smart-device-sync] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
