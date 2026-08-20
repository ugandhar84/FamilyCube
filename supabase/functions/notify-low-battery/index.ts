// PawBond — Edge Function: notify-low-battery
// Called (client-side, from GpsTab.tsx / the location task) when a family
// member's device battery drops below 15%. Notifies every other member of
// the same family so they know to check in / bring a charger.
// Deploy: supabase functions deploy notify-low-battery

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

    const { member_id, battery_level } = await req.json();
    if (!member_id || typeof battery_level !== 'number') {
      return json({ error: 'member_id and battery_level required' }, 400);
    }

    const { data: member } = await supabase.from('members')
      .select('id, name, family_id').eq('id', member_id).single();
    if (!member) return json({ error: 'Member not found' }, 404);

    const { data: others } = await supabase.from('members')
      .select('id, auth_user_id')
      .eq('family_id', member.family_id)
      .neq('id', member_id)
      .not('auth_user_id', 'is', null);

    const recipientIds = (others ?? []).map((m: any) => m.auth_user_id as string);
    if (recipientIds.length === 0) return json({ success: true, notified: 0 });

    const { allowed } = await filterByPref(supabase, recipientIds, 'notif_family');
    if (allowed.length === 0) return json({ success: true, notified: 0 });

    const title = `🔋 ${member.name}'s battery is low`;
    const body  = `${battery_level}% remaining — their location may stop updating soon.`;

    await supabase.from('notification_logs').insert(
      allowed.map((uid: string) => ({
        user_id: uid, title, body, type: 'low_battery', read: false,
        data: { type: 'low_battery', member_id, battery_level },
      }))
    ).catch(() => {});

    const { data: tokens } = await supabase.from('push_tokens').select('token').in('user_id', allowed);
    const messages = (tokens ?? [])
      .filter((t: any) => t.token?.startsWith('ExponentPushToken'))
      .map((t: any) => ({
        to: t.token, sound: 'default', title, body,
        data: { type: 'low_battery', member_id, battery_level },
        priority: 'high', channelId: 'family',
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
    console.error('notify-low-battery error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
