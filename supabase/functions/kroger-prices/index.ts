/**
 * kroger-prices — Supabase Edge Function
 *
 * POST { items: string[], zipCode?: string }
 * Returns { prices: { name, krogerPrice, unit, available, fallbackEstimate }[] }
 *
 * Flow:
 *  1. OAuth2 client_credentials → bearer token (cached in-process for 28 min)
 *  2. Find nearest Kroger location for zipCode
 *  3. Search each item → pick best match → return price
 *  4. Items with no Kroger match get an AI-estimated price fallback
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CLIENT_ID      = Deno.env.get('KROGER_CLIENT_ID')!;
const CLIENT_SECRET  = Deno.env.get('KROGER_CLIENT_SECRET')!;
const KROGER_BASE    = 'https://api-ce.kroger.com/v1';
const DEEPSEEK_KEY   = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
const GEMINI_KEY     = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Token cache (in-process, resets on cold start) ────────────────────────────
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const creds = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });

  if (!res.ok) throw new Error(`Kroger auth failed: ${res.status}`);
  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiry = Date.now() + (json.expires_in - 120) * 1000; // refresh 2 min early
  return cachedToken!;
}

// ── Find nearest Kroger location by zip ───────────────────────────────────────
async function getNearestLocationId(token: string, zipCode: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${KROGER_BASE}/locations?filter.zipCode.near=${zipCode}&filter.limit=1&filter.chain=KROGER`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.locationId ?? null;
  } catch {
    return null;
  }
}

// ── Strip recipe-style quantity prefix so Kroger can match product names ──────
// e.g. "2 tbsp low-sodium soy sauce" → "low-sodium soy sauce"
//      "500g chicken breast"          → "chicken breast"
//      "1/2 cup breadcrumbs"          → "breadcrumbs"
//      "cherry tomatoes"              → "cherry tomatoes" (unchanged)
const QTY_RE = /^[\d\/\.]+(g|kg|ml|l|oz|lb|lbs)?\s+(cups?|tbsps?|tsps?|cloves?|pieces?|fillets?|stalks?|bunches?|cans?|jars?|bags?|packs?|heads?|slices?|sprigs?|handfuls?)?\s*/i;

function cleanItemName(raw: string): string {
  // Remove leading fraction or number + optional unit + optional descriptor word
  const cleaned = raw
    .replace(/^\d+\s*\/\s*\d+\s+/, '') // leading fractions like "1/2 "
    .replace(/^\d+\.?\d*\s*(g|kg|ml|l|oz|lbs?|pounds?)\s+/i, '') // metric/imperial weight
    .replace(/^\d+\.?\d*\s+(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|cloves?|pieces?|fillets?|cans?|jars?|bags?|packs?|heads?|slices?|sprigs?|bunches?|stalks?)\s+/i, '')
    .replace(/^\d+\.?\d*\s+/, '') // plain leading number like "6 salmon fillets" → "salmon fillets"
    .replace(/\s*\(optional\)\s*/i, '') // "(optional)" suffix
    .trim();
  const result = cleaned || raw.trim();
  if (result !== raw.trim()) console.log(`[kroger-prices] cleanItemName: "${raw}" → "${result}"`);
  return result;
}

// ── Search a single item ──────────────────────────────────────────────────────
interface PriceResult {
  name: string;
  krogerPrice: number | null;
  unit: string | null;
  available: boolean;
  fallbackEstimate: number | null;
  // 'unrecognized' — Kroger had no match AND the AI explicitly judged this
  // isn't a real shopping-list item (gibberish/test text/not a product) —
  // distinct from 'estimate', which means a real item priced by guesswork.
  // The client renders this as a visible "couldn't recognize this item"
  // error, never a dollar amount.
  source: 'kroger' | 'estimate' | 'unrecognized' | 'unknown';
}

async function searchItem(token: string, locationId: string | null, itemName: string): Promise<PriceResult> {
  const base: PriceResult = { name: itemName, krogerPrice: null, unit: null, available: false, fallbackEstimate: null, source: 'unknown' };
  const searchTerm = cleanItemName(itemName);

  try {
    const params = new URLSearchParams({
      'filter.term':  searchTerm,
      'filter.limit': '5',
    });
    if (locationId) params.set('filter.locationId', locationId);

    const res = await fetch(`${KROGER_BASE}/products?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return { ...base, source: 'estimate' };

    const json = await res.json();
    const products: any[] = json.data ?? [];

    // Pick the best-matching product (has price info)
    const match = products.find(p => p.items?.[0]?.price?.regular);
    if (!match) {
      return { ...base, source: 'estimate' };
    }

    const item = match.items[0];
    const price: number = item.price.promo ?? item.price.regular;
    const unit: string  = item.size ?? item.soldBy ?? '';

    return { name: itemName, krogerPrice: price, unit, available: true, fallbackEstimate: null, source: 'kroger' };
  } catch {
    return { ...base, source: 'estimate' };
  }
}

// ── AI price estimation: DeepSeek → Gemini fallback ──────────────────────────
// Was forced to always invent a number for every item — no instruction to
// ever say "this isn't a real product," and a hard fallback of flat $2.99
// on any parse failure meant even a refusal silently became a fake price.
// Live-reported: garbage/test item names ("Ygg", "Hhh", "This is like a")
// got confident-looking Kroger-style dollar amounts, which is worse than
// no price at all — it reads as the app lying about what it knows. Each
// item now gets EITHER a price OR null (not a real grocery/household item),
// and a genuinely unparseable AI response returns null for everything
// instead of fabricating $2.99 across the board.
async function estimatePricesAI(items: string[]): Promise<Record<string, number | null>> {
  const prompt = `You are a strict shopping-list validator and price estimator. You will be given item names a family typed into a shopping list. Your ONLY job is to price REAL, PURCHASABLE shopping-list items across these categories: groceries/food including snacks and drinks, household staples/supplies (paper towels, soap, batteries, school supplies), and apparel/clothing (shirts, dresses, shoes, socks, jackets). Nothing outside these categories counts, ever.

For EACH item, return exactly one of:
- a realistic estimated US retail price in USD as a plain number (no $ sign) — ONLY if the text clearly names a specific real product sold in stores (Indian/ethnic groceries count as real items too), or
- null for EVERYTHING else, including: gibberish/keyboard mashing (e.g. "Ygg", "Hhh", "Grr"), sentence fragments or app UI text that leaked in by mistake (e.g. "This is like a"), single ambiguous letters, test strings, questions, instructions, or any text that isn't unambiguously naming a specific purchasable product.

Default to null whenever you have ANY doubt — a wrong price is worse than no price. Do not be creative or charitable in interpreting unclear text as a "possible" product.

Items: ${JSON.stringify(items)}

Return ONLY valid JSON, one entry per item, like: {"chicken breast": 7.99, "basmati rice": 4.99, "paper towels": 6.49, "Ygg": null, "This is like a": null}`;

  const tryDeepSeek = async (): Promise<string> => {
    if (!DEEPSEEK_KEY) throw new Error('no key');
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
    const d = await res.json();
    return d.choices?.[0]?.message?.content ?? '';
  };

  const tryGemini = async (): Promise<string> => {
    if (!GEMINI_KEY) throw new Error('no key');
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  };

  try {
    let text = '';
    try { text = await tryDeepSeek(); }
    catch { text = await tryGemini(); }

    const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    return parsed as Record<string, number | null>;
  } catch (e) {
    // Both providers failed or returned unparseable JSON — we genuinely
    // don't know the price for ANY of these items. Returning null (not a
    // fabricated flat $2.99) means every caller downstream correctly shows
    // "couldn't get a price" instead of a confident-looking wrong number.
    console.warn('[kroger-prices] estimatePricesAI: both providers failed/unparseable —', String(e));
    return Object.fromEntries(items.map(i => [i, null]));
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const reqId  = Math.random().toString(36).slice(2, 8).toUpperCase();
  const t0     = Date.now();
  const tag    = `[kroger-prices][${reqId}]`;

  const elapsed = () => `+${Date.now() - t0}ms`;

  try {
    const body = await req.json();
    const { items, zipCode, country = 'US' }: { items: string[]; zipCode?: string; country?: string } = body;

    console.log(`${tag} ── NEW REQUEST ──────────────────────────`);
    console.log(`${tag} items (${items?.length}):`, JSON.stringify(items));
    console.log(`${tag} country=${country}  zip=${zipCode ?? '(none)'}`);
    console.log(`${tag} CLIENT_ID present=${!!CLIENT_ID}  CLIENT_SECRET present=${!!CLIENT_SECRET}`);

    if (!items?.length) {
      console.log(`${tag} no items — returning empty ${elapsed()}`);
      return new Response(JSON.stringify({ prices: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isUS = country === 'US' || country === 'us';
    if (!isUS) {
      console.log(`${tag} non-US (${country}) — skipping Kroger, going AI estimates`);
      const aiPrices = await estimatePricesAI(items);
      console.log(`${tag} AI estimates (non-US) ${elapsed()}:`, JSON.stringify(aiPrices));
      const prices: PriceResult[] = items.map(name => {
        const aiPrice = aiPrices[name];
        return typeof aiPrice === 'number'
          ? { name, krogerPrice: null, unit: null, available: false, fallbackEstimate: aiPrice, source: 'estimate' as const }
          : { name, krogerPrice: null, unit: null, available: false, fallbackEstimate: null, source: 'unrecognized' as const };
      });
      return new Response(JSON.stringify({ prices, locationId: null, region: 'non-US' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const zip = zipCode ?? '90210';
    console.log(`${tag} US path — zip="${zip}" ${elapsed()}`);

    // Try Kroger — if auth fails, fall through to AI estimates
    let krogerResults: PriceResult[] = [];
    let krogerDebug = 'not attempted';
    try {
      console.log(`${tag} fetching Kroger OAuth token…`);
      const tokenRes = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=product.compact',
      });
      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        krogerDebug = `auth_failed: HTTP ${tokenRes.status} — ${errBody}`;
        console.warn(`${tag} Kroger auth FAILED: ${krogerDebug}`);
        throw new Error(krogerDebug);
      }
      const tokenJson = await tokenRes.json();
      cachedToken = tokenJson.access_token;
      tokenExpiry = Date.now() + (tokenJson.expires_in - 120) * 1000;
      const token = cachedToken!;
      console.log(`${tag} Kroger token OK expires_in=${tokenJson.expires_in} ${elapsed()}`);

      console.log(`${tag} looking up nearest Kroger for zip=${zip}…`);
      const locationId = await getNearestLocationId(token, zip);
      krogerDebug = locationId ? `location_found:${locationId}` : 'no_location_found';
      console.log(`${tag} locationId=${locationId ?? 'NOT FOUND'} ${elapsed()}`);

      const BATCH = 8;
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);
        console.log(`${tag} searching batch [${i}–${i + batch.length - 1}]:`, batch);
        const batchResults = await Promise.all(batch.map(item => searchItem(token, locationId, item)));
        batchResults.forEach(r => {
          if (r.source === 'kroger') {
            console.log(`${tag}   ✓ "${r.name}" → $${r.krogerPrice} ${r.unit ?? ''} (Kroger)`);
          } else {
            console.log(`${tag}   ✗ "${r.name}" → no Kroger price, will use AI estimate`);
          }
        });
        krogerResults.push(...batchResults);
      }

      const hits = krogerResults.filter(r => r.krogerPrice).length;
      krogerDebug = `ok: ${hits}/${krogerResults.length} priced`;
      console.log(`${tag} Kroger search done: ${hits}/${krogerResults.length} priced ${elapsed()}`);
    } catch (e) {
      if (!krogerDebug.startsWith('auth_failed')) krogerDebug = `exception: ${String(e)}`;
      console.warn(`${tag} Kroger API unavailable — falling back to AI only. Error:`, String(e));
    }

    // AI estimates for items Kroger didn't price (or all if Kroger failed)
    const needsEstimate = krogerResults.length > 0
      ? krogerResults.filter(r => !r.krogerPrice).map(r => r.name)
      : items;

    let aiPrices: Record<string, number | null> = {};
    if (needsEstimate.length > 0) {
      console.log(`${tag} requesting AI estimates for ${needsEstimate.length} items:`, needsEstimate);
      aiPrices = await estimatePricesAI(needsEstimate);
      console.log(`${tag} AI estimates ${elapsed()}:`, JSON.stringify(aiPrices));
    } else {
      console.log(`${tag} all items priced by Kroger — no AI estimate needed`);
    }

    // An item is a real priceable estimate only when the AI returned an
    // actual number for it. Anything else — the AI explicitly returned
    // null, or the item's key is simply missing from its response entirely
    // (a partial/malformed response shouldn't silently invent a price
    // either) — is 'unrecognized', never a fabricated dollar amount.
    const results: PriceResult[] = krogerResults.length > 0
      ? krogerResults.map(r => {
          if (r.krogerPrice) return r;
          const aiPrice = aiPrices[r.name];
          return typeof aiPrice === 'number'
            ? { ...r, fallbackEstimate: aiPrice, source: 'estimate' as const }
            : { ...r, fallbackEstimate: null, source: 'unrecognized' as const };
        })
      : items.map(name => {
          const aiPrice = aiPrices[name];
          return typeof aiPrice === 'number'
            ? { name, krogerPrice: null, unit: null, available: false, fallbackEstimate: aiPrice, source: 'estimate' as const }
            : { name, krogerPrice: null, unit: null, available: false, fallbackEstimate: null, source: 'unrecognized' as const };
        });

    console.log(`${tag} ── DONE (${elapsed()}) — returning ${results.length} prices ──`);
    results.forEach(r => console.log(`${tag}   "${r.name}" source=${r.source} price=${r.krogerPrice ?? r.fallbackEstimate}`));

    return new Response(JSON.stringify({ prices: results, locationId: null, krogerDebug }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`${tag} FATAL ERROR ${elapsed()}:`, String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
