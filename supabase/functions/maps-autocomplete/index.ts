// Apple Maps SearchAutoComplete proxy.
// GET ?q=dog+park&lat=33.15&lng=-96.82
// Returns [{ name, address, id }]

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAppleMapsAccessToken, getAppleMapsCredentials } from '../_shared/appleMapsAuth.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Auth check
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase   = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const q   = url.searchParams.get('q')?.trim() ?? '';
  const lat = parseFloat(url.searchParams.get('lat') ?? '');
  const lng = parseFloat(url.searchParams.get('lng') ?? '');

  if (!q || q.length < 2) return json({ suggestions: [] });

  const creds = getAppleMapsCredentials();
  if (!creds) return json({ error: 'Apple Maps not configured' }, 503);

  try {
    const accessToken = await getAppleMapsAccessToken(creds.privateKey, creds.keyId, creds.teamId);

    const acUrl = new URL('https://maps-api.apple.com/v1/searchAutoComplete');
    acUrl.searchParams.set('q', q);
    acUrl.searchParams.set('lang', 'en-US');
    acUrl.searchParams.set('resultTypeFilter', 'Poi,Address');
    if (!isNaN(lat) && !isNaN(lng)) {
      acUrl.searchParams.set('searchLocation', `${lat},${lng}`);
    }

    const res  = await fetch(acUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return json({ suggestions: [] });

    const data = await res.json();
    const suggestions = (data.results ?? []).slice(0, 6).map((r: any) => ({
      id:      r.id ?? r.completionUrl ?? Math.random().toString(),
      name:    r.displayLines?.[0] ?? r.structuredAddress?.fullThoroughfare ?? r.completionUrl ?? '',
      address: r.displayLines?.[1] ?? r.structuredAddress?.locality ?? '',
    })).filter((s: any) => s.name);

    return json({ suggestions });
  } catch (e: any) {
    console.error('[AUTOCOMPLETE]', e);
    return json({ suggestions: [] });
  }
});
