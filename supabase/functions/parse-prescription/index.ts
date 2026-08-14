// FamilyCube — Edge Function: parse-prescription
// Accepts a base64 prescription/vaccine-record image, parses it with AI,
// returns structured medication or vaccine fields. Image is NEVER stored.
//
// Deploy: supabase functions deploy parse-prescription

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';
import { getChainConfig, runChain } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Prompts ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a prescription and vaccine record parser for a family health app.

Given an image or PDF of a document, first decide if it contains ANY medical content:
- A medication prescription or doctor's Rx
- A vaccine / immunization record
- A pharmacy label or discharge summary with medications listed

If the document does NOT contain medical content (e.g. it is a receipt, ID, utility bill, food menu, random photo, homework, etc.), return ONLY:
{ "doc_type": "none", "reason": "one short sentence describing what the document actually is" }

If the document DOES contain medical content, decide if it is primarily a MEDICATION prescription, a VACCINE record, or both, then extract the key fields.

For a MEDICATION prescription, extract:
- name: drug/medication name (brand or generic)
- dosage: e.g. "10mg", "500mg/5ml"
- frequency: e.g. "Once daily", "Twice a day", "Every 8 hours"
- duration: e.g. "7 days", "30 days", "Ongoing"
- instructions: any special instructions (e.g. "Take with food", "Avoid sunlight")
- refills: number of refills authorized (integer or null)
- prescriber: doctor/provider name
- prescribed_date: "YYYY-MM-DD" format
- pharmacy: pharmacy name if printed
- notes: any other relevant notes

For a VACCINE record, extract:
- vaccine_name: full vaccine name (e.g. "Influenza", "MMR", "COVID-19 mRNA")
- manufacturer: brand/manufacturer name if visible
- lot_number: lot/batch number if visible
- administered_date: "YYYY-MM-DD"
- dose_number: e.g. 1, 2 (integer or null)
- total_doses: total doses in series if stated (integer or null)
- next_due_date: "YYYY-MM-DD" for next dose/booster if stated
- site: injection site if visible (e.g. "Left arm")
- administered_by: provider or clinic name

Return ONLY a valid JSON object with no markdown fences or commentary:
{
  "doc_type": "medication" | "vaccine" | "both" | "none",
  "reason": "only present when doc_type is none",
  "medication": { ... },
  "vaccine": { ... }
}

Include only the section(s) relevant to the document type.
If a field is not visible or not applicable, use null or an empty string.
If you cannot read the document clearly, still return your best attempt with lower-confidence fields left empty.`;

// ── Gemini vision call ─────────────────────────────────────────────────────────

interface ImageInput { imageBase64: string; mimeType: string; }

async function callGeminiVision(key: string, primary: ImageInput, extras: ImageInput[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  // Build image parts: primary + up to 2 extra pages
  const imageParts = [
    { inlineData: { mimeType: primary.mimeType, data: primary.imageBase64 } },
    ...extras.slice(0, 2).map(img => ({ inlineData: { mimeType: img.mimeType, data: img.imageBase64 } })),
  ];
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [
        ...imageParts,
        { text: 'Parse this prescription or vaccine record and return the structured JSON.' },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 15_000);

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
  const j = await res.json();
  const text: string = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini returned empty content');
  return text;
}

async function callGeminiFallback(key: string, imageData: string, mimeType: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageData } },
        { text: SYSTEM_PROMPT + '\n\nParse this prescription or vaccine record and return the structured JSON.' },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
  };

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 20_000);

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini-1.5 HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
  const j = await res.json();
  const text: string = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini-1.5 returned empty content');
  return text;
}

// ── JSON extraction ────────────────────────────────────────────────────────────

function extractJson(raw: string): Record<string, unknown> {
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find the JSON object within the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse JSON from AI response');
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg', extraPages = [] } = await req.json() as {
      imageBase64: string;
      mimeType?: string;
      extraPages?: Array<{ imageBase64: string; mimeType: string }>;
    };

    if (!imageBase64) return json({ error: 'imageBase64 is required' }, 400);

    const primary: ImageInput = { imageBase64, mimeType };
    const extras: ImageInput[] = extraPages.slice(0, 2); // max 2 extra = 3 total

    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY not configured' }, 500);

    let rawText = '';
    let usedModel = 'gemini-2.5-flash';

    try {
      rawText = await callGeminiVision(geminiKey, primary, extras);
    } catch (e1) {
      console.warn('[parse-prescription] gemini-2.5-flash failed, trying 1.5-flash:', e1);
      usedModel = 'gemini-1.5-flash';
      try {
        rawText = await callGeminiFallback(geminiKey, imageBase64, mimeType);
      } catch (e2) {
        console.error('[parse-prescription] all models failed:', e2);
        return json({ error: 'AI parsing failed. Please enter details manually.' }, 422);
      }
    }

    const parsed = extractJson(rawText);

    return json({ ...parsed, _model: usedModel });
  } catch (err: any) {
    console.error('[parse-prescription] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
