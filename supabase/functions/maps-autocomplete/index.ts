// Apple Maps SearchAutoComplete proxy.
// GET ?q=dog+park&lat=33.15&lng=-96.82
// Returns [{ name, address, id }]

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function getAccessToken(privateKeyPem: string, keyId: string, teamId: string): Promise<string> {
  const pemBody = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyData   = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const b64url = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header  = b64url({ alg: 'ES256', kid: keyId });
  const payload = b64url({ iss: teamId, iat: now, exp: now + 1800 });
  const msg     = `${header}.${payload}`;
  const sig     = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(msg),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const authToken = `${msg}.${sigB64}`;

  const res = await fetch('https://maps-api.apple.com/v1/token', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const { accessToken } = await res.json();
  return accessToken;
}

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

  const privateKey = Deno.env.get('APPLE_MAPS_PRIVATE_KEY');
  const keyId      = Deno.env.get('APPLE_MAPS_KEY_ID');
  const teamId     = Deno.env.get('APPLE_MAPS_TEAM_ID');

  if (!privateKey || !keyId || !teamId) return json({ error: 'Apple Maps not configured' }, 503);

  try {
    const accessToken = await getAccessToken(privateKey, keyId, teamId);

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
