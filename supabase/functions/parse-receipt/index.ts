// PawBond — Edge Function: parse-receipt (Ultimate)
// Accepts a base64 receipt image, extracts pet-related line items with AI,
// returns structured expense entries. Receipt image is NEVER stored.
//
// Provider order: Gemini 2.5 Flash → DeepSeek Vision (fallback)
//
// Deploy: supabase functions deploy parse-receipt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requirePro, proRequiredResponse } from '../_shared/requirePro.ts';
import { fetchWithTimeout, VISION_TIMEOUT_MS, TEXT_TIMEOUT_MS } from '../_shared/fetchWithTimeout.ts';
import { getChainConfig } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Categories the app understands ───────────────────────────────────────────
const CATEGORIES = [
  'food', 'medication', 'vaccine', 'vet',
  'grooming', 'boarding', 'accessories', 'toys', 'recreation', 'insurance', 'other',
] as const;
type Category = typeof CATEGORIES[number];

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a receipt analysis AI for a pet care app.
Your job: look at a receipt image and extract ONLY pet-related line items.

Skip anything clearly for humans (human food from a grocery store, clothing, household items unrelated to pets).
When in doubt about a product (e.g. a pharmacy receipt), include it — the user can remove it.

For each pet-related line item return:
- description: short name of the item (e.g. "Royal Canin Adult", "Bordetella Vaccine", "Nail Trim")
- amount: the line item price as a number (not totals, taxes, or discounts)
- category: one of exactly: food, medication, vaccine, vet, grooming, boarding, accessories, toys, recreation, insurance, other
- confidence: "high" if clearly pet-related, "low" if uncertain

Category guide:
  food        → pet food, treats, wet/dry food, supplements, chews
  medication  → prescriptions, flea/tick treatment, dewormers, ear/eye drops, pharmacy items
  vaccine     → vaccinations, titers, rabies tag
  vet         → consultation fee, exam, surgery, lab tests, x-rays, dental, emergency visit
  grooming    → bath, haircut, nail trim, teeth brushing, ear cleaning, spa
  boarding    → boarding, daycare, kennel, pet sitting, overnight stay
  accessories → collar, leash, harness, bed, crate, carrier, bowl, clothing, litter box, cage
  toys        → toy, ball, chew toy, scratching post, puzzle feeder
  recreation  → training class, agility, park/swim session, dog walking
  insurance   → pet insurance premium, wellness plan payment
  other       → anything pet-related that doesn't fit above

Also extract from the receipt (if visible):
- receipt_date: "YYYY-MM-DD" (the purchase date on the receipt)
- merchant: store or clinic name

Return ONLY a valid JSON object — no markdown fences, no commentary:
{
  "items": [
    { "description": "string", "amount": 0.00, "category": "food", "confidence": "high" }
  ],
  "receipt_date": "YYYY-MM-DD",
  "merchant": "string"
}

If no pet-related items found, return: { "items": [], "receipt_date": null, "merchant": null }`;


// ── Gemini vision call ────────────────────────────────────────────────────────
async function callGemini(key: string, imageData: string, mimeType: string): Promise<string> {
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageData } },
        { text: 'Extract all pet-related expense items from this receipt.' },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  });

  // Try the two best vision models only — skip long fallback chain to avoid hangs
  const models = (await getChainConfig()).general_vision
    .filter(s => s.provider === 'gemini' || s.provider === 'custom').map(s => s.model);

  for (const model of models) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody },
        VISION_TIMEOUT_MS,
      );
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'timed out' : e.message;
      console.warn(`[gemini] ${model} fetch error: ${msg}`);
      continue;
    }
    if (res.status === 404) { console.log(`[gemini] ${model} not found, trying next…`); continue; }
    if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json() as any;
    if (j.error) throw new Error(`Gemini error: ${j.error.message}`);
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    console.log(`[gemini] ${model} succeeded — ${text.length} chars`);
    return text;
  }

  throw new Error('Gemini: no usable vision model responded in time');
}

// ── DeepSeek Vision fallback ──────────────────────────────────────────────────
async function callDeepSeekVision(key: string, imageData: string, mimeType: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-vl2',
        max_tokens: 1024,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } },
              { type: 'text', text: 'Extract all pet-related expense items from this receipt.' },
            ],
          },
        ],
      }),
    }, VISION_TIMEOUT_MS);
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'timed out' : e.message;
    throw new Error(`DeepSeek Vision: ${msg}`);
  }

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 300);
    throw new Error(`DeepSeek Vision ${res.status}: ${errText}`);
  }
  const j = await res.json() as any;
  if (j.error) throw new Error(`DeepSeek Vision error: ${j.error.message}`);
  const text = j.choices?.[0]?.message?.content ?? '';
  console.log(`[deepseek-vl2] succeeded — ${text.length} chars`);
  return text;
}

// ── JSON extraction ───────────────────────────────────────────────────────────
function parseResult(raw: string): { items: any[]; receipt_date: string | null; merchant: string | null } {
  // Strip markdown fences if model wrapped anyway
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);

  const items = (parsed.items ?? [])
    .filter((it: any) => it && typeof it.amount === 'number' && it.amount > 0)
    .map((it: any) => ({
      description: String(it.description ?? '').trim().slice(0, 120),
      amount: Math.round(Number(it.amount) * 100) / 100,
      category: CATEGORIES.includes(it.category) ? it.category as Category : 'other',
      confidence: it.confidence === 'low' ? 'low' : 'high',
    }));

  return {
    items,
    receipt_date: typeof parsed.receipt_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.receipt_date)
      ? parsed.receipt_date
      : null,
    merchant: typeof parsed.merchant === 'string' ? parsed.merchant.trim().slice(0, 80) : null,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const svcClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Pro gate
    const proCheck = await requirePro(svcClient, user.id);
    if (proCheck === 'free' || proCheck === 'expired') return proRequiredResponse();

    const body = await req.json();
    const { imageBase64, mimeType = 'image/jpeg' } = body as {
      imageBase64: string;
      mimeType?: string;
    };

    if (!imageBase64) return json({ error: 'imageBase64 required' }, 400);

    // Sanity: cap at ~8MB base64 (~6MB raw image)
    if (imageBase64.length > 11_000_000) {
      return json({ error: 'Image too large. Please use a smaller or compressed image.' }, 413);
    }

    const geminiKey   = Deno.env.get('GEMINI_API_KEY');
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');

    if (!geminiKey && !deepseekKey) {
      return json({ error: 'No AI provider configured. Set GEMINI_API_KEY or DEEPSEEK_API_KEY.' }, 503);
    }

    const tStart = Date.now();
    let rawText = '';
    let provider = '';
    const errors: string[] = [];

    // 1. Try Gemini 2.5 Flash
    if (geminiKey) {
      try {
        rawText = await callGemini(geminiKey, imageBase64, mimeType);
        provider = 'gemini';
      } catch (e: any) {
        console.warn('[parse-receipt] Gemini failed:', e.message);
        errors.push(`Gemini: ${e.message}`);
      }
    }

    // 2. Fallback to DeepSeek Vision
    if (!rawText && deepseekKey) {
      try {
        rawText = await callDeepSeekVision(deepseekKey, imageBase64, mimeType);
        provider = 'deepseek-vl2';
      } catch (e: any) {
        console.warn('[parse-receipt] DeepSeek Vision failed:', e.message);
        errors.push(`DeepSeek: ${e.message}`);
      }
    }

    if (!rawText) {
      return json({ error: 'All AI providers failed', details: errors }, 502);
    }

    let result: ReturnType<typeof parseResult>;
    try {
      result = parseResult(rawText);
    } catch (e: any) {
      console.error('[parse-receipt] JSON parse failed. Raw:', rawText.slice(0, 500));
      return json({ error: 'AI returned unparseable response', raw: rawText.slice(0, 300) }, 502);
    }

    console.log(`[parse-receipt] done in ${Date.now() - tStart}ms via ${provider} — ${result.items.length} items`);

    // Log API usage (non-fatal)
    try {
      await svcClient.from('api_usage_logs').insert({
        user_id: user.id,
        api_type: provider === 'gemini' ? 'gemini_receipt' : provider,
        subcategory: 'parse-receipt',
        tokens_used: null,
        created_at: new Date().toISOString(),
      });
    } catch { /* ignore */ }

    return json({ ...result, provider, elapsed_ms: Date.now() - tStart });

  } catch (err: any) {
    console.error('[parse-receipt] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
