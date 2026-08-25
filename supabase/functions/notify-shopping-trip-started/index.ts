// Family Cube — Edge Function: notify-shopping-trip-started
// Called (client-side, from groceryStore.startRun) when a family member taps
// "Start Shopping" on a grocery trip. Notifies every other member of the
// same family so a partner knows shopping is happening live and can add
// items to the same store's trip instead of finding out after the fact.
// Deploy: supabase functions deploy notify-shopping-trip-started

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { run_id, shopper_member_id } = await req.json();
    if (!run_id || !shopper_member_id) {
      return json({ error: 'run_id and shopper_member_id required' }, 400);
    }

    const { data: run } = await supabase.from('grocery_runs')
      .select('id, name, store, family_id').eq('id', run_id).single();
    if (!run) return json({ error: 'Run not found' }, 404);

    const { data: shopper } = await supabase.from('members')
      .select('id, name').eq('id', shopper_member_id).single();
    if (!shopper) return json({ error: 'Member not found' }, 404);

    const { data: others } = await supabase.from('members')
      .select('id, auth_user_id')
      .eq('family_id', run.family_id)
      .neq('id', shopper_member_id)
      .not('auth_user_id', 'is', null);

    const recipientIds = (others ?? []).map((m: any) => m.auth_user_id as string);
    if (recipientIds.length === 0) return json({ success: true, notified: 0 });

    const { allowed } = await filterByPref(supabase, recipientIds, 'notif_family');
    if (allowed.length === 0) return json({ success: true, notified: 0 });

    const title = `🛒 ${shopper.name} started shopping at ${run.store}`;
    const body  = `Add anything you need from ${run.store} now — it'll show up on their list live.`;

    // Upsert (keyed per-recipient on user_id+dedup_key) so a re-tap of
    // "Start Shopping" for the same trip (e.g. after backgrounding the app)
    // doesn't stack duplicate notifications.
    await supabase.from('notification_logs').upsert(
      allowed.map((uid: string) => ({
        user_id: uid, title, body, type: 'shopping_trip_started', read: false,
        dedup_key: `shopping_trip_started:${run_id}`,
        data: { type: 'shopping_trip_started', run_id, store: run.store, shopper_member_id },
      })),
      { onConflict: 'user_id,dedup_key' }
    ).catch(() => {});

    const { data: tokens } = await supabase.from('push_tokens').select('token').in('user_id', allowed);
    const messages = (tokens ?? [])
      .filter((t: any) => t.token?.startsWith('ExponentPushToken'))
      .map((t: any) => ({
        to: t.token, sound: 'default', title, body,
        data: { type: 'shopping_trip_started', run_id, store: run.store },
        priority: 'default', channelId: 'family',
      }));

    if (messages.length > 0) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      }).catch(() => {});
    }

    return json({ success: true, notified: allowed.length });

  } catch (err: any) {
    console.error('notify-shopping-trip-started error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
