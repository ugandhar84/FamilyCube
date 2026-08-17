// FamilyCube — Edge Function: maps-directions
// Responsibility Engine Phase 5 (part 2/2): real driving route distance/
// duration via Apple MapKit JS Server's /v1/directions endpoint. This is
// what makes "incremental burden" (the spec's core routing concept) a real
// number instead of the neutral placeholder process-task-assignment used
// before this existed.
//
// Two modes:
//   1. Plain route: { originLat, originLng, destLat, destLng } -> one leg's
//      distance/duration.
//   2. Incremental burden: { memberId, familyId, destinationLocationId,
//      referenceEventId? } -> computes the SAME "home -> normal stop ->
//      home" vs "home -> normal stop -> new stop -> home" comparison the
//      spec's soccer+grocery example describes, using the member's home
//      location (families.home_lat/lng) as the base point and, if a
//      referenceEventId is given, that event's resolved location as the
//      "already going there anyway" waypoint. Writes the result to
//      route_context so process-task-assignment picks it up on next run
//      (it already reads route_context — this is what finally populates it
//      with real data instead of leaving that scoring signal neutral).
//
// Deploy: supabase functions deploy maps-directions
// Secrets: APPLE_MAPS_PRIVATE_KEY, APPLE_MAPS_KEY_ID, APPLE_MAPS_TEAM_ID,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAppleMapsAccessToken, getAppleMapsCredentials } from '../_shared/appleMapsAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Leg { distanceMeters: number; durationSeconds: number }

async function fetchRoute(accessToken: string, origin: string, dest: string): Promise<Leg | null> {
  const url = new URL('https://maps-api.apple.com/v1/directions');
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', dest);
  url.searchParams.set('transportType', 'Automobile');
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  return { distanceMeters: route.distanceMeters, durationSeconds: route.expectedTravelTimeSeconds ?? route.durationSeconds };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const creds = getAppleMapsCredentials();
    if (!creds) return json({ error: 'Apple Maps not configured' }, 503);
    const accessToken = await getAppleMapsAccessToken(creds.privateKey, creds.keyId, creds.teamId);

    const { originLat, originLng, destLat, destLng, memberId, familyId, destinationLocationId, referenceEventId } = body as {
      originLat?: number; originLng?: number; destLat?: number; destLng?: number;
      memberId?: string; familyId?: string; destinationLocationId?: string; referenceEventId?: string;
    };

    // ── Mode 1: plain point-to-point route ──────────────────────────────────
    if (originLat != null && originLng != null && destLat != null && destLng != null) {
      const leg = await fetchRoute(accessToken, `${originLat},${originLng}`, `${destLat},${destLng}`);
      if (!leg) return json({ resolved: false, error: 'No route found' });
      return json({ resolved: true, ...leg });
    }

    // ── Mode 2: incremental-burden calculation ──────────────────────────────
    if (!memberId || !familyId || !destinationLocationId) {
      return json({ error: 'Either (originLat/Lng + destLat/Lng) or (memberId, familyId, destinationLocationId) are required' }, 400);
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: family } = await supabase.from('families').select('home_lat, home_lng').eq('id', familyId).maybeSingle();
    if (!family?.home_lat || !family?.home_lng) {
      return json({ resolved: false, error: 'Family has no home_lat/home_lng set — cannot compute a base route. Set it in Settings first.' });
    }
    const home = `${family.home_lat},${family.home_lng}`;

    const { data: dest } = await supabase.from('locations').select('latitude, longitude').eq('id', destinationLocationId).maybeSingle();
    if (!dest?.latitude || !dest?.longitude) {
      return json({ resolved: false, error: 'Destination location has no resolved latitude/longitude — call maps-geocode on it first.' });
    }
    const destPoint = `${dest.latitude},${dest.longitude}`;

    // Base route: home -> destination -> home (no detour, what the trip
    // costs on its own if nothing else were happening today)
    const baseOut = await fetchRoute(accessToken, home, destPoint);
    const baseBack = await fetchRoute(accessToken, destPoint, home);
    if (!baseOut || !baseBack) return json({ resolved: false, error: 'Could not compute base route' });
    const baseDistance = baseOut.distanceMeters + baseBack.distanceMeters;
    const baseDuration = baseOut.durationSeconds + baseBack.durationSeconds;

    let viaDistance = baseDistance;
    let viaDuration = baseDuration;

    // If a reference event has its own resolved location, compute the
    // "already going there anyway" via-route: home -> event -> destination
    // -> home, and the incremental cost is the difference from a plain
    // home -> event -> home trip (NOT from the base route above — the
    // spec's own example: "Dad's normal soccer route = 36 min, with Kroger
    // = 40 min, incremental = 4 min" compares against the reference trip,
    // not against a standalone grocery-only trip).
    let referenceOnlyDuration: number | null = null;
    let referenceOnlyDistance: number | null = null;
    if (referenceEventId) {
      const { data: event } = await supabase.from('calendar_events').select('location_id').eq('id', referenceEventId).maybeSingle();
      if (event?.location_id) {
        const { data: refLoc } = await supabase.from('locations').select('latitude, longitude').eq('id', event.location_id).maybeSingle();
        if (refLoc?.latitude && refLoc?.longitude) {
          const refPoint = `${refLoc.latitude},${refLoc.longitude}`;
          const refOut = await fetchRoute(accessToken, home, refPoint);
          const refBack = await fetchRoute(accessToken, refPoint, home);
          const refToVia = await fetchRoute(accessToken, refPoint, destPoint);
          const viaToHome = await fetchRoute(accessToken, destPoint, home);
          if (refOut && refBack && refToVia && viaToHome) {
            referenceOnlyDistance = refOut.distanceMeters + refBack.distanceMeters;
            referenceOnlyDuration = refOut.durationSeconds + refBack.durationSeconds;
            viaDistance = refOut.distanceMeters + refToVia.distanceMeters + viaToHome.distanceMeters;
            viaDuration = refOut.durationSeconds + refToVia.durationSeconds + viaToHome.durationSeconds;
          }
        }
      }
    }

    const compareBaseDistance = referenceOnlyDistance ?? baseDistance;
    const compareBaseDuration = referenceOnlyDuration ?? baseDuration;
    const incrementalDistance = Math.max(0, viaDistance - compareBaseDistance);
    const incrementalDuration = Math.max(0, viaDuration - compareBaseDuration);

    const { data: inserted, error: insErr } = await supabase
      .from('route_context')
      .insert({
        family_id: familyId,
        member_id: memberId,
        destination_location_id: destinationLocationId,
        reference_event_id: referenceEventId ?? null,
        base_distance_meters: compareBaseDistance,
        base_duration_seconds: compareBaseDuration,
        via_distance_meters: viaDistance,
        via_duration_seconds: viaDuration,
        incremental_distance_meters: incrementalDistance,
        incremental_duration_seconds: incrementalDuration,
        provider: 'apple_maps',
      })
      .select('id')
      .single();
    if (insErr) throw insErr;

    return json({
      resolved: true,
      routeContextId: inserted?.id ?? null,
      baseDurationSeconds: compareBaseDuration,
      viaDurationSeconds: viaDuration,
      incrementalDurationSeconds: incrementalDuration,
      incrementalDistanceMeters: incrementalDistance,
      usedReferenceEvent: !!referenceOnlyDuration,
    });

  } catch (err: any) {
    console.error('[maps-directions] fatal:', err);
    return json({ resolved: false, error: err.message ?? String(err) }, 500);
  }
});
