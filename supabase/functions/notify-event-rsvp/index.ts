// PawBond — Edge Function: notify-event-rsvp
// Called after an RSVP is added or removed.
// On join:   notifies organizer + existing attendees with updated count.
// On cancel: notifies organizer and remaining attendees.
// Deploy: supabase functions deploy notify-event-rsvp

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canNotify, filterByPref } from './prefs.ts';

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

    // Auth
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { event_id, action, changed_fields } = await req.json(); // action: 'join' | 'cancel' | 'updated'
    if (!event_id || !['join', 'cancel', 'updated'].includes(action)) {
      return json({ error: 'event_id and action (join|cancel|updated) required' }, 400);
    }

    // Fetch event + current RSVP count + all attendees in parallel
    const [eventRes, rsvpRes, profileRes, allAttendeesRes] = await Promise.all([
      supabase.from('community_events')
        .select('id, title, organizer_id, event_date, event_time, location_name')
        .eq('id', event_id).single(),
      supabase.from('event_rsvps')
        .select('user_id', { count: 'exact', head: true })
        .eq('event_id', event_id),
      supabase.from('profiles')
        .select('handle, full_name')
        .eq('id', user.id).single(),
      supabase.from('event_rsvps')
        .select('user_id')
        .eq('event_id', event_id),
    ]);

    const event   = eventRes.data;
    const rsvpCount = rsvpRes.count ?? 0;
    const joinerName = profileRes.data?.handle ? `@${profileRes.data.handle}` : (profileRes.data?.full_name ?? 'Someone');
    const attendeeIds = (allAttendeesRes.data ?? []).map((a: any) => a.user_id);

    if (!event) return json({ error: 'Event not found' }, 404);

    let notifiedCount = 0;

    // ── Event updated — notify all RSVPed attendees ────────────────────────────
    if (action === 'updated') {
      const attendeeIdsExcludingOrganizer = attendeeIds.filter((id: string) => id !== event.organizer_id);
      if (attendeeIdsExcludingOrganizer.length === 0) return json({ success: true, notified: 0 });

      const what = Array.isArray(changed_fields) && changed_fields.length
        ? changed_fields.join(', ')
        : 'details';
      const title = `📅 "${event.title}" has been updated`;
      const body  = `The organiser changed ${what}. Tap to see the latest details.`;

      const { allowed } = await filterByPref(supabase, attendeeIdsExcludingOrganizer, 'notif_event');

      await supabase.from('notification_logs').insert(
        allowed.map((uid: string) => ({
          user_id: uid, title, body, type: 'event_update', read: false,
          data: { type: 'event_update', event_id },
        }))
      ).catch(() => {});

      const { data: tokens } = allowed.length > 0
        ? await supabase.from('push_tokens').select('token').in('user_id', allowed)
        : { data: null };

      const messages = (tokens ?? [])
        .filter((t: any) => t.token?.startsWith('ExponentPushToken'))
        .map((t: any) => ({
          to: t.token, sound: 'default', title, body,
          data: { type: 'event_update', event_id },
          priority: 'high', channelId: 'social',
        }));

      if (messages.length > 0) {
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(messages),
        }).catch(() => {});
        notifiedCount += messages.length;
      }

      return json({ success: true, notified: notifiedCount });
    }

    // ── Notify organizer (skip when organizer is the one RSVPing) ─────────────
    if (event.organizer_id !== user.id) {
      const organizerTitle = action === 'join'
        ? `🎉 ${joinerName} is attending "${event.title}"`
        : `${joinerName} cancelled their RSVP to "${event.title}"`;
      const organizerBody = action === 'join'
        ? `${rsvpCount} ${rsvpCount === 1 ? 'person' : 'people'} attending so far.`
        : `${rsvpCount} ${rsvpCount === 1 ? 'person' : 'people'} still attending.`;

      // Upsert so rapid join/cancel cycles don't stack unbounded rows for the organizer
      await supabase.from('notification_logs').upsert({
        user_id: event.organizer_id,
        title: organizerTitle,
        body: organizerBody,
        type: 'event_rsvp',
        read: false,
        dedup_key: `event_rsvp:${event_id}:${user.id}`,
        data: { type: 'event_rsvp', event_id, action, rsvp_count: rsvpCount },
      }, { onConflict: 'user_id,dedup_key' }).catch(() => {});

      const organizerCanNotify = await canNotify(supabase, event.organizer_id, 'notif_event');
      const { data: organizerTokens } = organizerCanNotify ? await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', event.organizer_id) : { data: null };

      if (organizerTokens && organizerTokens.length > 0) {
        const organizerMessages = organizerTokens
          .filter((t: any) => t.token?.startsWith('ExponentPushToken'))
          .map((t: any) => ({
            to: t.token, sound: 'default', title: organizerTitle, body: organizerBody,
            data: { type: 'event_rsvp', event_id, action },
            priority: 'default', channelId: 'social',
          }));

        if (organizerMessages.length > 0) {
          const pushRes = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(organizerMessages),
          });
          if (!pushRes.ok) {
            console.error('[notify-event-rsvp] Organizer push failed:', pushRes.status);
          } else {
            notifiedCount += organizerMessages.length;
          }
        }
      }
    }

    // ── Notify other attendees (except organizer and the person who RSVPed) ───
    const otherAttendeeIds = attendeeIds.filter((id: string) => 
      id !== event.organizer_id && id !== user.id
    );

    if (otherAttendeeIds.length > 0) {
      const attendeeTitle = action === 'join'
        ? `🎉 ${joinerName} is coming to "${event.title}"`
        : `${joinerName} is no longer coming to "${event.title}"`;
      const attendeeBody = action === 'join'
        ? `${rsvpCount} people confirmed! Exciting times ahead.`
        : `Now ${rsvpCount} attending.`;

      const { allowed: allowedAttendeeIds } = await filterByPref(supabase, otherAttendeeIds, 'notif_event');

      // In-app notifications for attendees
      await supabase.from('notification_logs').insert(
        allowedAttendeeIds.map((attendeeId: string) => ({
          user_id: attendeeId,
          title: attendeeTitle,
          body: attendeeBody,
          type: 'event_update',
          data: { type: 'event_update', event_id, action, rsvp_count: rsvpCount },
        }))
      ).catch(() => {});

      // Push notifications for attendees
      const { data: attendeeTokens } = allowedAttendeeIds.length > 0 ? await supabase
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', allowedAttendeeIds) : { data: null };

      if (attendeeTokens && attendeeTokens.length > 0) {
        const attendeeMessages = attendeeTokens
          .filter((t: any) => t.token?.startsWith('ExponentPushToken'))
          .map((t: any) => ({
            to: t.token, sound: 'default', title: attendeeTitle, body: attendeeBody,
            data: { type: 'event_update', event_id, action },
            priority: 'default', channelId: 'social',
          }));

        if (attendeeMessages.length > 0) {
          const pushRes = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(attendeeMessages),
          });
          if (!pushRes.ok) {
            console.error('[notify-event-rsvp] Attendee push failed:', pushRes.status);
          } else {
            notifiedCount += attendeeMessages.length;
          }
        }
      }
    }

    return json({ success: true, notified: notifiedCount });

  } catch (err: any) {
    console.error('notify-event-rsvp error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
