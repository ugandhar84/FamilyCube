// PawBond — Edge Function: parse-appointment-voice
// Accepts a voice transcript and returns structured appointment fields via Gemini.
// Deploy: supabase functions deploy parse-appointment-voice

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithTimeout, TEXT_TIMEOUT_MS } from '../_shared/fetchWithTimeout.ts';
import { getChainConfig } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });


// Valid types must match the APPT_TYPES values in HealthScreen
const VALID_TYPES = ['checkup', 'vaccine', 'dental', 'surgery', 'grooming', 'emergency', 'other'];

// Aliases Gemini might return → canonical app value
const TYPE_ALIASES: Record<string, string> = {
  vaccination: 'vaccine',
  vaccinations: 'vaccine',
  shot: 'vaccine',
  shots: 'vaccine',
  cleaning: 'dental',
  'dental cleaning': 'dental',
  operation: 'surgery',
  urgent: 'emergency',
  'annual checkup': 'checkup',
  physical: 'checkup',
  exam: 'checkup',
  bath: 'grooming',
  groom: 'grooming',
};

function normaliseType(raw: string | null | undefined): string {
  if (!raw) return 'checkup';
  const lower = raw.toLowerCase().trim();
  if (VALID_TYPES.includes(lower)) return lower;
  return TYPE_ALIASES[lower] ?? 'other';
}

// Validate and normalise "YYYY-MM-DD HH:mm" — rejects obviously bad dates
function normaliseScheduledAt(raw: string | null | undefined, today: string): string | null {
  if (!raw) return null;
  // Accept both "YYYY-MM-DD HH:mm" and "YYYY-MM-DDTHH:mm"
  const normalised = raw.replace('T', ' ').slice(0, 16);
  const [datePart, timePart] = normalised.split(' ');
  if (!datePart || !timePart) return null;

  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min]  = timePart.split(':').map(Number);
  if (!y || !m || !d || isNaN(h) || isNaN(min)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;

  // If Gemini returned a past year (e.g. hallucinated 2024), bump to today's year
  const todayYear = parseInt(today.slice(0, 4), 10);
  const correctedYear = y < todayYear ? todayYear : y;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${correctedYear}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(min)}`;
}

const SYSTEM_PROMPT = `You are an appointment parser for a pet care app.
Extract appointment details from the user's spoken description and return ONLY valid JSON.
Today's date is provided — use it to resolve relative dates ("tomorrow", "next Monday", "next week") and always use the correct year.

Return this exact JSON shape (use null for missing fields):
{
  "title": string,            // short appointment title, 2-5 words, e.g. "Annual Checkup", "Dental Cleaning"
  "type": string,             // one of: checkup | vaccine | dental | surgery | grooming | emergency | other
  "scheduled_at": string,     // "YYYY-MM-DD HH:mm" — 24-hour format; use 09:00 if no time mentioned
  "vet_name": string|null,    // vet's name, strip "Dr." prefix
  "clinic_name": string|null,
  "clinic_address": string|null,
  "notes": string|null        // anything else the user mentioned
}

Rules:
- Always use the correct year from today's date. Never return a past year.
- type mapping: shots/vaccination → vaccine, cleaning → dental, checkup/physical/exam → checkup
- title: sentence-case, 2-5 words maximum
- Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const { data: { user }, error: authErr } = await createClient(supabaseUrl, anonKey)
      .auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json() as { transcript?: string; today?: string };
    const transcript = body.transcript?.trim() ?? '';
    const today      = body.today ?? new Date().toISOString().slice(0, 10);

    if (!transcript) return json({ error: 'Empty transcript' }, 400);
    if (transcript.length > 1000) return json({ error: 'Transcript too long' }, 400);

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_KEY) return json({ error: 'AI not configured' }, 503);
    const GEMINI_MODELS = (await getChainConfig()).general_text
      .filter(s => s.provider === 'gemini' || s.provider === 'custom').map(s => s.model);

    const userMessage = `Today is ${today}.\n\nUser said: "${transcript}"`;

    let raw: Record<string, unknown> | null = null;
    for (const model of GEMINI_MODELS) {
      try {
        const res = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: [{ role: 'user', parts: [{ text: userMessage }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
            }),
          },
          TEXT_TIMEOUT_MS,
        );
        if (!res.ok) continue;
        const data  = await res.json();
        const text  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const clean = text.replace(/```json|```/g, '').trim();
        raw = JSON.parse(clean);
        break;
      } catch { continue; }
    }

    if (!raw) return json({ error: 'Could not parse appointment from speech. Please try again.' }, 422);

    // Normalise and validate before returning to client
    const appointment = {
      title:           typeof raw.title === 'string' ? raw.title.slice(0, 100) : null,
      type:            normaliseType(raw.type as string),
      scheduled_at:    normaliseScheduledAt(raw.scheduled_at as string, today),
      vet_name:        typeof raw.vet_name === 'string' ? raw.vet_name.replace(/^Dr\.?\s*/i, '').trim() || null : null,
      clinic_name:     typeof raw.clinic_name === 'string' ? raw.clinic_name.trim() || null : null,
      clinic_address:  typeof raw.clinic_address === 'string' ? raw.clinic_address.trim() || null : null,
      notes:           typeof raw.notes === 'string' ? raw.notes.trim() || null : null,
    };

    return json({ appointment });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Internal error' }, 500);
  }
});
