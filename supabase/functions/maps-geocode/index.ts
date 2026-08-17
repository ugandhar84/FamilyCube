// FamilyCube — Edge Function: maps-geocode
// Responsibility Engine Phase 5 (part 1/2): real address/place -> lat/lng
// resolution via Apple MapKit JS Server's /v1/geocode endpoint — the same
// auth (APPLE_MAPS_PRIVATE_KEY/KEY_ID/TEAM_ID) as maps-autocomplete, a
// different endpoint that actually returns coordinates (autocomplete does
// not). This is what lets `locations.latitude/longitude` be populated with
// real data instead of staying null forever, which is what blocked
// maps-directions (below) from having two real points to route between.
//
// POST { query: string, locationId?: string }
// locationId, if given, gets its latitude/longitude/address updated in
// place after a successful resolution — the caller doesn't need a second
// round trip to persist the result.
//
// Deploy: supabase functions deploy maps-geocode
// Secrets: APPLE_MAPS_PRIVATE_KEY, APPLE_MAPS_KEY_ID, APPLE_MAPS_TEAM_ID,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (only needed if locationId is passed)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAppleMapsAccessToken, getAppleMapsCredentials } from '../_shared/appleMapsAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { query, locationId } = body as { query?: string; locationId?: string };
    if (!query?.trim()) return json({ error: 'query is required' }, 400);

    const creds = getAppleMapsCredentials();
    if (!creds) return json({ error: 'Apple Maps not configured' }, 503);

    const accessToken = await getAppleMapsAccessToken(creds.privateKey, creds.keyId, creds.teamId);

    const geoUrl = new URL('https://maps-api.apple.com/v1/geocode');
    geoUrl.searchParams.set('q', query.trim());
    geoUrl.searchParams.set('lang', 'en-US');

    const res = await fetch(geoUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return json({ resolved: false, error: `Apple geocode ${res.status}` });

    const data = await res.json();
    const first = (data.results ?? [])[0];
    if (!first?.coordinate) return json({ resolved: false, error: 'No match found' });

    const resolved = {
      latitude: first.coordinate.latitude,
      longitude: first.coordinate.longitude,
      formattedAddress: first.formattedAddressLines?.join(', ') ?? first.structuredAddress?.fullThoroughfare ?? query,
      name: first.name ?? query,
    };

    if (locationId) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { error: updateErr } = await supabase
        .from('locations')
        .update({
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          address: resolved.formattedAddress,
        })
        .eq('id', locationId);
      if (updateErr) console.warn('[maps-geocode] failed to persist to locations:', updateErr.message);
    }

    return json({ resolved: true, ...resolved, locationId: locationId ?? null });

  } catch (err: any) {
    console.error('[maps-geocode] fatal:', err);
    return json({ resolved: false, error: err.message ?? String(err) }, 500);
  }
});
