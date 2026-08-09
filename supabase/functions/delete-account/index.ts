// PawBond — Edge Function: delete-account
// Soft-deletes a user account. Data is kept for 30 days.
// If the user logs back in within 30 days their account is fully restored.
// The purge-deleted-accounts cron permanently removes data after 30 days.
//
// Steps:
//   1. Validate JWT — caller must be the same user as user_id
//   2. Set profiles.deleted_at = now()  (soft delete marker)
//   3. Send a push notification reminding the user they can restore within 30 days
//   4. Return success — client signs out after this call
//
// Deploy: supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── 1. Validate JWT ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { user_id } = await req.json() as { user_id: string };
    if (!user_id) return json({ error: 'user_id required' }, 400);
    if (user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2. Soft-delete: stamp deleted_at on profiles ─────────────────────────
    const { error: softDeleteErr } = await db
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', user_id);

    if (softDeleteErr) {
      console.error('[delete-account] soft delete failed:', softDeleteErr.message);
      return json({ error: 'Could not schedule account deletion. Please try again.' }, 500);
    }

    // ── 3. Push notification — send before the client signs out ──────────────
    const { data: tokenRows } = await db
      .from('push_tokens')
      .select('token')
      .eq('user_id', user_id);

    const tokens = (tokenRows ?? [])
      .map((r: { token: string }) => r.token)
      .filter((t: string) => t.startsWith('ExponentPushToken'));

    if (tokens.length > 0) {
      const messages = tokens.map((to: string) => ({
        to,
        sound: 'default',
        title: '🐾 Account scheduled for deletion',
        body: 'Your data is safe for 30 days. Just log back in and everything will be restored automatically.',
        data: { type: 'account_deletion_scheduled' },
        priority: 'high',
        channelId: 'default',
      }));

      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      }).catch((e) => console.warn('[delete-account] push failed:', e.message));
    }

    console.log(`[delete-account] ✅ soft-deleted user=${user_id}`);
    return json({ success: true });

  } catch (err: any) {
    console.error('[delete-account] error:', err.message);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
