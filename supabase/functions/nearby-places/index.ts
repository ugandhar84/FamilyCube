// PawBond — Edge Function: nearby-places
// Primary source: Yelp Fusion API (500 calls/day free, excellent US coverage, ratings included).
// Fallback: Overpass/OSM (if no YELP_API_KEY set — sparse in suburban areas).
// Cache keyed by 2dp lat/lng grid cell (~1.1 km). TTL = 7 days.
// Deploy: supabase functions deploy nearby-places
// Secret: supabase secrets set YELP_API_KEY=your_yelp_key

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DEFAULT_RADIUS_M = 8047;  // 5 miles default
const TTL_DAYS    = 7;
const PLACE_LIMIT = 20;     // max shown per category; cache stores up to 60

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReqBody {
  lat: number;
  lng: number;
  category?: string | null;
  pet?: { name: string; species: string; breed?: string | null; age_years?: number | null; weight_kg?: number | null } | null;
}

interface Place {
  id: string;
  name: string;
  category: string;
  emoji: string;
  subtitle: string | null;
  city: string | null;
  phone: string | null;
  is_24h: boolean;
  rating?: number | null;
  cta_label: string;
  cta_url: string | null;
  distance_km: number | null;
  eta_minutes?: number | null;
  image_url?: string | null;
  lat: number | null;
  lng: number | null;
}

// ── Category helpers ───────────────────────────────────────────────────────────

function categoryEmoji(cat: string): string {
  return ({ vet:'🏥', grooming:'✂️', food:'🦴', boarding:'🏠', training:'🎾', other:'📍' } as any)[cat] ?? '📍';
}

function categoryLabel(cat: string): string {
  return ({ vet:'Veterinary clinic', grooming:'Pet grooming', food:'Pet store', boarding:'Pet boarding', training:'Dog park / training', other:'Pet services' } as any)[cat] ?? 'Pet services';
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Apple Maps Server API ─────────────────────────────────────────────────────
// Used for iOS requests. JWT is generated per-request from the stored private key.
// Falls back to Yelp on error or empty results.

// Step 1: sign JWT (auth token) — no sub claim per Apple's official sample
// Step 2: exchange at /v1/token for a short-lived access token
// Step 3: use access token for all search calls
async function generateAppleToken(privateKeyPem: string, keyId: string, teamId: string, _mapsId: string): Promise<string> {
  const pemBody = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header  = b64url({ alg: 'ES256', kid: keyId });          // no typ
  const payload = b64url({ iss: teamId, iat: now, exp: now + 1800 }); // no sub
  const msg     = `${header}.${payload}`;
  const sig     = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(msg),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const authToken = `${msg}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://maps-api.apple.com/v1/token', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    console.error(`[APPLE] /v1/token ${tokenRes.status}: ${body}`);
    throw new Error(`Apple token exchange failed: ${tokenRes.status}`);
  }
  const { accessToken } = await tokenRes.json();
  console.log('[APPLE] access token obtained');
  return accessToken;
}

// Each entry: [search query, fallback category if poiCategory is unrecognised]
const APPLE_QUERIES: [string, string][] = [
  // Vets
  ['veterinarian',          'vet'],
  ['animal hospital',       'vet'],
  ['exotic animal vet',     'vet'],
  // Grooming
  ['pet grooming',          'grooming'],
  ['dog grooming salon',    'grooming'],
  // Pet stores — specific brands Apple indexes well
  ['PetSmart',              'food'],
  ['Petco',                 'food'],
  ['pet supply store',      'food'],
  ['pet store',             'food'],
  // Boarding / daycare
  ['dog boarding',          'boarding'],
  ['pet resort',            'boarding'],
  ['dog daycare',           'boarding'],
  ['Dogtopia',              'boarding'],
  ['Camp Bow Wow',          'boarding'],
  // Parks / training
  ['dog park',              'training'],
  ['bark park',             'training'],
  ['off leash dog area',    'training'],
  ['dog training',          'training'],
  // Shelter
  ['animal shelter',        'other'],
  ['humane society',        'other'],
];

async function fetchAppleMaps(lat: number, lng: number, token: string, radiusM: number): Promise<Place[]> {
  const allResults: Place[] = [];

  // Always search a fixed 15-mile (24 km) bounding box regardless of the user's chosen radius.
  // Apple re-ranks results based on box size, so a bigger user radius would otherwise push nearby
  // places out of the top-20. We filter by actual haversine distance below instead.
  const APPLE_SEARCH_RADIUS_M = Math.max(radiusM, 24_140); // min 15 miles
  const deg = APPLE_SEARCH_RADIUS_M / 111000;
  const searchRegion = `${lat + deg},${lng + deg},${lat - deg},${lng - deg}`;

  for (const [q, fallbackCat] of APPLE_QUERIES) {
    const url = new URL('https://maps-api.apple.com/v1/search');
    url.searchParams.set('q', q);
    url.searchParams.set('searchRegion', searchRegion);
    url.searchParams.set('limit', '20');
    url.searchParams.set('lang', 'en-US');
    url.searchParams.set('resultTypeFilter', 'Poi');

    console.log(`[APPLE] Searching: ${q}`);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[APPLE] ${res.status} for "${q}": ${body}`);
      if (res.status === 401) return []; // token issue — bail early
      continue;
    }

    const data = await res.json();
    const results = (data.results ?? []) as any[];
    console.log(`[APPLE] "${q}" → ${results.length} results`);
    allResults.push(...results.map((r: any) => appleResultToPlace(r, lat, lng, fallbackCat)));
  }

  // Deduplicate by name+coords; drop anything still outside radius (Apple can ignore circle)
  const maxKm = (radiusM / 1000) * 1.2;
  const seen = new Set<string>();
  return allResults.filter(p => {
    if (p.distance_km != null && p.distance_km > maxKm) return false;
    const key = `${p.name}|${p.lat?.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true; // keep all categories including 'other' (shelters etc)
  });
}

function appleResultToPlace(r: any, userLat: number, userLng: number, fallbackCat: string): Place {
  const elat = r.location?.latitude  ?? r.coordinate?.latitude  ?? null;
  const elng = r.location?.longitude ?? r.coordinate?.longitude ?? null;
  const dist = elat != null ? haversineKm(userLat, userLng, elat, elng) : null;
  const name = r.name ?? r.displayLines?.[0] ?? 'Unknown';
  // Name-based classification first, then poiCategory, then query fallback
  const cat  = appleCategoryToOurs(r.poiCategory ?? '', name, fallbackCat);
  return {
    id: `apple-${r.id ?? name}`,
    name,
    category: cat,
    emoji: categoryEmoji(cat),
    subtitle: null,
    city: r.formattedAddressLines?.[1] ?? null,
    phone: null, // Apple Maps Server API never returns phone — enriched by Foursquare below
    is_24h: false,
    rating: null,
    image_url: null,
    cta_label: 'Directions',
    cta_url: elat != null ? `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${elat},${elng}` : null,
    distance_km: dist,
    lat: elat,
    lng: elng,
  };
}

// Batch ETA call — one request returns drive times for all places at once.
async function addETAs(places: Place[], userLat: number, userLng: number, accessToken: string): Promise<Place[]> {
  const withCoords = places.filter(p => p.lat != null && p.lng != null);
  if (!withCoords.length) return places;
  try {
    const destinations = withCoords.map(p => `${p.lat},${p.lng}`).join('|');
    const url = new URL('https://maps-api.apple.com/v1/etas');
    url.searchParams.set('origin', `${userLat},${userLng}`);
    url.searchParams.set('destinations', destinations);
    url.searchParams.set('transportType', 'Automobile');
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) { console.warn(`[APPLE ETA] ${res.status}`); return places; }
    const data  = await res.json();
    const etas: any[] = data.destinations ?? [];
    console.log(`[APPLE ETA] Got ${etas.length} ETAs`);
    let etaIdx = 0;
    return places.map(p => {
      if (p.lat == null || p.lng == null) return p;
      const eta        = etas[etaIdx++];
      const eta_minutes = eta?.expectedTravelTime != null ? Math.round(eta.expectedTravelTime / 60) : null;
      return { ...p, eta_minutes };
    });
  } catch (e) {
    console.error('[APPLE ETA] error:', e);
    return places;
  }
}

// Enrich Apple Maps results with phone + photo from Foursquare (free tier: 1000 req/day).
// Matches each place by name + coords with a 200m radius search, grabs tel + first photo.
async function enrichAppleWithFoursquare(places: Place[], fsqKey: string): Promise<Place[]> {
  return Promise.all(places.map(async (p) => {
    if (!p.lat || !p.lng) return p;
    try {
      const url = new URL('https://api.foursquare.com/v3/places/search');
      url.searchParams.set('query', p.name);
      url.searchParams.set('ll', `${p.lat},${p.lng}`);
      url.searchParams.set('radius', '200');
      url.searchParams.set('limit', '1');
      url.searchParams.set('fields', 'fsq_id,tel,photos');
      const res  = await fetch(url.toString(), { headers: { Authorization: fsqKey } });
      if (!res.ok) return p;
      const data = await res.json();
      const hit  = data.results?.[0];
      if (!hit) return p;
      const phone     = hit.tel   ? hit.tel.replace(/[\s\-().+]/g, '') : null;
      const photo_url = hit.photos?.[0]
        ? `${hit.photos[0].prefix}800x600${hit.photos[0].suffix}`
        : null;
      return { ...p, phone: phone ?? p.phone, image_url: photo_url ?? p.image_url };
    } catch {
      return p;
    }
  }));
}


// Classify by place name when poiCategory is generic (Apple returns "Store" for nearly everything)
function classifyByName(name: string): string | null {
  const n = name.toLowerCase();
  // Vet first — highest confidence
  if (n.includes('vet') || n.includes('animal hospital') || n.includes('animal clinic') ||
      n.includes('pet hospital') || n.includes('veterinar')) return 'vet';
  // Boarding / resort — before grooming so "Resort & Spa" goes to boarding
  if (n.includes('resort') || n.includes('retreat') || n.includes('boarding') ||
      n.includes('kennel') || n.includes('daycare') || n.includes('day care') ||
      n.includes('suites') || n.includes('lodge') || n.includes('oasis') ||
      n.includes('dogtopia') || n.includes('camp bow wow') || n.includes('k9 resort') ||
      n.includes('petsuites') || n.includes('canine republic')) return 'boarding';
  // Grooming / wash
  if (n.includes('groomin') || n.includes('groomer') || n.includes('salon') ||
      n.includes('barber') || n.includes('wash') || n.includes('splash') ||
      n.includes('spa') || n.includes('paw bar') || n.includes('petbar') ||
      n.includes('paw spa') || n.includes('groom')) return 'grooming';
  // Pet stores
  if (n.includes('petsmart') || n.includes('petco') || n.includes('petland') ||
      n.includes('pet supplies') || n.includes('pet supply') || n.includes('hollywood feed') ||
      n.includes('pet wants') || n.includes('pet store') || n.includes('pet shop') ||
      n.includes('petbar') || n.includes('feed store') || n.includes('aquarium')) return 'food';
  // Parks / training
  if (n.includes('dog park') || n.includes('bark park') || n.includes('off leash') ||
      n.includes('agility') || n.includes('dog training')) return 'training';
  // Shelter
  if (n.includes('shelter') || n.includes('rescue') || n.includes('adoption') ||
      n.includes('humane')) return 'other';
  return null; // unknown
}

function appleCategoryToOurs(poiCategory: string, name = '', fallback = 'other'): string {
  // 1. Try name-based classification first — more reliable than Apple's generic "Store" tag
  const byName = classifyByName(name);
  if (byName) return byName;

  // 2. Fall back to poiCategory patterns
  const c = poiCategory.toLowerCase();
  if (c.includes('vet') || c.includes('animal hospital') || c.includes('exotic') || c.includes('wildlife')) return 'vet';
  if (c.includes('groom') || c.includes('salon') || c.includes('spa') || c.includes('barber')) return 'grooming';
  if (c.includes('pet store') || c.includes('pet supply') || c.includes('pet shop') || c.includes('aquarium') || c.includes('fish store')) return 'food';
  if (c.includes('boarding') || c.includes('kennel') || c.includes('daycare') || c.includes('day care') || c.includes('sitting')) return 'boarding';
  if (c.includes('training') || c.includes('dog park') || c.includes('park') || c.includes('recreation')) return 'training';
  if (c.includes('shelter') || c.includes('rescue') || c.includes('adoption')) return 'other';
  if (c.includes('pet') || c.includes('animal')) return fallback;
  return fallback; // unknown — trust the search query
}

// ── Yelp Fusion API ───────────────────────────────────────────────────────────
// Free: 500 calls/day — yelp.com/developers → Create App → copy API Key
// Categories: https://docs.developer.yelp.com/docs/resources-categories

const YELP_CATEGORIES = 'veterinarians,animalshelters,petstore,groomer,pet_sitting,kennels,dogparks,petboarding';

function yelpAliasToOurs(aliases: string[]): string {
  const s = aliases.join(',');
  // vet check first — alias is 'vet' or 'veterinarians' or 'animalshelters'
  if (s.includes('vet') || s.includes('animalshelter')) return 'vet';
  // training / dog parks
  if (s.includes('dogpark') || s.includes('pet_training')) return 'training';
  // grooming salons (pure groomer, no vet)
  if (s.includes('groo')) return 'grooming';
  // boarding / sitting / kennels
  if (s.includes('petboarding') || s.includes('kennel') || s.includes('pet_sitting') || s.includes('dogwalker') || s.includes('housesit')) return 'boarding';
  // pet stores / food
  if (s.includes('petstore') || s.includes('pet_supply') || s.includes('livestock')) return 'food';
  return 'other';
}

function mapsUrlFor(platform: string, name: string, elat: number, elng: number): string {
  return platform === 'android'
    ? `geo:${elat},${elng}?q=${encodeURIComponent(name)}`
    : `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${elat},${elng}`;
}

async function fetchYelp(lat: number, lng: number, apiKey: string, radiusM: number, platform: string): Promise<Place[]> {
  const url = new URL('https://api.yelp.com/v3/businesses/search');
  url.searchParams.set('latitude',  String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('radius',    String(radiusM));
  url.searchParams.set('categories', YELP_CATEGORIES);
  url.searchParams.set('limit',     '50');
  url.searchParams.set('sort_by',   'distance');

  console.log(`[YELP] Requesting: ${url.toString()}`);
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    console.log(`[YELP] HTTP status: ${res.status}`);
    if (res.status === 429) {
      console.warn('[YELP] Rate limited — will use stale cache or OSM fallback');
      return null as any; // sentinel: rate limited
    }
    if (!res.ok) {
      console.error(`[YELP] Error: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    const raw: any[] = data.businesses ?? [];
    console.log(`[YELP] Raw count: ${raw.length}`);
    raw.forEach((b, i) => {
      const aliases = (b.categories ?? []).map((c: any) => c.alias).join(', ');
      console.log(`[YELP][${i}] "${b.name}" | ${aliases} | ${b.distance?.toFixed(0)}m | ☆${b.rating}`);
    });

    const seen = new Set<string>();
    const places = raw.map((b: any): Place | null => {
      if (!b.name) return null;
      const aliases = (b.categories ?? []).map((c: any) => c.alias as string);
      const cat  = yelpAliasToOurs(aliases);
      const key  = `${b.name}|${cat}`;
      if (seen.has(key)) return null;
      seen.add(key);

      const elat  = b.coordinates?.latitude  ?? null;
      const elng  = b.coordinates?.longitude ?? null;
      const dist  = b.distance != null ? b.distance / 1000 : null;
      const phone = b.phone ? b.phone.replace(/[\s\-().+]/g, '') : null;
      const mapsUrl = elat != null ? mapsUrlFor(platform, b.name, elat, elng) : null;

      return {
        id: `yelp-${b.id}`,
        name: b.name,
        category: cat,
        emoji: categoryEmoji(cat),
        subtitle: null,
        city: b.location?.city ?? null,
        phone,
        is_24h: false,
        rating: b.rating ?? null,
        cta_label: 'Directions',
        cta_url: mapsUrl,
        distance_km: dist,
        image_url: b.image_url ?? null,
        lat: elat,
        lng: elng,
      };
    }).filter((p): p is Place => p !== null);

    console.log(`[YELP] After map: ${places.length} places`);
    places.forEach(p => console.log(`[YELP]  → "${p.name}" cat=${p.category} dist=${p.distance_km?.toFixed(2)}km`));
    return places;
  } catch (e) {
    console.error('[YELP] Fetch exception:', e);
    return [];
  }
}

// ── Overpass / OSM fallback ────────────────────────────────────────────────────
// Only used when no YELP_API_KEY is set. Coverage is poor in new suburbs.

const OSM_TAGS: [string, string, string][] = [
  ['amenity', 'veterinary',        'vet'],
  ['amenity', 'animal_hospital',   'vet'],
  ['amenity', 'animal_shelter',    'vet'],
  ['shop',    'veterinary',        'vet'],
  ['shop',    'pet_grooming',      'grooming'],
  ['shop',    'grooming',          'grooming'],
  ['amenity', 'pet_grooming',      'grooming'],
  ['shop',    'pet',               'food'],
  ['shop',    'pet_food',          'food'],
  ['shop',    'pet_supply',        'food'],
  ['amenity', 'animal_boarding',   'boarding'],
  ['amenity', 'dog_daycare',       'boarding'],
  ['leisure', 'dog_park',          'training'],
  ['amenity', 'animal_training',   'training'],
];

function osmTagsToCategory(tags: Record<string, string>): string {
  for (const [k, v, cat] of OSM_TAGS) { if (tags[k] === v) return cat; }
  return 'other';
}

function buildOverpassQuery(lat: number, lng: number, radiusM: number): string {
  const filters = OSM_TAGS.map(([k, v]) =>
    `nwr["${k}"="${v}"](around:${radiusM},${lat},${lng});`
  ).join('\n  ');
  return `[out:json][timeout:25];\n(\n  ${filters}\n);\nout center 60;`;
}

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchOverpass(query: string): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const data = await res.json();
      clearTimeout(timer);
      return data.elements ?? [];
    } catch (e: any) {
      if (e?.name === 'AbortError') break;
    }
  }
  clearTimeout(timer);
  return [];
}

async function fetchOSMPlaces(lat: number, lng: number, radiusM: number, platform: string): Promise<Place[]> {
  const elements = await fetchOverpass(buildOverpassQuery(lat, lng, radiusM));
  const seen = new Set<string>();
  return elements
    .map((el: any): Place | null => {
      const tags: Record<string, string> = el.tags ?? {};
      if (!tags.name) return null;
      const elat = el.lat ?? el.center?.lat ?? null;
      const elng = el.lon ?? el.center?.lon ?? null;
      const cat  = osmTagsToCategory(tags);
      const key  = `${tags.name}|${cat}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const dist = elat != null ? haversineKm(lat, lng, elat, elng) : null;
      const rawPhone = tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? null;
      const phone = rawPhone ? rawPhone.replace(/[\s\-().]/g, '') : null;
      const mapsUrl = elat != null ? mapsUrlFor(platform, tags.name, elat, elng) : null;
      return {
        id: `osm-${el.id}`,
        name: tags.name,
        category: cat,
        emoji: categoryEmoji(cat),
        subtitle: null,
        city: tags['addr:city'] ?? tags['addr:suburb'] ?? null,
        phone,
        is_24h: tags.opening_hours === '24/7',
        cta_label: phone ? 'Call' : 'Directions',
        cta_url: phone ? `tel:${phone}` : mapsUrl,
        distance_km: dist,
        lat: elat,
        lng: elng,
      };
    })
    .filter((p): p is Place => p !== null)
    .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
    .slice(0, 60);
}

// ── DeepSeek enrichment ────────────────────────────────────────────────────────

async function enrichWithDeepSeek(places: Place[], pet: ReqBody['pet'], apiKey: string): Promise<Place[]> {
  if (!places.length || !pet) return places;
  const petDesc = [
    pet.name, pet.species, pet.breed,
    pet.age_years != null ? `${Math.round(pet.age_years)} yrs` : null,
    pet.weight_kg != null ? `${pet.weight_kg} kg` : null,
  ].filter(Boolean).join(', ');

  const list = places.map((p, i) =>
    `${i+1}. [${p.id}] ${p.name} — ${p.category}${p.distance_km != null ? `, ${p.distance_km.toFixed(1)}km` : ''}`
  ).join('\n');

  const prompt = `Pet assistant. Write one friendly subtitle (max 10 words) per place relevant to this pet.

Pet: ${petDesc}

Places:
${list}

Return ONLY a JSON array: [{"id":"<id>","subtitle":"<text>"},...]`;

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 600 }),
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? '[]';
    const enriched: { id: string; subtitle: string }[] = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const map = Object.fromEntries(enriched.map(e => [e.id, e.subtitle]));
    return places.map(p => ({ ...p, subtitle: map[p.id] ?? p.subtitle }));
  } catch {
    return places;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Auth
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const { lat, lng, category = null, pet = null, radius_m = DEFAULT_RADIUS_M, platform = 'ios' }: ReqBody & { radius_m?: number; platform?: string } = await req.json();
  if (lat == null || lng == null) return json({ error: 'lat/lng required' }, 400);

  const RADIUS_M = Math.min(Math.max(radius_m, 1000), 80000); // clamp 1km–80km

  // Cache by location only — never by radius. We always fetch a fixed wide area (15 miles)
  // and filter by the requested radius at serve time. This means switching between 3-mile
  // and 5-mile views always hits the same cache entry and returns consistent results.
  const areaLat = Math.round(lat * 100) / 100;
  const areaLng = Math.round(lng * 100) / 100;
  const areaKey = `${areaLat},${areaLng}`;          // no radius bucket
  const cutoff  = new Date(Date.now() - TTL_DAYS * 86400_000).toISOString();

  console.log(`[NEARBY] Request: lat=${lat} lng=${lng} areaKey=${areaKey} category=${category}`);

  // ── 1. Cache check ───────────────────────────────────────────────────────────
  const { data: cached, error: cacheErr } = await supabase
    .from('nearby_places')
    .select('places, enriched, refreshed_at')
    .eq('area_key', areaKey)
    .gte('refreshed_at', cutoff)
    .maybeSingle();

  console.log(`[CACHE] hit=${!!cached} enriched=${cached?.enriched} count=${Array.isArray(cached?.places) ? cached.places.length : 0} err=${cacheErr?.message ?? 'none'}`);

  // Helper: filter by requested radius + optional category, sort by distance
  const applyFilters = (all: Place[]) => {
    const maxKm = RADIUS_M / 1000;
    return all
      .filter(p => !category || p.category === category)
      .filter(p => p.distance_km == null || p.distance_km <= maxKm)
      .sort((a, b) => (a.distance_km ?? 99) - (b.distance_km ?? 99))
      .slice(0, PLACE_LIMIT);
  };

  if (cached?.places && Array.isArray(cached.places) && cached.places.length > 0) {
    const all = cached.places as Place[];

    if (cached.enriched) {
      return json({ places: applyFilters(all), source: 'cache' });
    }

    // Cached but not enriched — enrich now
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    const toEnrich = all.slice(0, 30);
    const enriched = deepseekKey
      ? await enrichWithDeepSeek(toEnrich, pet, deepseekKey)
      : toEnrich.map(p => ({ ...p, subtitle: categoryLabel(p.category) }));
    const final = [...enriched, ...all.slice(30).map(p => ({ ...p, subtitle: categoryLabel(p.category) }))];

    await supabase.from('nearby_places').update({ places: final, enriched: true }).eq('area_key', areaKey);

    return json({ places: applyFilters(final), source: 'cache_enriched' });
  }

  // ── 2. Fetch live places ─────────────────────────────────────────────────────
  // iOS:     Apple Maps (search) + ETAs → OSM fills gaps → Yelp last resort
  // Android: OSM → Yelp last resort
  const applePrivateKey = Deno.env.get('APPLE_MAPS_PRIVATE_KEY');
  const appleKeyId      = Deno.env.get('APPLE_MAPS_KEY_ID');
  const appleTeamId     = Deno.env.get('APPLE_MAPS_TEAM_ID');
  const appleMapsId     = Deno.env.get('APPLE_MAPS_ID');
  const appleReady      = !!(applePrivateKey && appleKeyId && appleTeamId && appleMapsId);
  const yelpKey         = Deno.env.get('YELP_API_KEY');
  console.log(`[NEARBY] platform=${platform} apple_ready=${appleReady} yelp_key=${!!yelpKey}`);
  let raw: Place[] = [];
  let usedApple = false;
  let usedOSM = false;
  let usedYelp = false;
  let yelpRateLimited = false;

  // Step 1: Apple Maps (iOS only)
  let appleToken: string | null = null;
  if (platform === 'ios' && appleReady) {
    try {
      appleToken = await generateAppleToken(applePrivateKey!, appleKeyId!, appleTeamId!, appleMapsId!);
      raw = await fetchAppleMaps(lat, lng, appleToken, RADIUS_M);
      if (raw.length) {
        usedApple = true;
        raw = await addETAs(raw, lat, lng, appleToken);
        const fsqKey = Deno.env.get('FOURSQUARE_API_KEY');
        if (fsqKey) {
          console.log('[NEARBY] Enriching Apple results with Foursquare phone+photo...');
          raw = await enrichAppleWithFoursquare(raw, fsqKey);
        }
      }
      console.log(`[NEARBY] Apple Maps returned: ${raw.length} places`);
    } catch (e) {
      console.error('[NEARBY] Apple token generation failed:', e);
    }
  }

  // Step 2: OSM runs in parallel to fill categories Apple misses (parks, pet stores)
  // Also sole source for Android.
  {
    const osmResults = await fetchOSMPlaces(lat, lng, RADIUS_M, platform);
    if (osmResults.length) {
      usedOSM = true;
      console.log(`[NEARBY] OSM returned: ${osmResults.length} places`);
      if (!raw.length) {
        raw = osmResults;
      } else {
        // Merge: add OSM places whose category is not already well-covered by Apple,
        // or that don't have a near-duplicate (within ~300m) already in Apple results.
        const appleSet = new Set(raw.map(p => `${p.name.toLowerCase().slice(0, 6)}`));
        const novel = osmResults.filter(o => {
          if (appleSet.has(o.name.toLowerCase().slice(0, 6))) return false;
          // Check distance to nearest Apple result
          return !raw.some(a =>
            a.lat != null && o.lat != null &&
            haversineKm(a.lat!, a.lng!, o.lat!, o.lng!) < 0.3
          );
        });
        console.log(`[NEARBY] OSM added ${novel.length} novel places to Apple results`);
        raw = [...raw, ...novel];
        // Re-add ETAs for OSM places that now lack them (iOS only)
        if (appleToken && novel.length) {
          raw = await addETAs(raw, lat, lng, appleToken);
        }
      }
    }
  }

  // Step 3: Yelp — last resort when both Apple and OSM returned nothing
  if (!raw.length && yelpKey) {
    const yelpResult = await fetchYelp(lat, lng, yelpKey, RADIUS_M, platform);
    if (yelpResult === null) {
      yelpRateLimited = true;
    } else {
      raw = yelpResult;
      if (raw.length) usedYelp = true;
      console.log(`[NEARBY] Yelp returned: ${raw.length} places`);
    }
  }

  // Yelp rate limited — serve stale cache silently (ignore TTL)
  if (yelpRateLimited) {
    const { data: stale } = await supabase
      .from('nearby_places')
      .select('places')
      .eq('area_key', areaKey)
      .maybeSingle();
    if (stale?.places && Array.isArray(stale.places) && stale.places.length > 0) {
      console.log(`[NEARBY] Rate limited — serving stale cache (${stale.places.length} places)`);
      return json({ places: applyFilters(stale.places as Place[]), source: 'stale_cache' });
    }
  }

  // ── 3. Enrich top 30 with DeepSeek ──────────────────────────────────────────
  const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
  const toEnrich = raw.slice(0, 30);
  const rest     = raw.slice(30).map(p => ({ ...p, subtitle: categoryLabel(p.category) }));
  const enrichedTop = toEnrich.length > 0 && deepseekKey
    ? await enrichWithDeepSeek(toEnrich, pet, deepseekKey)
    : toEnrich.map(p => ({ ...p, subtitle: categoryLabel(p.category) }));
  const enriched = [...enrichedTop, ...rest];

  // ── 4. Store to cache (all places, no radius filter — we filter at serve time)
  if (enriched.length > 0) {
    await supabase.from('nearby_places').upsert({
      area_key: areaKey,
      lat_center: areaLat,
      lng_center: areaLng,
      radius_m: 24140, // stored radius = our fixed 15-mile fetch window
      places: enriched,
      enriched: !!deepseekKey,
      raw_count: enriched.length,
      refreshed_at: new Date().toISOString(),
    }, { onConflict: 'area_key' });
  }

  // ── 5. Return results filtered to requested radius ───────────────────────────
  const filtered = applyFilters(enriched);
  const apiSource = usedApple ? 'apple' : usedOSM ? 'osm' : usedYelp ? 'yelp' : 'none';
  console.log(`[NEARBY] ✅ source=${apiSource} platform=${platform} total_cached=${enriched.length} returned=${filtered.length} radius_km=${(RADIUS_M/1000).toFixed(1)}`);

  // Log API call (Yelp is paid per call; OSM is free but track volume)
  try {
    const sbLog = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await sbLog.from('api_usage_logs').insert({
      user_id: user.id,
      api_type: yelpKey ? 'nearby_yelp' : 'nearby_osm',
      subcategory: category ?? 'all',
      success: true,
      metadata: { area_key: areaKey, result_count: filtered.length },
    });
  } catch { /* non-fatal */ }

  return json({ places: filtered, source: apiSource });
});
