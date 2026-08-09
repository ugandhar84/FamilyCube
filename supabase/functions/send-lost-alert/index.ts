// PawBond — Edge Function: send-lost-alert
// Sends push notifications to nearby pet owners when a lost alert is created.
// Uses Expo Push Notification service.
// Deploy: supabase functions deploy send-lost-alert

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    console.log('[send-lost-alert] 🚨 START: Received request');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth check
    const authHeader = req.headers.get('Authorization');
    console.log('[send-lost-alert] 🔐 Auth header present:', !!authHeader);
    
    if (!authHeader) return json({ error: 'Unauthorized' }, 401, corsHeaders);
    
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authErr || !user) {
      console.error('[send-lost-alert] ❌ Auth failed:', authErr);
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }
    console.log('[send-lost-alert] ✅ Auth successful, user:', user.id);

    const { alert_id, pet_id, pet_name, pet_emoji, lat, lng, description, last_seen_address, contact_phone, reward_amount, radius_km = 10 } = await req.json();
    console.log('[send-lost-alert] 📝 Request params:', { alert_id, pet_id, pet_name, lat, lng, contact_phone, reward_amount, radius_km });

    // Get pet details for notification — include owner_id for ownership check
    console.log('[send-lost-alert] 🐾 Fetching pet details...');
    const { data: petData } = await supabase
      .from('pets')
      .select('name, emoji, species, breed, photo_url, description, microchip_id, owner_id')
      .eq('id', pet_id)
      .single();

    console.log('[send-lost-alert] ✅ Pet details:', petData?.name);

    // Fetch reporter handle for notification attribution
    const { data: reporterProfile } = await supabase
      .from('profiles')
      .select('handle, full_name')
      .eq('id', user.id)
      .single();
    const reporterHandle = reporterProfile?.handle ?? null;

    // Owner OR caretaker can send a lost alert
    if (petData && petData.owner_id !== user.id) {
      const { data: famRow } = await supabase
        .from('pet_family')
        .select('role')
        .eq('pet_id', pet_id)
        .eq('user_id', user.id)
        .single();
      if (famRow?.role !== 'caretaker') {
        console.error('[send-lost-alert] ❌ Ownership/caretaker check failed');
        return json({ error: 'Forbidden' }, 403, corsHeaders);
      }
    }

    if (!pet_name) {
      console.error('[send-lost-alert] ❌ Missing pet_name');
      return json({ error: 'pet_name required' }, 400, corsHeaders);
    }
    if (!lat || !lng) {
      console.warn('[send-lost-alert] ⚠️  No coordinates — skipping nearby search, storing DB notification only');
    }

    // Prevent duplicate sends — check alert_recipients instead of notification_sent
    // (notification_sent column may not exist; alert_recipients is more reliable)
    if (alert_id) {
      const { count } = await supabase
        .from('alert_recipients')
        .select('user_id', { count: 'exact', head: true })
        .eq('alert_id', alert_id);
      if ((count ?? 0) > 0) {
        console.log('[send-lost-alert] ⏭️  Already notified, skipping');
        return json({ success: true, notified: 0, message: 'Already notified' }, 200, corsHeaders);
      }
      console.log('[send-lost-alert] ✅ First send confirmed, proceeding');
    }

    // Get nearby users - direct database query (no RPC)
    console.log('[send-lost-alert] 🗺️  Finding nearby users...');
    console.log('[send-lost-alert] 📍 Alert location:', { lat, lng, radius_km });

    let nearbyUsers: any[] = [];

    if (lat && lng) {
    // Query all users with synced locations
    const { data: allUsers, error: usersErr } = await supabase
      .from('user_locations')
      .select('user_id, lat, lng')
      .not('user_id', 'is', null);

    if (usersErr) {
      console.error('[send-lost-alert] ❌ Failed to fetch user_locations:', usersErr);
    }

    console.log('[send-lost-alert] 📊 Total users with synced locations:', allUsers?.length ?? 0);

    // Filter by distance (simple Haversine approximation)
    nearbyUsers = (allUsers ?? [])
      .filter((u: any) => {
        const lat1 = parseFloat(lat);
        const lng1 = parseFloat(lng);
        const lat2 = parseFloat(u.lat);
        const lng2 = parseFloat(u.lng);

        // Haversine distance formula
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLng = (lng2 - lng1) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * (Math.PI / 180)) *
            Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        console.log(`[send-lost-alert]   User ${u.user_id}: ${distance.toFixed(2)}km away`);
        return distance <= radius_km && u.user_id !== user.id;
      })
      .map((u: any) => ({
        user_id: u.user_id,
        full_name: 'User',
        token: null,
      }));

    console.log('[send-lost-alert] 🎯 Found nearby recipients:', nearbyUsers.length);
    } // end if (lat && lng)

    // Check which users already got this alert (avoid duplicates from periodic-lost-alerts)
    let recipientsToNotify = nearbyUsers;
    if (alert_id && nearbyUsers.length > 0) {
      console.log('[send-lost-alert] 🔍 Checking for already-notified users...');
      const { data: alreadySent } = await supabase
        .from('alert_recipients')
        .select('user_id')
        .eq('alert_id', alert_id);

      const alreadySentIds = new Set((alreadySent ?? []).map((r: any) => r.user_id));
      console.log('[send-lost-alert] ✅ Already notified:', alreadySentIds.size, 'users');

      recipientsToNotify = nearbyUsers.filter((u) => !alreadySentIds.has(u.user_id));
      console.log('[send-lost-alert] 🆕 New users to notify:', recipientsToNotify.length);
    }

    if (recipientsToNotify.length === 0) {
      const reason = (!lat || !lng)
        ? 'No location provided — cannot find nearby users'
        : 'All nearby users already notified';
      console.log(`[send-lost-alert] ℹ️  No new users to notify: ${reason}`);
      return json({ success: true, notified: 0, message: reason }, 200, corsHeaders);
    }

    // Quiet hours / opt-out only suppresses push — in-app notifications always land so
    // users see the alert when they open the app, even if they missed the push.
    const allUserIds = recipientsToNotify.map((u: any) => u.user_id);
    const { allowed: allowedForPush, blocked: blockedForPush } = await filterByPref(supabase, allUserIds, 'notif_lost');
    console.log(`[send-lost-alert] 🔔 ${allowedForPush.length}/${allUserIds.length} users get push (${blockedForPush.length} quiet/opted-out — still get in-app)`);

    // Fetch push tokens for push-allowed recipients only
    const { data: tokenRows } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', allowedForPush)
      .like('token', 'ExponentPushToken%');

    const tokenMap = new Map((tokenRows ?? []).map((t: any) => [t.user_id, t.token]));
    recipientsToNotify = recipientsToNotify.map((u: any) => ({
      ...u,
      token: allowedForPush.includes(u.user_id) ? (tokenMap.get(u.user_id) ?? null) : null,
    }));

    // Separate users: with push tokens vs without (fallback to DB only)
    const usersWithTokens = recipientsToNotify.filter((u) => u.token && u.token.startsWith('ExponentPushToken'));
    const usersWithoutTokens = recipientsToNotify.filter((u) => !u.token || !u.token.startsWith('ExponentPushToken'));

    console.log(`[send-lost-alert] 📊 Users: ${usersWithTokens.length} with tokens, ${usersWithoutTokens.length} without`);

    let totalSent = 0;

    // ── PUSH NOTIFICATIONS (Primary) ─────────────────────────────────────────
    if (usersWithTokens.length > 0) {
      console.log('[send-lost-alert] 📱 Building Expo push messages...');
      const expoPushMessages = usersWithTokens.map((u) => ({
        to: u.token,
        sound: 'default',
        title: `🚨 Lost pet nearby`,
        body: description ?? `${pet_name} is lost! Can you help find them?`,
        data: {
          type: 'lost_alert',
          alert_id,
          pet_id,
          pet_name,
          pet_emoji,
          pet_photo: petData?.photo_url,
          pet_species: petData?.species,
          pet_breed: petData?.breed,
          pet_description: petData?.description,
          pet_microchip: petData?.microchip_id,
          last_seen_address,
          contact_phone,
          reward_amount,
          reporter_handle: reporterHandle,
        },
        priority: 'high',
        channelId: 'lost_alerts',
        badge: 1,
      }));

      console.log('[send-lost-alert] ✅ Built', expoPushMessages.length, 'push messages');

      // Send in batches of 100
      console.log('[send-lost-alert] 📤 Sending to Expo in batches of 100...');
      for (let i = 0; i < expoPushMessages.length; i += 100) {
        const batchNum = Math.floor(i / 100) + 1;
        const batch = expoPushMessages.slice(i, i + 100);
        console.log(`[send-lost-alert] 📤 Batch ${batchNum}: sending ${batch.length} messages...`);

        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });

        console.log(`[send-lost-alert]   Status: ${res.status}`);

        if (res.ok) {
          const result = await res.json();
          if (result.data) {
            const successful = result.data.filter((d: any) => d.status === 'ok').length;
            console.log(`[send-lost-alert]   ✅ ${successful}/${batch.length} succeeded`);
          }
        }
        totalSent += batch.length;
      }
    }

    // ── DATABASE FALLBACK (For all users, even without push tokens) ────────────
    console.log('[send-lost-alert] 💾 Storing notifications in DB for all new users...');

    // Store in DB for all new users (CRITICAL - this is the fallback system)
    console.log('[send-lost-alert] 💾 STORING NOTIFICATIONS for', recipientsToNotify.length, 'users...');

    if (recipientsToNotify.length > 0) {
      const notifInserts = recipientsToNotify.map((u) => {
        const row = {
          user_id: u.user_id,
          type: 'lost_alert',
          title: `🚨 Lost pet nearby`,
          body: description ?? `${pet_name} is lost near you. Can you help?`,
          data: {
            alert_id,
            pet_id,
            pet_name,
            pet_emoji,
            pet_photo: petData?.photo_url,
            pet_species: petData?.species,
            pet_breed: petData?.breed,
            pet_description: petData?.description,
            pet_microchip: petData?.microchip_id,
            lat,
            lng,
            description,
            last_seen_address,
            contact_phone,
            reward_amount,
          },
          read: false,
        };
        console.log('[send-lost-alert] 📝 Preparing notification for:', u.user_id);
        return row;
      });

      console.log('[send-lost-alert] 📤 INSERTING', notifInserts.length, 'rows into notification_logs...');
      const { error: dbErr, data: dbData } = await supabase
        .from('notification_logs')
        .insert(notifInserts);

      if (dbErr) {
        console.error('[send-lost-alert] ❌❌❌ DB INSERT FAILED ❌❌❌');
        console.error('[send-lost-alert] Error:', JSON.stringify(dbErr));
      } else {
        console.log('[send-lost-alert] ✅✅✅ SUCCESS! Inserted notifications');
      }
    } else {
      console.error('[send-lost-alert] ❌ ZERO nearby users - NOT storing anything');
    }

    // Track recipients to prevent duplicate sends in periodic cron
    console.log('[send-lost-alert] 📝 Tracking alert recipients for deduplication...');
    const recipientInserts = recipientsToNotify.map((u) => ({
      alert_id,
      user_id: u.user_id,
    }));

    if (recipientInserts.length > 0) {
      const { error: trackErr } = await supabase.from('alert_recipients')
        .insert(recipientInserts)
        .onConflict('alert_id, user_id')
        .ignore();  // Ignore if already tracked (handles race conditions)
      if (trackErr) {
        console.error('[send-lost-alert] ⚠️  Failed to track recipients:', trackErr);
      } else {
        console.log('[send-lost-alert] ✅ Tracked', recipientInserts.length, 'alert recipients');
      }
    }

    const inAppCount = recipientsToNotify.length;
    console.log('[send-lost-alert] ✅ COMPLETE: push', totalSent, 'in-app', inAppCount);
    return json({ success: true, notified: totalSent, in_app: inAppCount, message: `Notified ${inAppCount} nearby owners` }, 200, corsHeaders);

  } catch (err: any) {
    console.error('[send-lost-alert] 🔴 FATAL ERROR:', err);
    console.error('[send-lost-alert] Stack:', err.stack);
    return json({ error: err.message }, 500, corsHeaders);
  }
});

function json(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
