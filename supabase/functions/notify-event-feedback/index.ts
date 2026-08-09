// PawBond — Edge Function: notify-event-feedback
// Called after a user submits a star rating for an event.
// Notifies the event organizer that they received a new review.
// Deploy: supabase functions deploy notify-event-feedback

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canNotify } from '../_shared/prefs.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Authenticate caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { event_id, rating } = await req.json();
    if (!event_id || !rating) return json({ error: 'event_id and rating required' }, 400);

    // Fetch event + organizer + reviewer in parallel
    const [eventRes, reviewerRes] = await Promise.all([
      supabase.from('community_events')
        .select('id, title, organizer_id')
        .eq('id', event_id).single(),
      supabase.from('profiles')
        .select('full_name, handle')
        .eq('id', user.id).single(),
    ]);

    const event = eventRes.data;
    if (!event) return json({ error: 'Event not found' }, 404);

    const organizerId = event.organizer_id;
    // Don't notify if the organizer rated themselves
    if (organizerId === user.id) return json({ ok: true, skipped: 'self' });

    const reviewerName = reviewerRes.data?.handle
      ? `@${reviewerRes.data.handle}`
      : (reviewerRes.data?.full_name ?? 'Someone');

    const stars = '⭐'.repeat(Math.min(5, Math.max(1, rating)));

    // Check organizer pref (reuse notif_event channel)
    const allowed = await canNotify(supabase, organizerId, 'notif_event');
    if (!allowed) return json({ ok: true, skipped: 'pref' });

    // Fetch organizer push token
    const { data: tokenRows } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', organizerId);

    const tokens: string[] = (tokenRows ?? [])
      .map((r: any) => r.token)
      .filter((t: string) => t?.startsWith('ExponentPushToken'));

    if (tokens.length === 0) return json({ ok: true, skipped: 'no_token' });

    const messages = tokens.map(to => ({
      to,
      title: `New review for "${event.title}"`,
      body: `${reviewerName} rated your event ${stars}`,
      data: { type: 'event_feedback', event_id },
    }));

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    // Log the notification
    await supabase.from('notification_logs').insert({
      user_id: organizerId,
      type: 'event_feedback',
      title: `New review for "${event.title}"`,
      body: `${reviewerName} rated your event ${stars}`,
      read: false,
      data: { type: 'event_feedback', event_id, rating, reviewer_id: user.id },
    }).catch(() => {});

    return json({ ok: true, sent: tokens.length });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
