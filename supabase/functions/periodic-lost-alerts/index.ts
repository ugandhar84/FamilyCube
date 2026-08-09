// PawBond — Periodic Lost Alert Dispatcher
// Runs every 15 minutes to send alerts to newly arrived users in the area
// Only sends to users not already notified (checks alert_recipients table)
// Deploy: supabase functions deploy periodic-lost-alerts
// Cron: supabase functions update periodic-lost-alerts --update-schedule "*/15 * * * *"

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    console.log('[periodic-lost-alerts] 🔄 START: Checking for new nearby users for active lost alerts');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all active (not found, not expired) lost alerts
    console.log('[periodic-lost-alerts] 📋 Fetching active lost alerts (10-day window)...');
    const now = new Date().toISOString();
    const { data: activeAlerts, error: alertsErr } = await supabase
      .from('lost_alerts')
      .select('id, last_seen_lat, last_seen_lng, last_seen_address, pet_id, reported_by, pets(name, emoji), description, contact_phone, reward_amount, expires_at, created_at')
      .eq('is_found', false)
      .gt('expires_at', now)  // Only alerts that haven't expired yet
      .order('created_at', { ascending: false });

    if (alertsErr || !activeAlerts) {
      console.error('[periodic-lost-alerts] ❌ Could not fetch alerts:', alertsErr);
      return json({ error: 'Failed to fetch alerts' }, 500, corsHeaders);
    }

    console.log('[periodic-lost-alerts] 📊 Found', activeAlerts.length, 'active (non-expired) alerts');

    if (activeAlerts.length === 0) {
      return json({ success: true, checked: 0, sent: 0, message: 'No active alerts' }, 200, corsHeaders);
    }

    // Batch-fetch reporter handles for all active alerts
    const reporterIds = [...new Set(activeAlerts.map((a: any) => a.reported_by).filter(Boolean))];
    const { data: reporterProfiles } = reporterIds.length
      ? await supabase.from('profiles').select('id, handle').in('id', reporterIds)
      : { data: [] };
    const reporterHandleMap = Object.fromEntries((reporterProfiles ?? []).map((p: any) => [p.id, p.handle ?? null]));

    let totalSent = 0;

    // Haversine distance calculation (in km)
    function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
      const R = 6371; // Earth radius in km
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLng = (lng2 - lng1) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.asin(Math.sqrt(a));
      return R * c;
    }

    // For each active alert, find new nearby users
    for (const alert of activeAlerts) {
      if (!alert.last_seen_lat || !alert.last_seen_lng) {
        console.warn(`[periodic-lost-alerts] ⏭️  Alert ${alert.id} has no location, skipping`);
        continue;
      }

      const expiresIn = new Date((alert as any).expires_at).getTime() - Date.now();
      const daysLeft = Math.ceil(expiresIn / (1000 * 60 * 60 * 24));
      console.log(`[periodic-lost-alerts] 🔍 Checking alert ${alert.id} (expires in ${daysLeft} days)...`);

      // Query user_locations directly instead of RPC (handles users without push tokens)
      console.log(`[periodic-lost-alerts] 📍 Querying user locations...`);
      const { data: allUsers, error: locErr } = await supabase
        .from('user_locations')
        .select('user_id, lat, lng')
        .not('user_id', 'is', null);

      if (locErr || !allUsers) {
        console.error(`[periodic-lost-alerts] ❌ Location query error for alert ${alert.id}:`, locErr);
        continue;
      }

      // Filter by distance using Haversine
      const RADIUS_KM = 10;
      const nearbyUsers = allUsers
        .filter((u) => haversine(alert.last_seen_lat, alert.last_seen_lng, u.lat, u.lng) <= RADIUS_KM && u.user_id !== alert.reported_by)
        .map((u) => ({ user_id: u.user_id }));

      if (nearbyUsers.length === 0) {
        console.log(`[periodic-lost-alerts] ℹ️  No nearby users for alert ${alert.id}`);
        continue;
      }

      console.log(`[periodic-lost-alerts] 👥 Found ${nearbyUsers.length} nearby users`);

      // Get users who already received this alert
      const { data: alreadySent } = await supabase
        .from('alert_recipients')
        .select('user_id')
        .eq('alert_id', alert.id);

      const alreadySentIds = new Set((alreadySent ?? []).map((r: any) => r.user_id));
      console.log(`[periodic-lost-alerts] ✅ ${alreadySentIds.size} users already notified`);

      // Find new users (not in alreadySentIds)
      let newUsers = nearbyUsers.filter((u) => !alreadySentIds.has(u.user_id));
      console.log(`[periodic-lost-alerts] 🆕 ${newUsers.length} NEW users to notify`);

      if (newUsers.length === 0) {
        console.log(`[periodic-lost-alerts] ℹ️  No new users for alert ${alert.id}`);
        continue;
      }

      // Filter by notification preference
      const { allowed: allowedIds } = await filterByPref(supabase, newUsers.map((u) => u.user_id), 'notif_lost');
      newUsers = newUsers.filter((u) => allowedIds.includes(u.user_id));
      if (newUsers.length === 0) {
        console.log(`[periodic-lost-alerts] ℹ️  All users opted out for alert ${alert.id}`);
        continue;
      }

      // Fetch push tokens for new users
      console.log(`[periodic-lost-alerts] 📱 Fetching push tokens...`);
      const { data: tokenRows } = await supabase
        .from('push_tokens')
        .select('user_id, token')
        .in('user_id', newUsers.map((u) => u.user_id))
        .like('token', 'ExponentPushToken%');

      console.log(`[periodic-lost-alerts] ✅ Got ${tokenRows?.length ?? 0} valid tokens`);

      // Fetch pet details for notification
      console.log(`[periodic-lost-alerts] 🐾 Fetching pet details...`);
      const { data: petData } = await supabase
        .from('pets')
        .select('name, emoji, species, breed, photo_url, description, microchip_id')
        .eq('id', alert.pet_id)
        .single();

      const reporterHandle = reporterHandleMap[(alert as any).reported_by] ?? null;

      // ── PUSH NOTIFICATIONS (Primary) ─────────────────────────────────────
      if (tokenRows && tokenRows.length > 0) {
        const messages = tokenRows.map((t: any) => ({
          to: t.token,
          sound: 'default',
          title: `🚨 Lost pet nearby`,
          body: alert.description ?? `A pet is lost in your area. Can you help?`,
          data: {
            type: 'lost_alert',
            alert_id: alert.id,
            pet_id: alert.pet_id,
            pet_name: (alert.pets as any)?.name,
            pet_emoji: (alert.pets as any)?.emoji,
            pet_photo: petData?.photo_url,
            pet_species: petData?.species,
            pet_breed: petData?.breed,
            pet_description: petData?.description,
            pet_microchip: petData?.microchip_id,
            lat: alert.last_seen_lat,
            lng: alert.last_seen_lng,
            last_seen_address: (alert as any).last_seen_address,
            contact_phone: (alert as any).contact_phone,
            reward_amount: (alert as any).reward_amount,
            reporter_handle: reporterHandle,
          },
          priority: 'high',
          channelId: 'lost_alerts',
          badge: 1,
        }));

        console.log(`[periodic-lost-alerts] 📤 Sending ${messages.length} push notifications...`);

        // Send in batches
        for (let i = 0; i < messages.length; i += 100) {
          const batch = messages.slice(i, i + 100);
          const batchNum = Math.floor(i / 100) + 1;

          const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(batch),
          });

          if (res.ok) {
            const result = await res.json();
            if (result.data) {
              const successful = result.data.filter((d: any) => d.status === 'ok').length;
              console.log(`[periodic-lost-alerts]   ✅ Batch ${batchNum}: ${successful}/${batch.length} sent`);
              totalSent += successful;
            }
          } else {
            console.error(`[periodic-lost-alerts]   ❌ Batch ${batchNum} failed: ${res.status}`);
          }
        }
      }

      // ── DATABASE FALLBACK (For all users, even without push tokens) ────────
      if (newUsers.length > 0) {
        const dbInserts = newUsers.map((u) => ({
          user_id: u.user_id,
          title: `🚨 Lost pet nearby`,
          body: alert.description ?? `A pet is lost in your area. Can you help?`,
          type: 'lost_alert',
          data: {
            alert_id: alert.id,
            pet_id: alert.pet_id,
            pet_name: (alert.pets as any)?.name,
            pet_emoji: (alert.pets as any)?.emoji,
            pet_photo: petData?.photo_url,
            pet_species: petData?.species,
            pet_breed: petData?.breed,
            pet_description: petData?.description,
            pet_microchip: petData?.microchip_id,
            lat: alert.last_seen_lat,
            lng: alert.last_seen_lng,
            last_seen_address: (alert as any).last_seen_address,
            contact_phone: (alert as any).contact_phone,
            reward_amount: (alert as any).reward_amount,
            reporter_handle: reporterHandle,
          },
          read: false,
        }));

        const { error: dbErr } = await supabase.from('notification_logs').insert(dbInserts);
        if (dbErr) {
          console.error(`[periodic-lost-alerts] ⚠️  DB insert failed:`, dbErr);
        } else {
          console.log(`[periodic-lost-alerts] 💾 Logged ${dbInserts.length} notifications to DB (fallback)`);
        }
      }

      // Track these users in alert_recipients to prevent future duplicates
      const recipientInserts = newUsers.map((u) => ({
        alert_id: alert.id,
        user_id: u.user_id,
      }));

      if (recipientInserts.length > 0) {
        const { error: insertErr } = await supabase.from('alert_recipients')
          .insert(recipientInserts)
          .onConflict('alert_id, user_id')
          .ignore();  // Safe: (alert_id, user_id) is already unique
        if (insertErr) {
          console.error(`[periodic-lost-alerts] ⚠️  Failed to track ${recipientInserts.length} recipients:`, insertErr);
        } else {
          console.log(`[periodic-lost-alerts] ✅ Tracked ${recipientInserts.length} new recipients`);
        }
      }
    }

    console.log('[periodic-lost-alerts] ✅ COMPLETE: Sent', totalSent, 'alerts to new users');
    return json(
      { success: true, checked: activeAlerts.length, sent: totalSent },
      200,
      corsHeaders
    );
  } catch (err: any) {
    console.error('[periodic-lost-alerts] 🔴 FATAL ERROR:', err);
    console.error('[periodic-lost-alerts] Stack:', err.stack);
    return json({ error: err.message }, 500, corsHeaders);
  }
});

function json(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
