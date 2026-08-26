// Admin broadcast notification to all users
// Deploy: supabase functions deploy send-broadcast

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    console.log('[send-broadcast] 📢 START: Broadcast notification');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth check - must be admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));

    if (authErr || !user) {
      console.error('[send-broadcast] ❌ Auth failed:', authErr);
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    // Check if user is a platform admin (app_admins allowlist, seeded
    // manually — see supabase/migrations/20260925090000_create_admin_console.sql).
    // Not profiles.is_admin — that column belongs to the unrelated, removed
    // Legacy template admin section.
    const { data: adminRow } = await supabase
      .from('app_admins')
      .select('auth_user_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      console.error('[send-broadcast] ❌ User is not admin');
      return json({ error: 'Only admins can send broadcasts' }, 403, corsHeaders);
    }

    const { title, body, audience } = await req.json();

    if (!title || !body) {
      return json({ error: 'title and body required' }, 400, corsHeaders);
    }

    // audience: 'all' (default) or 'parents' — parents-only is for
    // paywall/upsell nudges that shouldn't reach a kid's device.
    const targetParentsOnly = audience === 'parents';
    console.log('[send-broadcast] 📝 Message:', { title, body, audience: audience ?? 'all' });

    let tokens: { token: string }[] | null;
    if (targetParentsOnly) {
      // Resolve parent auth_user_ids first, then their push tokens — two
      // queries (push_tokens.user_id has no FK to members, only to
      // profiles) rather than a cross-schema join.
      console.log('[send-broadcast] 👥 Fetching parent push tokens...');
      const { data: parentMembers } = await supabase
        .from('members')
        .select('auth_user_id')
        .eq('role', 'parent')
        .not('auth_user_id', 'is', null);
      const parentAuthIds = [...new Set((parentMembers ?? []).map((m: any) => m.auth_user_id).filter(Boolean))];
      if (parentAuthIds.length === 0) {
        tokens = [];
      } else {
        const { data } = await supabase
          .from('push_tokens')
          .select('token')
          .in('user_id', parentAuthIds)
          .like('token', 'ExponentPushToken%');
        tokens = data;
      }
    } else {
      console.log('[send-broadcast] 👥 Fetching all push tokens...');
      const { data } = await supabase
        .from('push_tokens')
        .select('token')
        .like('token', 'ExponentPushToken%');
      tokens = data;
    }

    console.log('[send-broadcast] ✅ Found', tokens?.length ?? 0, 'recipients');

    if (!tokens || tokens.length === 0) {
      console.warn('[send-broadcast] ⚠️  No push tokens found');
      return json({ success: true, sent: 0, message: 'No recipients with push tokens' }, 200, corsHeaders);
    }

    // Build messages
    const messages = tokens.map((t: any) => ({
      to: t.token,
      sound: 'default',
      title,
      body,
      data: { type: 'broadcast', audience: targetParentsOnly ? 'parents' : 'all' },
      priority: 'high',
      channelId: 'default',
    }));

    // Send in batches
    console.log('[send-broadcast] 📤 Sending in batches of 100...');
    let totalSent = 0;

    for (let i = 0; i < messages.length; i += 100) {
      const batchNum = Math.floor(i / 100) + 1;
      const batch = messages.slice(i, i + 100);
      console.log(`[send-broadcast] 📤 Batch ${batchNum}: sending ${batch.length}...`);

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });

      if (res.ok) {
        const result = await res.json();
        const successful = result.data?.filter((d: any) => d.status === 'ok').length ?? 0;
        console.log(`[send-broadcast]   ✅ ${successful}/${batch.length} succeeded`);
        totalSent += successful;
      }
    }

    // Log to broadcasts table
    console.log('[send-broadcast] 💾 Logging broadcast...');
    const { error: logErr } = await supabase.from('broadcasts').insert({
      admin_id: user.id,
      title,
      body,
      recipient_count: tokens.length,
      audience: targetParentsOnly ? 'parents' : 'all',
      sent_at: new Date().toISOString(),
    });

    if (logErr) {
      console.error('[send-broadcast] ⚠️  Failed to log:', logErr);
    }

    console.log('[send-broadcast] ✅ COMPLETE: Sent to', totalSent, 'users');
    return json(
      { success: true, sent: totalSent, message: `Broadcast sent to ${totalSent} users` },
      200,
      corsHeaders
    );
  } catch (err: any) {
    console.error('[send-broadcast] 🔴 ERROR:', err);
    return json({ error: err.message }, 500, corsHeaders);
  }
});

function json(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
