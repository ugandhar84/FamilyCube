// FamilyCube — Edge Function: parse-flyer
// Accepts 1-3 base64 images (or PDF pages rendered to images) of an activity
// flyer and extracts structured event details via Gemini Vision.
// Images are NEVER stored — processed in-memory only.
//
// Deploy: supabase functions deploy parse-flyer

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a family calendar assistant. You are given 1-3 images of an activity flyer or school notice.
Extract all relevant event/activity details and return them as structured JSON.

Fields to extract:
- title: the name of the event or activity
- category: one of School, Sports, Medical, Work, Event, Study (best fit)
- date: "YYYY-MM-DD" — if relative ("next Monday") or unclear, return null
- time: "HH:MM" 24-hour format, or null if not mentioned
- end_time: "HH:MM" 24-hour format, or null
- location: venue name and/or address, or null
- organizer: who is hosting (school, club name, teacher name), or null
- description: 1-2 sentences summarising key details the family should know
- rsvp_deadline: "YYYY-MM-DD" if an RSVP or sign-up deadline is mentioned, else null
- cost: numeric dollar amount if mentioned, else null
- notes: any special instructions (what to bring, dress code, permission slip needed, etc.), or null
- recurring: true if the event repeats (weekly practice, monthly meeting), false otherwise
- recurrence_desc: plain text description of recurrence pattern if recurring, else null

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "title": "string",
  "category": "School",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "end_time": "HH:MM",
  "location": "string",
  "organizer": "string",
  "description": "string",
  "rsvp_deadline": "YYYY-MM-DD",
  "cost": 0.00,
  "notes": "string",
  "recurring": false,
  "recurrence_desc": null
}

If you cannot determine a field, use null. If the images contain multiple distinct events, return only the primary/most prominent one.`;

// ── Gemini vision call (multi-image) ──────────────────────────────────────────
async function callGemini(key: string, images: { data: string; mimeType: string }[]): Promise<string> {
  const imageParts = images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } }));

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [
        ...imageParts,
        { text: 'Extract the event details from this flyer. Return JSON only.' },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
  });

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastErr = '';
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, 18_000);
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
      const j = await res.json();
      if (j.error) { lastErr = j.error.message; continue; }
      return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(`Gemini failed: ${lastErr}`);
}

// ── JSON extraction from raw AI text ─────────────────────────────────────────
function extractJson(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in response');
  return JSON.parse(clean.slice(start, end + 1));
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY not set' }, 503);

    const body = await req.json();
    // images: array of { data: base64string, mimeType: 'image/jpeg'|'image/png'|'image/webp' }
    const images: { data: string; mimeType: string }[] = body.images ?? [];

    if (!images.length || images.length > 3) {
      return json({ error: 'Provide 1–3 images' }, 400);
    }

    // Validate each image has data
    for (const img of images) {
      if (!img.data || !img.mimeType) return json({ error: 'Each image needs data and mimeType' }, 400);
    }

    const raw = await callGemini(geminiKey, images);
    const parsed = extractJson(raw);

    return json({ ok: true, event: parsed });
  } catch (e) {
    console.error('parse-flyer error:', e);
    return json({ error: String(e) }, 500);
  }
});
