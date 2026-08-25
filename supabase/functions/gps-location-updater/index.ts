// FamilyCube — Edge Function: gps-location-updater
// Receives GPS pings from family member devices, runs Haversine distance against
// the family's actual home coordinates (fetched from DB, not hardcoded),
// evaluates named geofences, persists the location, and fires geofence / low-battery
// notifications via family-notifier.
//
// Deploy: supabase functions deploy gps-location-updater
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// DB required:
//   member_locations(member_id text primary key, family_id text, lat numeric,
//     lng numeric, address text, speed_mph numeric, battery_level int,
//     status text, safe_zone_name text, updated_at timestamptz default now())
//
//   families(id text, home_lat numeric, home_lng numeric, home_address text)
//
//   geofences(id uuid, family_id text, name text, lat numeric, lng numeric,
//     radius_miles numeric, notify_on_exit bool, notify_on_arrive bool)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ─── Haversine distance (miles) ───────────────────────────────────────────────
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      memberId,
      familyId,
      lat,
      lng,
      address,
      speedMph     = 0,
      batteryLevel = 100,
    } = await req.json() as {
      memberId:      string;
      familyId:      string;
      lat:           number;
      lng:           number;
      address?:      string;
      speedMph?:     number;
      batteryLevel?: number;
    };

    if (!memberId || !familyId || lat == null || lng == null)
      return json({ ok: false, error: 'memberId, familyId, lat, lng are required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const notifierUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/family-notifier`;
    const notifierHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    };

    // ── 1. Load family home coords from DB ───────────────────────────────────
    const { data: family } = await supabase
      .from('families')
      .select('home_lat, home_lng, home_address')
      .eq('id', familyId)
      .single();

    const homeLat = family?.home_lat ?? null;
    const homeLng = family?.home_lng ?? null;
    const distanceFromHomeMiles = (homeLat != null && homeLng != null)
      ? parseFloat(haversineMiles(lat, lng, homeLat, homeLng).toFixed(2))
      : null;

    // ── 2. Load named geofences for this family ──────────────────────────────
    const { data: geofences } = await supabase
      .from('geofences')
      .select('id, name, lat, lng, radius_miles, notify_on_exit, notify_on_arrive')
      .eq('family_id', familyId);

    // ── 3. Load previous location to detect zone transitions ────────────────
    const { data: prev } = await supabase
      .from('member_locations')
      .select('status, safe_zone_name, lat, lng, battery_level')
      .eq('member_id', memberId)
      .single();

    // ── 4. Determine current zone ─────────────────────────────────────────────
    let status      = 'unknown';
    let safeZoneName = 'Unknown';

    // Check named geofences first (most specific)
    let inZone: { name: string; id: string } | null = null;
    for (const z of (geofences ?? [])) {
      const dist = haversineMiles(lat, lng, z.lat, z.lng);
      if (dist <= z.radius_miles) { inZone = z; break; }
    }

    if (inZone) {
      status       = 'at_zone';
      safeZoneName = inZone.name;
    } else if (distanceFromHomeMiles != null && distanceFromHomeMiles < 0.15) {
      status       = 'at_home';
      safeZoneName = 'Home';
    } else if (speedMph > 5) {
      status       = 'in_transit';
      safeZoneName = 'En Route';
    } else {
      status       = 'at_activity';
      safeZoneName = address ? address.split(',')[0] : 'Away';
    }

    // ── 5. Persist updated location ───────────────────────────────────────────
    await supabase.from('member_locations').upsert({
      member_id:              memberId,
      family_id:              familyId,
      lat, lng,
      address:                address ?? null,
      speed_mph:              speedMph,
      battery_level:          batteryLevel,
      status,
      safe_zone_name:         safeZoneName,
      distance_from_home_miles: distanceFromHomeMiles,
      updated_at:             new Date().toISOString(),
    }, { onConflict: 'member_id' });

    // ── 6. Load member name for notification copy ─────────────────────────────
    const { data: member } = await supabase
      .from('members')
      .select('name')
      .eq('id', memberId)
      .single();

    const memberName = member?.name ?? 'A family member';

    // Parent member ids for geofence alerts — token resolution
    // (member_device_tokens, falling back to members.expo_push_token) now
    // happens inside family-notifier itself, given just memberIds. Avoids
    // this function's own snapshot of the single-column token, which is
    // stale for any parent who isn't the most recently active profile on a
    // shared device.
    const { data: parents } = await supabase
      .from('members')
      .select('id')
      .eq('family_id', familyId)
      .eq('role', 'parent');
    const parentMemberIds = (parents ?? []).map((p: any) => p.id);

    const fireNotif = async (type: string, payload: Record<string, unknown>) => {
      if (!parentMemberIds.length) return;
      await fetch(notifierUrl, {
        method: 'POST',
        headers: notifierHeaders,
        body: JSON.stringify({ type, memberIds: parentMemberIds, familyId, payload, persist: true }),
      });
    };

    const notifications: string[] = [];

    // ── 7. Geofence transition alerts ─────────────────────────────────────────
    const prevZone = prev?.safe_zone_name;
    const nowZone  = safeZoneName;

    if (prev && prevZone !== nowZone) {
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      // Left a named geofence → exit alert
      if (prevZone && prevZone !== 'En Route' && nowZone === 'En Route') {
        const zone = (geofences ?? []).find((z: any) => z.name === prevZone);
        if (!zone || zone.notify_on_exit) {
          await fireNotif('geofence_exit', { memberName, memberId, zoneName: prevZone, time });
          notifications.push(`geofence_exit: ${memberName} left ${prevZone}`);
        }
      }

      // Arrived at a named geofence or home → arrive alert
      if (nowZone !== 'En Route' && nowZone !== prevZone) {
        const zone = (geofences ?? []).find((z: any) => z.name === nowZone);
        const shouldNotify = nowZone === 'Home' || !zone || zone.notify_on_arrive;
        if (shouldNotify) {
          await fireNotif('geofence_arrive', { memberName, memberId, zoneName: nowZone, time });
          notifications.push(`geofence_arrive: ${memberName} arrived at ${nowZone}`);
        }
      }
    }

    // ── 8. Low battery alert (threshold: ≤15%, only once per session) ────────
    const prevBattery = prev?.battery_level ?? 100;
    if (batteryLevel <= 15 && prevBattery > 15) {
      await fireNotif('low_battery', { memberName, memberId, batteryLevel });
      notifications.push(`low_battery: ${memberName} at ${batteryLevel}%`);
    }

    console.log(`[gps-location-updater] ${memberName} → ${safeZoneName} (${distanceFromHomeMiles ?? '?'}mi from home, ${speedMph}mph, 🔋${batteryLevel}%)`);

    return json({
      ok: true,
      memberId,
      memberName,
      status,
      safeZoneName,
      distanceFromHomeMiles,
      speedMph,
      batteryLevel,
      zoneTransition: prev ? (prevZone !== nowZone ? `${prevZone} → ${nowZone}` : 'no change') : 'first ping',
      notifications,
      nextSyncInSeconds: 300,
    });

  } catch (e: any) {
    console.error('[gps-location-updater]', e);
    return json({ ok: false, error: e.message }, 500);
  }
});
