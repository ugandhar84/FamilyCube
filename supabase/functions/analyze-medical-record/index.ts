// FamilyCube — Edge Function: analyze-medical-record
// Downloads the document from Storage, runs Gemini Vision analysis,
// returns structured result. Does NOT write to DB — the client presents
// the result for user approval before storing.
//
// Deploy: supabase functions deploy analyze-medical-record

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── Anonymize sensitive text before sending to AI ─────────────────────────────
function anonymize(text: string, realName: string): string {
  const esc = realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(esc, 'gi'), '[PATIENT]')
    .replace(/\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b/g, '[DATE]')
    .replace(/\bDOB\s*:?\s*\S+/gi, 'DOB: [DATE]')
    .replace(/\bSSN\s*:?\s*[\d\-]+/gi, 'SSN: [REDACTED]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]')
    .replace(/\bMRN\s*:?\s*\S+/gi, 'MRN: [REDACTED]');
}

// ── Gemini Vision call ────────────────────────────────────────────────────────
interface GeminiImagePart { inlineData: { mimeType: string; data: string } }
interface GeminiTextPart  { text: string }

async function callGemini(
  textPrompt: string,
  imageParts: GeminiImagePart[],
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const parts: (GeminiImagePart | GeminiTextPart)[] = [...imageParts, { text: textPrompt }];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

// ── Gemini text fallback (DeepSeek-style, no vision needed) ───────────────────
async function callGeminiText(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini text ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── JSON extraction ───────────────────────────────────────────────────────────
function extractJson(raw: string): Record<string, unknown> {
  // Strip leading/trailing whitespace + common markdown fence variations
  let cleaned = raw.trim();

  // Remove <think>…</think> blocks (Gemini 2.5 flash sometimes emits these)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip ```json … ``` or ``` … ``` fences (greedy-last so nested braces survive)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // 1. Try the whole cleaned string
  try { return JSON.parse(cleaned); } catch { /* fall through */ }

  // 2. Find the LAST outermost { … } block (handles trailing commentary)
  const matches = [...cleaned.matchAll(/\{[\s\S]*?\}/g)];
  // Walk from the end — take the longest valid JSON object
  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = matches[i][0];
    try { return JSON.parse(candidate); } catch { /* keep trying */ }
  }

  // 3. Greedy match — largest { … } span in the whole string
  const greedyMatch = cleaned.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    try { return JSON.parse(greedyMatch[0]); } catch { /* fall through */ }
  }

  console.error('[analyze-medical-record] Raw AI text that failed JSON parse:', cleaned.slice(0, 500));
  throw new Error('Could not parse JSON from AI response');
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a medical document analysis AI for a family health vault.
You analyze human medical documents only — lab reports, discharge summaries, prescriptions, imaging reports, vaccination records, doctor visit notes, pathology reports, and similar clinical documents issued by or for a human patient.

The patient is referred to as [PATIENT]. Do NOT invent a name.

IMPORTANT: First determine if this is a human medical/clinical document.
If it is NOT (e.g. a receipt, invoice, grocery list, utility bill, contract, photo, veterinary record, insurance EOB, general health article, or any non-clinical document),
return ONLY this JSON:
{ "not_medical": true, "message": "one friendly sentence explaining what the document appears to be and that only human medical reports are supported" }

If it IS a human medical document, return ONLY a valid JSON object with no markdown fences:
{
  "summary": "2-3 plain-language sentences describing what this document contains and its overall significance",
  "key_findings": ["finding 1", "finding 2"],
  "follow_up_items": ["action or appointment needed 1", "action 2"],
  "tags": ["keyword1", "keyword2", "keyword3"],
  "doc_type": "lab | discharge | prescription | imaging | insurance | vaccination | other",
  "urgency": "routine | attention | urgent",
  "urgency_reason": "short reason if attention or urgent, otherwise null"
}

Guidelines:
- key_findings: up to 6 specific clinical findings, test results, diagnoses, or medications mentioned
- follow_up_items: concrete next steps (e.g. "Schedule follow-up in 3 months", "Refill by [DATE]"); max 4
- tags: 3-6 searchable keywords (e.g. "cholesterol", "blood pressure", "antibiotic")
- urgency: "urgent" only if document indicates emergency or critical values; "attention" for abnormal results or soon-due actions; "routine" otherwise
- If you cannot read the document clearly, still return your best attempt
- Omit null fields entirely`;

// ── Base64 helper ─────────────────────────────────────────────────────────────
function toBase64(bytes: Uint8Array): string {
  // Deno doesn't have btoa for large buffers — use chunked approach
  const CHUNK = 8192;
  let binary  = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const jwt = authHeader.slice(7);

  // User-scoped client — RLS applies
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  });

  // Service client — for storage download (storage RLS is checked separately below)
  const svcClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const { record_id, member_name = 'Patient' } = await req.json() as {
      record_id: string;
      member_name?: string;
    };
    if (!record_id) return json({ error: 'record_id is required' }, 400);

    // ── Fetch record (RLS: only accessible if user belongs to that family) ──
    const { data: rec, error: recErr } = await userClient
      .from('medical_records')
      .select('id, title, tag, record_date, notes, file_path, file_name, ai_analyzed')
      .eq('id', record_id)
      .single();

    if (recErr || !rec) return json({ error: 'Record not found or access denied' }, 404);
    if (rec.ai_analyzed) return json({ error: 'This record has already been analyzed and approved' }, 409);

    // ── Build context ─────────────────────────────────────────────────────
    const safeTitle = anonymize(rec.title ?? '', member_name);
    const safeNotes = rec.notes ? anonymize(rec.notes, member_name) : '';

    const contextPrompt = [
      `Document title: ${safeTitle}`,
      `Category: ${rec.tag}`,
      `Record date: ${rec.record_date}`,
      safeNotes ? `Notes from uploader: ${safeNotes}` : '',
      'Analyze this medical document carefully.',
    ].filter(Boolean).join('\n');

    // ── Require a file — no hallucination from metadata alone ────────────
    if (!rec.file_path) {
      return json({
        ok: true,
        not_medical: true,
        message: 'No file is attached to this record. Attach a PDF or photo of the document to enable AI analysis.',
      });
    }

    // ── Vision analysis ───────────────────────────────────────────────────
    let rawText = '';
    try {
      const { data: fileBytes, error: dlErr } = await svcClient.storage
        .from('medical-records')
        .download(rec.file_path);

      if (dlErr || !fileBytes) throw new Error(`Storage download failed: ${dlErr?.message ?? 'empty response'}`);

      const name     = (rec.file_name ?? rec.file_path).toLowerCase();
      const mimeType = name.endsWith('.pdf')  ? 'application/pdf'
                     : name.endsWith('.png')  ? 'image/png'
                     : name.endsWith('.heic') ? 'image/heic'
                     : 'image/jpeg';

      const buf  = await fileBytes.arrayBuffer();
      const b64  = toBase64(new Uint8Array(buf));
      const imageParts: GeminiImagePart[] = [{ inlineData: { mimeType, data: b64 } }];
      rawText = await callGemini(contextPrompt, imageParts);
    } catch (visionErr: any) {
      console.error('[analyze-medical-record] vision failed:', visionErr);
      return json({ error: `Could not read the file: ${visionErr.message ?? 'unknown error'}` }, 500);
    }

    // ── Parse and return ──────────────────────────────────────────────────
    console.log('[analyze-medical-record] rawText length:', rawText.length);
    console.log('[analyze-medical-record] rawText[:800]:', rawText.slice(0, 800));

    let analysis: Record<string, unknown>;
    try {
      analysis = extractJson(rawText);
    } catch (parseErr: any) {
      return json({ error: 'AI returned unparseable response', raw: rawText.slice(0, 1000) }, 500);
    }

    if (analysis.not_medical === true) {
      return json({ ok: true, not_medical: true, message: analysis.message ?? 'This does not appear to be a medical document.' });
    }
    return json({ ok: true, analysis, analyzed_at: new Date().toISOString() });

  } catch (err: any) {
    console.error('[analyze-medical-record]', err);
    return json({ error: err.message ?? 'AI analysis failed. Please try again.' }, 500);
  }
});
