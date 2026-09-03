// FamilyCube — Edge Function: analyze-appointment-recording
// Downloads an appointment audio recording from Storage, runs Gemini's
// audio-understanding, returns a structured visit summary (At a glance /
// discussion topics / next steps). Does NOT write to DB — the client
// presents the result for user approval before storing, exactly like
// analyze-medical-record's own flow.
//
// Structural clone of analyze-medical-record/index.ts (same auth pattern,
// same extractJson helper, same Gemini call shape) — kept as an
// independent copy rather than sharing via _shared/, per this codebase's
// existing convention of not sharing logic across edge functions unless
// already factored into _shared/.
//
// Deploy: supabase functions deploy analyze-appointment-recording

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

// ── Anonymize sensitive TEXT METADATA before sending to AI ────────────────────
// Same caveat as analyze-medical-record's own anonymize(): this only
// redacts the title/notes STRINGS built in contextPrompt below. It does
// NOT touch the actual audio bytes sent to Gemini — if the patient's real
// name is said aloud during the recording (the normal case for a real
// appointment), Gemini hears it unredacted. Do not treat this function's
// existence as proof the audio content is protected — only the metadata
// fields are.
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

// ── Gemini audio-understanding call ────────────────────────────────────────────
interface GeminiMediaPart { inlineData: { mimeType: string; data: string } }
interface GeminiTextPart  { text: string }

async function callGemini(
  textPrompt: string,
  mediaParts: GeminiMediaPart[],
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const parts: (GeminiMediaPart | GeminiTextPart)[] = [...mediaParts, { text: textPrompt }];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      // Long visit recordings need real room to produce a detailed
      // response — analyze-medical-record's 8192 cap was sized for a
      // single document's findings list; a 30-60 minute conversation with
      // several discussion topics and next steps needs more.
      generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

// ── JSON extraction (identical to analyze-medical-record's own) ───────────────
function extractJson(raw: string): Record<string, unknown> {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  try { return JSON.parse(cleaned); } catch { /* fall through */ }

  const matches = [...cleaned.matchAll(/\{[\s\S]*?\}/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = matches[i][0];
    try { return JSON.parse(candidate); } catch { /* keep trying */ }
  }

  const greedyMatch = cleaned.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    try { return JSON.parse(greedyMatch[0]); } catch { /* fall through */ }
  }

  console.error('[analyze-appointment-recording] Raw AI text that failed JSON parse:', cleaned.slice(0, 500));
  throw new Error('Could not parse JSON from AI response');
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Live-requested: the summary should be detailed and genuinely useful —
// something a busy parent actually wants to read after a visit, not a
// clinical shorthand dump. Modeled loosely on the "Kin" app's own visit-
// summary shape (At a glance / Discussion topics with severity tags /
// Next steps checklist) the user referenced, adapted to fit this app's
// existing AiAnalysis-family schema conventions.
const SYSTEM_PROMPT = `You are a warm, careful medical-visit assistant for a family health app. You listen to an audio recording of a real doctor's appointment (or a related phone call, e.g. a nurse follow-up) and turn it into a summary a busy, worried parent can actually use — clear enough to read in under a minute, detailed enough that they don't need to re-listen to the recording to remember what was said.

The patient is referred to as [PATIENT]. Do NOT invent a name, diagnosis, medication, or dose that wasn't actually said in the recording.

IMPORTANT — strict content gate: This feature is ONLY for genuine medical/health content. Before summarizing, verify the recording actually contains real clinical substance — at least one of: a symptom or complaint being described, a diagnosis or medical assessment, a medication, dose, or treatment being discussed, a test/lab/imaging result, vital signs or measurements, or clinical medical terminology used by a healthcare provider (doctor, nurse, pharmacist, specialist, therapist). General wellness chit-chat, scheduling-only calls with no clinical content, or a conversation that merely mentions a doctor's office without discussing actual health matters do NOT qualify.

If the recording does NOT clearly contain this kind of medical/health content — including silence, an unrelated personal or business conversation, music, background noise, a non-clinical phone call, or any recording where you cannot identify real medical terminology or health discussion — return ONLY this JSON and nothing else:
{ "not_medical": true, "message": "one direct sentence explaining what the recording actually appears to contain and that only recordings of real medical/clinical conversations are supported" }
Do NOT attempt to force a summary out of thin content. When in doubt because the audio is unclear or too short to judge, still return not_medical rather than fabricating a visit that may not have happened.

If it IS a medical appointment or closely related clinical call, return ONLY a valid JSON object with no markdown fences, in this exact shape:
{
  "summary": "A warm, plain-language paragraph (4-6 sentences) covering: why this visit happened, what was found or discussed, any diagnosis or assessment given, what treatment or medication was started or changed, and what the overall plan going forward is. Write it the way you'd explain the visit to a caring family member who wasn't there — specific and reassuring, not clinical shorthand.",
  "discussion_topics": [
    {
      "title": "Short topic name (e.g. a diagnosis, a symptom discussed, a test result)",
      "description": "2-4 full sentences explaining what was actually said about this topic — the reasoning, the doctor's explanation, any numbers or specifics mentioned. Detailed enough to stand alone.",
      "tag": "important | monitor | info"
    }
  ],
  "next_steps": [
    {
      "text": "One concrete, specific action item — a real task the family can act on (e.g. 'Pick up amoxicillin from the pharmacy today', 'Schedule a follow-up in 4 weeks to recheck bloodwork', 'Start the new inhaler twice daily and track symptoms in a log'). Avoid vague items like 'follow doctor's advice.'",
      "suggested_date": "YYYY-MM-DD if you can compute a real date from what was said (see date rule below), otherwise omit this field entirely — never guess a date nothing in the recording supports",
      "suggested_time": "HH:MM 24h if a specific time was mentioned, otherwise omit this field entirely",
      "kind": "\"event\" for anything tied to a specific date/time (a follow-up appointment, a lab draw, a scheduled call) — \"task\" for a same-day-or-soon action with no fixed appointment time (picking up a prescription, starting a medication, a lifestyle change) — omit this field entirely if neither fits (e.g. an ongoing thing to track ad-hoc, not a one-time action)"
    }
  ],
  "tags": ["keyword1", "keyword2", "keyword3"],
  "doc_type": "visit_recording",
  "urgency": "routine | attention | urgent",
  "urgency_reason": "short reason if attention or urgent, otherwise null"
}

Guidelines:
- discussion_topics: cover EVERY distinct medical topic actually discussed — a typical visit has 2-5. Don't compress multiple distinct topics into one entry. Each description should be detailed enough that re-listening to the recording wouldn't add much.
- tag: "important" for a new diagnosis, a new medication, or anything the doctor emphasized; "monitor" for something to watch/track over time (a symptom, a borderline result); "info" for general education or reassurance that doesn't need action or tracking.
- next_steps: every concrete action mentioned — medications to pick up or start, appointments to schedule, tests to get done, lifestyle changes, things to track. Be specific: include names, doses, timeframes, and locations exactly as stated when available. Order by how soon they need to happen.
- Date rule for suggested_date: you are told this visit's own date below (the "Record date" field) — use it as the anchor to compute a real calendar date from relative phrases actually said in the recording ("in 4 weeks" → visit date + 28 days, "next Tuesday" → the following Tuesday from the visit date, "in 3 months" → visit date + ~90 days). Only compute a date when the recording actually gives you a real timeframe to anchor from — a next_step with no timeframe mentioned at all must omit suggested_date rather than inventing one.
- tags: 3-6 searchable keywords for this visit (e.g. condition names, medication names, specialty).
- urgency: "urgent" only if the recording indicates something needs immediate/emergency attention; "attention" for a new diagnosis, medication change, or a result that needs follow-up; "routine" for a normal check-up with nothing new or concerning.
- If parts of the audio are unclear or hard to hear, still return your best-effort summary of what WAS understood — never fabricate specifics you didn't actually hear.
- Omit null fields entirely.`;

// ── Base64 helper (identical to analyze-medical-record's own) ─────────────────
function toBase64(bytes: Uint8Array): string {
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

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  });
  const svcClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const { record_id, member_name = 'Patient' } = await req.json() as {
      record_id: string;
      member_name?: string;
    };
    if (!record_id) return json({ error: 'record_id is required' }, 400);

    const { data: rec, error: recErr } = await userClient
      .from('medical_records')
      .select('id, title, tag, record_date, notes, file_path, file_name, ai_analyzed')
      .eq('id', record_id)
      .single();

    if (recErr || !rec) return json({ error: 'Record not found or access denied' }, 404);
    if (rec.ai_analyzed) return json({ error: 'This record has already been analyzed and approved' }, 409);

    const safeTitle = anonymize(rec.title ?? '', member_name);
    const safeNotes = rec.notes ? anonymize(rec.notes, member_name) : '';

    const contextPrompt = [
      `Appointment title: ${safeTitle}`,
      `Record date: ${rec.record_date}`,
      safeNotes ? `Notes from the person who recorded this: ${safeNotes}` : '',
      'Listen to this appointment recording carefully and summarize it.',
    ].filter(Boolean).join('\n');

    if (!rec.file_path) {
      return json({
        ok: true,
        not_medical: true,
        message: 'No recording is attached to this record yet.',
      });
    }

    let rawText = '';
    try {
      const { data: fileBytes, error: dlErr } = await svcClient.storage
        .from('medical-audio')
        .download(rec.file_path);

      if (dlErr || !fileBytes) throw new Error(`Storage download failed: ${dlErr?.message ?? 'empty response'}`);

      const name     = (rec.file_name ?? rec.file_path).toLowerCase();
      const mimeType = name.endsWith('.m4a')  ? 'audio/mp4'
                     : name.endsWith('.mp4')  ? 'audio/mp4'
                     : name.endsWith('.wav')  ? 'audio/wav'
                     : name.endsWith('.aac')  ? 'audio/aac'
                     : 'audio/mp4'; // expo-audio's RecordingPresets.HIGH_QUALITY output on both platforms

      const buf  = await fileBytes.arrayBuffer();
      const b64  = toBase64(new Uint8Array(buf));
      const mediaParts: GeminiMediaPart[] = [{ inlineData: { mimeType, data: b64 } }];
      rawText = await callGemini(contextPrompt, mediaParts);
    } catch (audioErr: any) {
      console.error('[analyze-appointment-recording] audio processing failed:', audioErr);
      return json({ error: `Could not process the recording: ${audioErr.message ?? 'unknown error'}` }, 500);
    }

    console.log('[analyze-appointment-recording] rawText length:', rawText.length);
    console.log('[analyze-appointment-recording] rawText[:800]:', rawText.slice(0, 800));

    let analysis: Record<string, unknown>;
    try {
      analysis = extractJson(rawText);
    } catch {
      return json({ error: 'AI returned unparseable response', raw: rawText.slice(0, 1000) }, 500);
    }

    if (analysis.not_medical === true) {
      return json({ ok: true, not_medical: true, message: analysis.message ?? 'This recording does not appear to contain a medical appointment.' });
    }
    return json({ ok: true, analysis, analyzed_at: new Date().toISOString() });

  } catch (err: any) {
    console.error('[analyze-appointment-recording]', err);
    return json({ error: err.message ?? 'AI analysis failed. Please try again.' }, 500);
  }
});
