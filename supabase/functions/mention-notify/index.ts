// PawBond — Edge Function: mention-notify
// Called after a post is published. Resolves @handles → user IDs and sends
// push + in-app notifications to mentioned users (skips the post author).
//
// Deploy: supabase functions deploy mention-notify

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canNotify } from './prefs.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { post_id, handles, actor_pet_name, actor_pet_emoji } = await req.json();

  if (!post_id || !Array.isArray(handles) || handles.length === 0) {
    return json({ error: 'post_id and handles required' }, 400);
  }

  // Resolve handles → profile IDs, exclude the post author
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle')
    .in('handle', handles.map((h: string) => h.toLowerCase()))
    .neq('id', user.id);

  if (!profiles?.length) return json({ success: true, notified: 0 });

  const title = `${actor_pet_emoji} ${actor_pet_name} mentioned you`;
  const body  = 'Tap to see the post';
  let notified = 0;

  for (const profile of profiles) {
    // Dedup: one mention notification per post per recipient
    const dedupKey = `mention:${post_id}:${profile.id}`;
    const { count } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('dedup_key', dedupKey);
    if ((count ?? 0) > 0) continue;

    const allowed = await canNotify(supabase, profile.id, 'notif_mention');
    if (!allowed) continue;

    // Insert in-app notification
    await supabase.from('notification_logs').insert({
      user_id: profile.id, title, body,
      type: 'mention', read: false,
      dedup_key: dedupKey,
      data: { post_id, handle: profile.handle, actor_pet_name, actor_pet_emoji },
    });

    // Push notification
    {
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', profile.id)
        .like('token', 'ExponentPushToken%');

      if (tokens?.length) {
        const msgs = tokens.map((t: any) => ({
          to: t.token, sound: 'default', title, body,
          data: { type: 'mention', post_id },
          priority: 'normal', channelId: 'social',
        }));
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(msgs),
        });
        notified++;
      }
    }
  }

  return json({ success: true, notified });
});
