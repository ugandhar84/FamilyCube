// PawBond — Edge Function: send-found-alert
// Notifies everyone who received the original lost alert that the pet is home safe.
// Includes warm personalised message + pet passport deep link.
// Deploy: supabase functions deploy send-found-alert

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const FOUND_MESSAGES = [
  (name: string) => `${name} is safely home! 🏠 Thank you to everyone who helped search. You made a difference. 💚`,
  (name: string) => `Happy news! ${name} has been found and is back where they belong. The whole community helped make this happen. 🎉`,
  (name: string) => `${name} is home safe! 🐾 Because of people like you watching out, this story has a happy ending. Thank you! 💛`,
  (name: string) => `Great news — ${name} is found! Every share and every pair of eyes helped. This is what community is all about. 🌟`,
  (name: string) => `${name} is back home safe and sound! 🎊 Thanks for being part of the PawBond community that looks out for each other.`,
];

function pickMessage(pet_name: string): string {
  const idx = Math.floor(Math.random() * FOUND_MESSAGES.length);
  return FOUND_MESSAGES[idx](pet_name);
}

function formatDuration(ms: number): string {
  const mins  = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${mins} minute${mins !== 1 ? 's' : ''}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    console.log('[send-found-alert] 🎉 START: Pet found notification');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify caller identity
    const authHeader = req.headers.get('Authorization') ?? '';
    console.log('[send-found-alert] 🔐 Auth header present:', !!authHeader);
    
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authErr || !user) {
      console.error('[send-found-alert] ❌ Auth failed:', authErr);
      return json({ error: 'Unauthorized' }, 401);
    }
    console.log('[send-found-alert] ✅ Auth successful, user:', user.id);

    const { alert_id, pet_name, pet_emoji, custom_message, found_details, found_by, found_by_user_id } = await req.json();
    console.log('[send-found-alert] 📝 Request params:', { alert_id, pet_name, pet_emoji, custom_message, found_details, found_by, found_by_user_id });
    
    if (!alert_id || !pet_name) return json({ error: 'alert_id and pet_name required' }, 400);

    // Load alert details
    console.log('[send-found-alert] 📋 Loading alert from DB...');
    const { data: alert, error: alertErr } = await supabase.from('lost_alerts')
      .select('id, reported_by, pet_id, created_at, last_seen_address, last_seen_lat, last_seen_lng')
      .eq('id', alert_id).single();

    if (alertErr || !alert) {
      console.error('[send-found-alert] ❌ Alert not found:', alertErr);
      return json({ error: 'Alert not found' }, 404);
    }
    console.log('[send-found-alert] ✅ Alert found, pet_id:', alert.pet_id);

    // Check authorization
    const { data: ownerRow } = await supabase.from('pets').select('id')
      .eq('id', alert.pet_id).eq('owner_id', user.id).maybeSingle();
    const { data: familyRow } = await supabase.from('pet_family').select('role')
      .eq('pet_id', alert.pet_id).eq('user_id', user.id).maybeSingle();
    const canMarkFound = !!ownerRow || familyRow?.role === 'caretaker';
    
    if (!canMarkFound) {
      console.error('[send-found-alert] ❌ Unauthorized: not owner or caretaker');
      return json({ error: 'Only the pet owner or caretaker can send a found notice' }, 403);
    }
    console.log('[send-found-alert] ✅ User authorized');

    const name = pet_name;
    const missingMs  = Date.now() - new Date(alert.created_at).getTime();
    const missingStr = formatDuration(missingMs);
    console.log('[send-found-alert] ⏱️  Missing duration:', missingStr);

    // Get all users who received this alert (from alert_recipients tracking)
    console.log('[send-found-alert] 🔍 Loading alert recipients from tracking table...');
    const { data: recipientRows, error: fetchErr } = await supabase
      .from('alert_recipients')
      .select('user_id')
      .eq('alert_id', alert_id);

    if (fetchErr) {
      console.error('[send-found-alert] ❌ Could not fetch recipients:', fetchErr);
      return json({ error: 'Could not load recipients' }, 500);
    }

    // Exclude the caller AND the pet owner — they already know the pet is home
    const excludeIds = new Set([user.id, alert.reported_by].filter(Boolean));
    let recipientIds = (recipientRows ?? [])
      .map((r: any) => r.user_id)
      .filter((uid: string) => !excludeIds.has(uid));

    console.log('[send-found-alert] 👥 Found', recipientIds.length, 'from alert_recipients');

    // Fallback: if no recipients tracked, query users near the original sighting location
    if (recipientIds.length === 0 && alert.last_seen_lat && alert.last_seen_lng) {
      console.warn('[send-found-alert] ⚠️  No tracked recipients, querying nearby users as fallback...');
      const { data: allUsers } = await supabase
        .from('user_locations')
        .select('user_id, lat, lng')
        .not('user_id', 'is', null);

      if (allUsers && allUsers.length > 0) {
        const RADIUS_KM = 10;
        const alertLat  = parseFloat(alert.last_seen_lat);
        const alertLng  = parseFloat(alert.last_seen_lng);
        recipientIds = allUsers
          .filter((u: any) => {
            const dLat = (u.lat - alertLat) * (Math.PI / 180);
            const dLng = (u.lng - alertLng) * (Math.PI / 180);
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(alertLat * (Math.PI / 180)) * Math.cos(u.lat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
            return 6371 * 2 * Math.asin(Math.sqrt(a)) <= RADIUS_KM;
          })
          .map((u: any) => u.user_id)
          .filter((uid: string) => !excludeIds.has(uid));
        console.log('[send-found-alert] 🔍 Fallback found', recipientIds.length, 'nearby users');
      }
    }

    // Quiet hours only suppresses push — in-app always lands
    const { allowed: allowedForPush } = await filterByPref(supabase, recipientIds, 'notif_lost');
    const allRecipientIds = recipientIds;

    console.log('[send-found-alert] 👥 Recipients to notify:', allRecipientIds.length, `(${allowedForPush.length} get push, ${recipientIds.length - allowedForPush.length} quiet/opted-out get in-app only)`);

    if (allRecipientIds.length === 0) {
      console.warn('[send-found-alert] ⚠️  No recipients found — original alert may have had no location or no nearby users');
      return json({
        success: true,
        notified: 0,
        in_app: 0,
        message: 'No recipients found — the original lost alert may not have reached any nearby owners',
      }, 200);
    }

    // Compose message — owner's custom message takes priority, falls back to a friendly default
    const title = `🎉 Found! ${pet_emoji} ${name} is home safe`;
    const body = (custom_message && String(custom_message).trim()) || pickMessage(name);
    const subtitle = `Missing for ${missingStr}${alert.last_seen_address ? ` · last seen near ${alert.last_seen_address}` : ''}`;

    console.log('[send-found-alert] 💬 Message:', { title, body, subtitle });

    // Fetch push tokens — only for push-allowed users
    console.log('[send-found-alert] 📱 Fetching push tokens...');
    const { data: tokenRows } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', allowedForPush)
      .like('token', 'ExponentPushToken%');

    console.log('[send-found-alert] ✅ Got', tokenRows?.length ?? 0, 'valid tokens');

    let totalSent = 0;

    // ── PUSH NOTIFICATIONS (Primary) ─────────────────────────────────────
    if (tokenRows && tokenRows.length > 0) {
      console.log('[send-found-alert] 📤 Building Expo messages...');
      const expoMessages = tokenRows.map((t: any) => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        subtitle,
        data: {
          type: 'pet_found',
          alert_id,
          pet_id: alert.pet_id,
          pet_name: name,
          pet_emoji,
          found_details,
          found_by,
          found_by_user_id,
          deep_link: `pawbond://pet/card?id=${alert.pet_id}`,
        },
        priority: 'default',
        channelId: 'lost_alerts',
      }));

      console.log('[send-found-alert] ✅ Built', expoMessages.length, 'push messages');

      // Send in batches
      console.log('[send-found-alert] 📦 Sending to Expo in batches of 100...');
      for (let i = 0; i < expoMessages.length; i += 100) {
        const batchNum = Math.floor(i / 100) + 1;
        const batch = expoMessages.slice(i, i + 100);
        console.log(`[send-found-alert] 📤 Batch ${batchNum}: sending ${batch.length} messages...`);

        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });

        console.log(`[send-found-alert]   Status: ${res.status}`);

        if (res.ok) {
          const result = await res.json();
          if (result.data) {
            const successful = result.data.filter((d: any) => d.status === 'ok').length;
            console.log(`[send-found-alert]   ✅ ${successful}/${batch.length} succeeded`);
          }
        } else {
          console.error(`[send-found-alert] ❌ Batch ${batchNum} failed with status ${res.status}`);
        }
        totalSent += batch.length;
      }
    }

    // ── DATABASE FALLBACK (For all recipients, even without push tokens) ────
    // Get pet details for notification
    console.log('[send-found-alert] 🐾 Fetching pet details...');
    const { data: petData } = await supabase
      .from('pets')
      .select('name, emoji, species, breed, photo_url, description, microchip_id')
      .eq('id', alert.pet_id)
      .single();

    // Owner gets a warm personal confirmation; neighbours get the community message
    const ownerTitle = `🎉 ${pet_emoji} ${name} is home!`;
    const ownerBody  = `You've marked ${name} as found after ${missingStr} missing. So glad they're safe! 🐾`;

    const notifRows = [
      // Owner's personal confirmation
      {
        user_id: alert.reported_by,
        title: ownerTitle,
        body: ownerBody,
        type: 'pet_found',
        data: {
          type: 'pet_found', alert_id, pet_id: alert.pet_id, pet_name: name, pet_emoji,
          pet_photo: petData?.photo_url, found_details, found_by, found_by_user_id,
          is_owner_confirmation: true,
        },
        read: false,
      },
      // Neighbours / community
      ...allRecipientIds.map((uid) => ({
        user_id: uid,
        title,
        body,
        type: 'pet_found',
        data: {
          type: 'pet_found', alert_id, pet_id: alert.pet_id, pet_name: name, pet_emoji,
          pet_photo: petData?.photo_url, pet_species: petData?.species, pet_breed: petData?.breed,
          pet_description: petData?.description, pet_microchip: petData?.microchip_id,
          found_details, found_by, found_by_user_id,
        },
        read: false,
      })),
    ];

    console.log('[send-found-alert] 💾 Storing in DB for owner + all recipients...');
    const { error: dbErr } = await supabase.from('notification_logs').insert(notifRows);

    if (dbErr) {
      console.error('[send-found-alert] ❌ DB error:', dbErr);
    } else {
      console.log('[send-found-alert] ✅ Logged', allRecipientIds.length, 'notifications to DB');
    }

    console.log('[send-found-alert] ✅ COMPLETE: Notified', Math.max(totalSent, allRecipientIds.length), 'users');
    return json({
      success: true,
      notified: totalSent,
      in_app: allRecipientIds.length,
      message: `Notified ${allRecipientIds.length} people that ${name} is home safe 🎉`,
    });

  } catch (err: any) {
    console.error('[send-found-alert] 🔴 FATAL ERROR:', err);
    console.error('[send-found-alert] Stack:', err.stack);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
