/**
 * notify-admin-feedback
 * Called by the client immediately after a feedback_report is inserted.
 * Finds all admin push tokens and sends a push notification.
 * Auth: caller must be a signed-in user (anon key + JWT).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const TYPE_EMOJI: Record<string, string> = {
  bug:     '🐛',
  ux:      '😕',
  feature: '💡',
  other:   '💬',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Verify caller is authenticated
  const authHeader = req.headers.get('authorization') ?? '';
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { report_id, issue_type, description, app_name } = body as {
    report_id: string;
    issue_type: string;
    description: string;
    app_name: string;
  };

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Find all admin push tokens
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true);

  if (!admins?.length) return json({ sent: 0, reason: 'no admin users' });

  const adminIds = admins.map((a: any) => a.id);

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', adminIds)
    .like('token', 'ExponentPushToken%');

  if (!tokens?.length) return json({ sent: 0, reason: 'no admin push tokens' });

  const emoji = TYPE_EMOJI[issue_type] ?? '💬';
  const preview = description.length > 80 ? description.slice(0, 77) + '…' : description;

  const messages = tokens.map((t: any) => ({
    to:        t.token,
    title:     `${emoji} New ${issue_type ?? 'feedback'} report — ${app_name ?? 'PawBond'}`,
    body:      preview,
    data:      { type: 'admin_feedback', report_id, screen: '/admin/feedback' },
    sound:     'default',
    channelId: 'admin',
  }));

  const BATCH = 100;
  let sent = 0;
  for (let i = 0; i < messages.length; i += BATCH) {
    try {
      const r = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(messages.slice(i, i + BATCH)),
      });
      if (r.ok) sent += messages.slice(i, i + BATCH).length;
    } catch (e) {
      console.error('[notify-admin-feedback] batch error:', e);
    }
  }

  console.log(`[notify-admin-feedback] sent=${sent} admins=${adminIds.length}`);
  return json({ sent });
});
