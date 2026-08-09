// PawBond — Edge Function: parse-insurance-doc
// Takes a single photo/scan of a pet insurance card or policy document and
// extracts the key fields for the wallet-card summary. Gemini vision only —
// no DeepSeek/OCR fallback chain like parse-health-record, since this is
// always a single image (not a multi-page medical record).
//
// Deploy: supabase functions deploy parse-insurance-doc

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { fetchWithTimeout, VISION_TIMEOUT_MS } from '../_shared/fetchWithTimeout.ts';
import { getChainConfig } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM_PROMPT = `You are an assistant that reads pet insurance cards and policy documents.

Extract ONLY what is clearly printed on the document. Return ONLY a valid JSON object — no markdown, no commentary.

JSON schema (omit any field you cannot find — do not guess or invent values):
{
  "provider": "Insurance company name, e.g. 'Healthy Paws'",
  "policy_number": "Policy/member ID as printed",
  "coverage_type": "e.g. 'Accident & Illness', 'Wellness', 'Accident Only'",
  "pet_name": "Pet's name if printed on the card",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD — renewal or expiration date",
  "premium_amount": 42.50,
  "deductible": 250,
  "reimbursement_percent": 90,
  "annual_limit": 5000,
  "claims_phone": "Claims/customer service phone number as printed",
  "summary": "ONE short sentence describing the coverage — plain English, ≤20 words"
}

Rules:
- Numbers are plain numerics, no currency symbols or commas (e.g. 250, not "$250.00").
- reimbursement_percent is just the number (e.g. 90 for "90%").
- Dates must be YYYY-MM-DD. If only a month/year is printed, use the 1st of that month.
- Do NOT invent a field that isn't legible or present — omit it instead.
- If the image isn't an insurance document at all, return {} with no other fields.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await (await import('https://esm.sh/@supabase/supabase-js@2'))
      .createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      .auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) throw new Error('GEMINI_API_KEY not set in Supabase Edge Function Secrets.');

    const body = await req.json() as { image_base64: string; mime: string };
    if (!body.image_base64) throw new Error('image_base64 is required');
    // Gemini reads PDFs natively via the same inlineData part as images —
    // no separate handling needed for body.mime === 'application/pdf'.

    const reqBody = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: body.mime || 'image/jpeg', data: body.image_base64 } },
          { text: 'Extract the insurance details from this document.' },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    });

    const models = (await getChainConfig()).general_vision
      .filter(s => s.provider === 'gemini' || s.provider === 'custom').map(s => s.model);
    let rawText = '';
    let usedModel = '';
    for (const model of models) {
      const r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody },
        VISION_TIMEOUT_MS,
      );
      if (r.status === 404) { console.log(`[insurance] ${model} not found, trying next`); continue; }
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json() as any;
      if (j.error) throw new Error(`Gemini error: ${j.error.message}`);
      rawText = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      usedModel = model;
      console.log(`[insurance] ${model} succeeded, ${rawText.length} chars`);
      break;
    }
    if (!rawText) throw new Error('No usable Gemini model responded for this API key.');

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Unparseable response: ${rawText.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]);

    console.log(`[insurance] parsed via ${usedModel}:`, JSON.stringify(parsed).slice(0, 300));
    return json({ success: true, data: parsed });
  } catch (err: any) {
    console.error('[insurance] error:', err.message);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
