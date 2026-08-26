// FamilyCube — Edge Function: admin-set-user-blocked
// Admin console's "Block user" / "Unblock user" action
// (features/admin/screens/users.tsx). Real enforcement via Supabase
// Auth's own admin ban mechanism (auth.admin.updateUserById with
// ban_duration) — GoTrue itself refuses sign-in/token-refresh for a
// banned user, so this isn't a cosmetic flag the app has to remember to
// check everywhere. profiles.blocked_at/blocked_reason (updated via the
// admin_set_user_blocked() RPC, which this function calls right after
// the ban/unban) is purely a visibility mirror for the admin console's
// own list — the ban itself is the actual enforcement.
//
// Deploy: supabase functions deploy admin-set-user-blocked

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// GoTrue's ban_duration accepts a Go duration string; there's no literal
// "forever," so this uses a duration far beyond any realistic account
// lifetime. Unbanning sets it back to 'none', GoTrue's own sentinel for
// "not banned."
const INDEFINITE_BAN = '876000h'; // 100 years

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: adminRow } = await db
      .from('app_admins')
      .select('auth_user_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (!adminRow) return json({ error: 'Forbidden' }, 403);

    const { target_user_id, blocked, reason } = await req.json() as {
      target_user_id: string; blocked: boolean; reason?: string;
    };
    if (!target_user_id) return json({ error: 'target_user_id required' }, 400);
    if (target_user_id === user.id) return json({ error: "Can't block your own admin account" }, 400);

    // 1. The actual enforcement — GoTrue refuses this account on its next
    //    token refresh or sign-in attempt once banned.
    const { error: authUpdateErr } = await db.auth.admin.updateUserById(target_user_id, {
      ban_duration: blocked ? INDEFINITE_BAN : 'none',
    });
    if (authUpdateErr) {
      console.error('[admin-set-user-blocked] auth ban update failed:', authUpdateErr.message);
      return json({ error: authUpdateErr.message }, 500);
    }

    // 2. The admin console's visibility mirror — via the RPC so the
    //    is_app_admin() check stays consistent with every other admin
    //    write path, even though we already checked app_admins above.
    const { error: rpcErr } = await db.rpc('admin_set_user_blocked', {
      target_user_id,
      blocked,
      reason: reason ?? null,
    });
    if (rpcErr) {
      console.error('[admin-set-user-blocked] mirror update failed:', rpcErr.message);
      // Auth-level ban already succeeded — the enforcement is real even if
      // the mirror write failed; surface the error but don't imply the
      // block itself didn't take effect.
      return json({ success: true, warning: 'Blocked, but the admin console list may not reflect it immediately.' });
    }

    console.log(`[admin-set-user-blocked] admin=${user.id} target=${target_user_id} blocked=${blocked}`);
    return json({ success: true });
  } catch (err: any) {
    console.error('[admin-set-user-blocked] error:', err.message);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
