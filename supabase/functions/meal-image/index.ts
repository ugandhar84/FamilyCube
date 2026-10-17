// FamilyCube — Edge Function: meal-image
// Returns one food photo URL for a meal name, searched on Unsplash with a SERVER-side key (UNSPLASH_ACCESS_KEY secret),
// so the key is never shipped inside the app. Requires a signed-in caller (default JWT verification).
// Set the key once:  supabase secrets set UNSPLASH_ACCESS_KEY=<your Unsplash access key>
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!key) return json({ url: null, reason: 'not_configured' });
  try {
    const { query } = await req.json() as { query?: string };
    const q = String(query ?? '').trim().slice(0, 80);
    if (!q) return json({ url: null, reason: 'empty' }, 400);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q + ' food')}&per_page=1&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` } },
    );
    if (!res.ok) return json({ url: null, reason: `unsplash_${res.status}` });
    const data = await res.json();
    return json({ url: data?.results?.[0]?.urls?.small ?? null });
  } catch (e) {
    return json({ url: null, reason: String((e as Error)?.message ?? e) });
  }
});
