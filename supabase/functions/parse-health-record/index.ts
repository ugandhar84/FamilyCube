// PawBond — Edge Function: parse-health-record (v3)
// Accepts base64_pages directly from the app (no storage round-trip needed).
// Falls back to downloading from page URLs if base64_pages not provided.
//
// Deploy: supabase functions deploy parse-health-record

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireProForPet, proRequiredResponse } from '../_shared/requirePro.ts';
import { fetchWithTimeout, VISION_TIMEOUT_MS, TEXT_TIMEOUT_MS } from '../_shared/fetchWithTimeout.ts';
import { getChainConfig } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ── Extraction prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a veterinary health record extraction AI.
You receive one or more pages from vet visit summaries, vaccination certificates, lab reports,
prescription records, discharge summaries, or general medical notes. Reports can contain
50+ line items (e.g. a full CBC + chemistry panel) — extract every one of them.

Extract every clinical item found across ALL pages. Return ONLY a valid JSON object — no markdown, no commentary.

A single document can be any mix of sections — labs, meds, vaccines, imaging/
radiology, surgery/procedure notes, discharge instructions, follow-up plans,
exam findings, general notes — in any combination, on any page, in any order.
Never assume which sections are present; read every page and extract whatever
is actually there.

JSON schema (OMIT any field you don't have — do not emit null keys):
{
  "summary": "Whole-report overview, MAX 4 short lines/sentences total: what the visit/report was for, the overall picture (mostly normal vs notable findings), medications prescribed if any, next steps if any. Plain English, no jargon. Do not exceed 4 lines — be selective, not exhaustive.",
  "visit_date": "YYYY-MM-DD",
  "vet_name": "Doctor last name only",
  "clinic": "Clinic name",
  "document_patient_name": "Patient name as written in the document — omit if not found",
  "document_species": "Species from the document — one of: dog, cat, rabbit, bird, other — omit if not found",
  "patient_mismatch": true,
  "items": [
    {
      "type": "vaccine|medication|lab_result|weight|diagnosis|appointment|imaging|procedure|exam_finding|instruction|note",
      "date": "YYYY-MM-DD",
      "title": "Short name e.g. 'Rabies', 'Carprofen', 'Glucose', 'Abdominal ultrasound', 'Dental cleaning'",
      "plain_language": "ABNORMAL ONLY — 1-2 sentences (≤20 words each) explaining why this result is concerning and what it means for the pet. OMIT entirely for normal/in-range items.",
      "raw_value": "lab: '6.2 g/dL'. weight: kg decimal. else omit",
      "unit": "e.g. 'g/dL'",
      "is_abnormal": true,
      "reference_range": "e.g. '5.5-7.5'",
      "next_due": "YYYY-MM-DD",
      "dosage": "e.g. '25mg 2x daily'",
      "frequency": "daily|weekly|monthly|as_needed",
      "manufacturer": "vaccine brand",
      "follow_up_date": "YYYY-MM-DD",
      "severity": "mild|moderate|severe",
      "notes": "only if essential"
    }
  ]
}

Type guide (use the closest match; "note" is the catch-all):
- imaging: x-ray, ultrasound, CT/MRI, radiology findings
- procedure: surgery, dental cleaning, biopsy, any procedure performed
- exam_finding: physical exam observations, symptoms, vitals noted during a visit
- instruction: home-care/discharge instructions, activity restrictions, diet changes
- note: anything else that doesn't fit the other types

CRITICAL — completeness beats verbosity, every time. A document can contain ANY
number of different section types in ANY combination — you cannot assume which
ones are present. A truncated response that silently drops an entire section
(medications, imaging, procedures — anything) is always a worse outcome than a
response with shorter explanations. Make this fail-safe with a rule that works
regardless of which section types actually appear in a given document:

1. GROUP items by type, then ORDER the groups from FEWEST items to MOST items
   in the final array (not a fixed type order — count per document). This
   guarantees that every distinct section is represented before token budget
   is spent on repeating the largest one. In the vast majority of vet
   documents, lab_result is the highest-count type, so this naturally puts it
   last — but apply the same "smallest groups first" logic if a document has,
   say, many vaccines and only one lab result instead.
2. plain_language rule (applies to ALL item types without exception):
   - is_abnormal=true  → include plain_language: 1-2 sentences, ≤20 words each,
     explain WHY it's concerning and what it means for the pet.
   - is_abnormal=false → OMIT plain_language entirely. The app shows "Normal"
     automatically. Do not generate any explanation text for normal items.
   This single rule cuts output tokens by ~70% on a full blood panel.
3. "is_abnormal" is ALWAYS required for every item (true or false) —
   never omit it on any item type. The app shows a NORMAL/ABNORMAL badge on
   every row and needs this field regardless.

Other rules:
- Read EVERY page. Items can appear on any page; a multi-page report often has
  labs on one page and medications/instructions on another — extract them ALL.
- MEDICATIONS: every prescribed/dispensed drug is its own item with
  type="medication" (title = drug name, plus dosage/frequency when shown). Do
  this even if the med is only mentioned in discharge notes or on a later page.
- VACCINES: each vaccine is its own type="vaccine" item (with next_due if given).
- DEDUPLICATE: if the exact same test/med/vaccine appears more than once with the
  same name AND same date AND same value (e.g. duplicate/re-scanned pages), include
  it only ONCE. Do not repeat identical items.
- TITLE CLEANUP: strip all trademark/copyright/registered symbols (™, ®, ©) and
  other non-standard characters from "title" fields. Use plain ASCII names only
  (e.g. "PrecisionPSL" not "PrecisionPSL™").
- Keep every OTHER field compact: OMIT any field you don't have. Only "type" and
  "title" are always required (plus is_abnormal for lab_result per above).
- Weight: convert lbs→kg (1 lb = 0.4536 kg); kg decimal in raw_value.
- Do NOT invent. Only extract what is clearly in the document.
- If blurry or no health data, return items: [] with a one-line summary.
- PATIENT MISMATCH: If the document clearly names a patient and that name does NOT match the pet context provided, set "patient_mismatch": true and "document_patient_name" to the name found in the document. Also set "document_species" if the document clearly states a species (e.g. "canine", "feline") — even if the name matches. If names match and species matches (or no patient/species info in the document), omit both fields entirely.

SPECIES-SPECIFIC LAB REFERENCE RANGES (use when pet context is provided):
- CAT: RBC 5.5-10.0 M/µL, HGB 8.0-15.0 g/dL, HCT 24-45%, WBC 5.5-19.5 K/µL, Glucose 70-150 mg/dL, BUN 15-34 mg/dL, Creatinine 0.8-2.4 mg/dL, ALT 25-97 U/L, Total Protein 5.4-8.2 g/dL
- DOG: RBC 5.5-8.5 M/µL, HGB 12.0-18.0 g/dL, HCT 37-55%, WBC 6.0-17.0 K/µL, Glucose 70-138 mg/dL, BUN 6-31 mg/dL, Creatinine 0.5-1.8 mg/dL, ALT 10-100 U/L, Total Protein 5.2-8.2 g/dL
- RABBIT: RBC 4.0-7.2 M/µL, HGB 10.0-17.4 g/dL, WBC 5.2-12.5 K/µL, Glucose 75-155 mg/dL, BUN 13-29 mg/dL
- BIRD: Reference ranges vary widely by species — flag as uncertain if species not specified.
When species context is available, prefer species-specific reference ranges over generic mammal defaults when evaluating is_abnormal. Note the species used in reference_range if it differs from the document's printed range.`;

// ── Patient/species mismatch detection ──────────────────────────────────────
// Code-side comparison — more reliable than asking the AI to judge its own output.
const SPECIES_ALIASES: Record<string, string[]> = {
  dog:    ['dog', 'canine', 'k9', 'canis'],
  cat:    ['cat', 'feline', 'felis'],
  rabbit: ['rabbit', 'bunny', 'lagomorph'],
  bird:   ['bird', 'avian', 'parrot', 'cockatiel', 'budgie', 'parakeet'],
};

function detectMismatch(
  docName: string | null | undefined,
  petName: string | null | undefined,
  docSpecies?: string | null,
  petSpecies?: string | null,
): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  const nameMismatch = (() => {
    if (!docName || !petName) return false;
    const doc = normalize(docName);
    const pet = normalize(petName);
    if (!doc || !pet) return false;
    return !doc.includes(pet) && !pet.includes(doc);
  })();

  const speciesMismatch = (() => {
    if (!docSpecies || !petSpecies) return false;
    const docNorm = normalize(docSpecies);
    const petNorm = normalize(petSpecies);
    if (docNorm === petNorm) return false;
    const toCanonical = (val: string) => {
      for (const [key, aliases] of Object.entries(SPECIES_ALIASES)) {
        if (aliases.some(a => val.includes(a))) return key;
      }
      return val;
    };
    return toCanonical(docNorm) !== toCanonical(petNorm);
  })();

  return nameMismatch || speciesMismatch;
}

// ── Robust JSON parse with truncation salvage ────────────────────────────────
// Gemini can hit MAX_TOKENS on long lab reports and cut off mid-array, making
// JSON.parse fail outright (→ 0 results / fatal error). This recovers the
// top-level fields plus every COMPLETE item that was emitted before the cutoff.
function parseHealthJson(raw: string): { summary?: string; visit_date?: string | null; vet_name?: string | null; clinic?: string | null; document_patient_name?: string | null; document_species?: string | null; items: unknown[] } | null {
  // Strip code fences and isolate the JSON object
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const objStart = cleaned.indexOf('{');
  if (objStart === -1) return null;
  const body = cleaned.slice(objStart);

  // Fast path — well-formed JSON
  try {
    const full = body.match(/\{[\s\S]*\}/);
    if (full) return JSON.parse(full[0]);
  } catch { /* fall through to salvage */ }

  // Salvage path — walk the items array collecting complete objects
  const itemsKey = body.indexOf('"items"');
  if (itemsKey === -1) return null;
  const arrStart = body.indexOf('[', itemsKey);
  if (arrStart === -1) return null;

  let depth = 0, inStr = false, esc = false, lastComplete = -1;
  for (let i = arrStart + 1; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) lastComplete = i; }
    else if (c === ']' && depth === 0) { lastComplete = i - 1; break; }
  }

  const header = body.slice(0, arrStart + 1); // up to and including "items": [
  const rebuilt = lastComplete === -1
    ? header + ']}'                                  // no complete items
    : body.slice(0, lastComplete + 1) + ']}';        // through last complete item
  try {
    return JSON.parse(rebuilt);
  } catch {
    return null;
  }
}

// ── Normalize + dedupe extracted items ───────────────────────────────────────
// Guards against the model repeating identical rows (e.g. duplicate/re-scanned
// pages, or the same test listed twice). Two items are duplicates when they have
// the same type + normalized title + date + value.
function dedupeItems(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  const norm = (s: unknown) =>
    String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9. ]/g, '').trim();
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    if (!it.type || !it.title) continue; // required fields — skip junk rows
    const key = [
      norm(it.type),
      norm(it.title),
      norm(it.date ?? ''),
      norm(it.raw_value ?? ''),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// ── Deno-safe base64 encode ───────────────────────────────────────────────────
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── Download a URL and return base64 ─────────────────────────────────────────
async function urlToBase64(url: string): Promise<{ data: string; mime: string; sizeKb: number }> {
  console.log(`[fetch-url] downloading: ${url.slice(0, 80)}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching: ${url}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const buf   = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sizeKb = Math.round(bytes.byteLength / 1024);
  console.log(`[fetch-url] OK — ${sizeKb}KB, mime=${contentType}`);
  return { data: uint8ToBase64(bytes), mime: contentType.split(';')[0].trim(), sizeKb };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const t0 = Date.now();
  let record_id_outer: string | undefined;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Auth + role check ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const svcClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Parse request body ────────────────────────────────────────────────────
    const body = await req.json() as {
      record_id: string;
      pet_id: string;
      // Option A: on-device OCR text — fastest, free, works with DeepSeek
      text_pages?: string[];
      // Option B: base64 images — sent directly from app
      base64_pages?: { data: string; mime: string }[];
      // Option C: storage URLs — edge fn downloads and sends to vision AI
      pages?: string[];
    };

    // Context-tier check: caretaker inherits owner's Pro subscription
    const proStatus = await requireProForPet(svcClient, user.id, body.pet_id);
    if (proStatus === 'free' || proStatus === 'expired') return proRequiredResponse();

    console.log('\n══ RECEIVED PAYLOAD ══════════════════════');
    console.log('[request] record_id  :', body.record_id);
    console.log('[request] pet_id     :', body.pet_id);
    console.log('[request] mode       :', body.text_pages?.length ? 'TEXT (OCR)' : body.base64_pages?.length ? 'BASE64 IMAGES' : body.pages?.length ? 'IMAGE URLS' : 'UNKNOWN');
    console.log('[request] text_pages :', body.text_pages?.length ?? 'none');
    if (body.text_pages?.length) {
      body.text_pages.forEach((t, i) =>
        console.log(`[request]   text[${i}] chars=${t.length} preview="${t.slice(0, 150).replace(/\n/g, ' ↵ ')}"`),
      );
    }
    console.log('[request] base64_pages:', body.base64_pages?.length ?? 'none');
    console.log('[request] url pages  :', body.pages?.length ?? 'none');
    if (body.pages?.length) {
      body.pages.forEach((u, i) => console.log(`[request]   url[${i}] = ${u.slice(0, 80)}`));
    }
    console.log('══════════════════════════════════════════\n');

    const { record_id, pet_id } = body;
    if (!record_id) throw new Error('record_id is required');
    if (!pet_id) throw new Error('pet_id is required');
    record_id_outer = record_id;

    // Verify caller can log health for this pet (owner or caretaker)
    const { data: roleCheck } = await supabase
      .from('pets').select('id').eq('id', pet_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    const { data: familyCheck } = await supabase
      .from('pet_family').select('role').eq('pet_id', pet_id).eq('user_id', user.id).maybeSingle();
    const isOwner = !!roleCheck;
    const isCaretaker = familyCheck?.role === 'caretaker';
    if (!isOwner && !isCaretaker) {
      return json({ error: 'Only owners and caretakers can add health records' }, 403);
    }

    // Mark as processing
    const { error: updateErr0 } = await supabase.from('health_records').update({ status: 'processing' }).eq('id', record_id);
    if (updateErr0) throw new Error('Failed to save health record: ' + updateErr0.message);
    console.log('[db] status set to processing for record:', record_id);

    // ── Pet context ───────────────────────────────────────────────────────────
    const { data: pet } = await supabase
      .from('pets').select('name, species, breed, birth_date').eq('id', pet_id).single();
    const petCtx = pet
      ? `Pet: ${pet.name} (${pet.species ?? 'pet'}${pet.breed ? `, ${pet.breed}` : ''}${pet.birth_date ? `, born ${pet.birth_date}` : ''})`
      : '';
    console.log('[pet] context:', petCtx || 'not found');

    // ── Option A: on-device OCR text — Gemini first (text mode), DeepSeek fallback ──
    if (body.text_pages?.length) {
      const pages = body.text_pages;
      console.log('[text-ocr] received', pages.length, 'text pages from device OCR');
      const combined = pages
        .map((t, i) => pages.length > 1 ? `[Page ${i + 1}]\n${t}` : t)
        .join('\n\n---\n\n');
      console.log('[text-ocr] total chars:', combined.length);
      console.log('[text-ocr] preview:', combined.slice(0, 300));

      const userMsg = [
        petCtx,
        combined,
        pages.length > 1
          ? `The above is extracted text from a ${pages.length}-page vet document. Extract health data from ALL pages.`
          : 'The above is extracted text from a vet document. Extract all health information.',
      ].filter(Boolean).join('\n\n');

      const geminiKeyText = Deno.env.get('GEMINI_API_KEY');
      const dsKey = Deno.env.get('DEEPSEEK_API_KEY');
      const _chainSlots = (await getChainConfig()).health_records;
      const textModels   = _chainSlots.filter(s => s.provider === 'gemini' || s.provider === 'custom').map(s => s.model);
      const visionModels = textModels;

      type TextResult = { rawText: string; provider: string; tokIn: number | null; tokOut: number | null; finishReason: string | null };
      let result: TextResult | null = null;

      // Gemini first — cheaper, better JSON adherence, and consistent with the vision path
      if (geminiKeyText) {
        for (const model of textModels) {
          try {
            console.log(`[text-ocr] trying gemini/${model}…`);
            const tG = Date.now();
            const gRes = await fetchWithTimeout(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKeyText}`,
              {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                  contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                  generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
                }),
              },
              TEXT_TIMEOUT_MS,
            );
            if (gRes.status === 404) { console.log(`[text-ocr] gemini/${model} not found, trying next…`); continue; }
            if (!gRes.ok) throw new Error(`Gemini ${gRes.status}: ${(await gRes.text()).slice(0, 200)}`);
            const gJson = await gRes.json() as any;
            if (gJson.error) throw new Error(`Gemini error: ${gJson.error.message}`);
            console.log(`[text-ocr] gemini/${model} succeeded in ${Date.now() - tG}ms`);
            result = {
              rawText: gJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
              provider: `gemini/${model} (text-ocr)`,
              tokIn: gJson.usageMetadata?.promptTokenCount ?? null,
              tokOut: gJson.usageMetadata?.candidatesTokenCount ?? null,
              finishReason: gJson.candidates?.[0]?.finishReason ?? null,
            };
            break;
          } catch (e: any) {
            console.warn(`[text-ocr] gemini/${model} failed: ${e.message}`);
          }
        }
      } else {
        console.log('[text-ocr] no GEMINI_API_KEY — skipping to DeepSeek');
      }

      const tAI = Date.now();
      if (!result) {
        if (!dsKey) throw new Error('All AI providers failed for text extraction. Set GEMINI_API_KEY or DEEPSEEK_API_KEY.');
        console.log('[text-ocr] falling back to DeepSeek…');
        const dsRes = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dsKey}` },
          body: JSON.stringify({
            model: 'deepseek-chat',
            max_tokens: 8192,
            temperature: 0.1,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMsg },
            ],
          }),
        }, TEXT_TIMEOUT_MS);
        console.log('[text-ocr] DeepSeek status:', dsRes.status, `(${Date.now() - tAI}ms)`);
        if (!dsRes.ok) throw new Error(`DeepSeek ${dsRes.status}: ${(await dsRes.text()).slice(0, 300)}`);
        const dsJson = await dsRes.json() as any;
        if (dsJson.error) throw new Error(`DeepSeek error: ${dsJson.error.message}`);
        result = {
          rawText: dsJson.choices?.[0]?.message?.content ?? '',
          provider: 'deepseek-chat (text-ocr)',
          tokIn: dsJson.usage?.prompt_tokens ?? null,
          tokOut: dsJson.usage?.completion_tokens ?? null,
          finishReason: dsJson.choices?.[0]?.finish_reason ?? null,
        };
      }
      const aiElapsed = Date.now() - tAI;

      console.log('[text-ocr] response length:', result.rawText.length);
      console.log('[text-ocr] raw (first 800):\n', result.rawText.slice(0, 800));

      const extracted = parseHealthJson(result.rawText);
      if (!extracted) throw new Error(`${result.provider} returned unparseable JSON: ${result.rawText.slice(0, 300)}`);
      const dedupItems1 = dedupeItems(extracted.items ?? []);
      const elapsed = Date.now() - t0;

      const { error: updateErr1 } = await supabase.from('health_records').update({
        status: 'done',
        ai_summary: extracted.summary ?? null,
        extracted_data: { items: dedupItems1, visit_date: extracted.visit_date ?? null, vet_name: extracted.vet_name ?? null, clinic: extracted.clinic ?? null, patient_mismatch: detectMismatch(extracted.document_patient_name, pet?.name, extracted.document_species, pet?.species), document_patient_name: extracted.document_patient_name ?? null, document_species: extracted.document_species ?? null },
        extraction_count: dedupItems1.length,
        auto_saved: false,
        processed_at: new Date().toISOString(),
        error_message: null,
        debug_info: {
          pages: pages.map((t, i) => ({ source: `ocr-page-${i+1}`, chars: t.length, status: 'ok' })),
          image_count: 0,
          text_chars: combined.length,
          elapsed_ms: elapsed,
          ai_elapsed_ms: aiElapsed,
          tokens: result.tokIn != null ? { prompt_tokens: result.tokIn, completion_tokens: result.tokOut } : null,
          finish_reason: result.finishReason,
          model: result.provider,
          source: 'device-ocr',
        },
      }).eq('id', record_id);
      if (updateErr1) throw new Error('Failed to save health record: ' + updateErr1.message);

      console.log(`[text-ocr] done in ${elapsed}ms via ${result.provider}, ${dedupItems1.length} items`);
      try {
        const sbLog = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const isGemini = result.provider.startsWith('gemini');
        // Gemini flash: ~$0.075/1M input, $0.30/1M output. DeepSeek: $0.14/1M in, $0.28/1M out.
        const cost = result.tokIn != null && result.tokOut != null
          ? isGemini
            ? (result.tokIn / 1_000_000) * 0.075 + (result.tokOut / 1_000_000) * 0.30
            : (result.tokIn / 1_000_000) * 0.14 + (result.tokOut / 1_000_000) * 0.28
          : null;
        await sbLog.from('api_usage_logs').insert({
          user_id: user.id, api_type: isGemini ? 'gemini_health' : 'deepseek', subcategory: result.provider,
          tokens_in: result.tokIn, tokens_out: result.tokOut, cost_usd: cost, duration_ms: aiElapsed,
          success: true, metadata: { record_id, source: 'text-ocr' },
        });
      } catch { /* non-fatal */ }
      return json({ success: true, item_count: dedupItems1.length, elapsed_ms: elapsed });
    }

    // ── Collect image pages (options B/C) ─────────────────────────────────────
    const images: { mime: string; data: string; sizeKb: number }[] = [];
    const pageDebug: { source: string; sizeKb?: number; mime?: string; status: string }[] = [];

    if (body.base64_pages?.length) {
      console.log('[pages] using base64 sent directly from app');
      for (let i = 0; i < body.base64_pages.length; i++) {
        const pg = body.base64_pages[i];
        const sizeKb = Math.round(pg.data.length * 0.75 / 1024);
        if (!pg.data || pg.mime.includes('pdf')) {
          pageDebug.push({ source: 'base64', mime: pg.mime, status: 'skipped-pdf-or-empty' });
          continue;
        }
        images.push({ mime: pg.mime, data: pg.data, sizeKb });
        pageDebug.push({ source: 'base64', sizeKb, mime: pg.mime, status: 'ok' });
        console.log(`[page ${i+1}] base64, ~${sizeKb}KB`);
      }
    } else if (body.pages?.length) {
      console.log('[pages] downloading from storage URLs:', body.pages.length);
      for (let i = 0; i < body.pages.length; i++) {
        const pageUrl = body.pages[i];
        try {
          const { data, mime, sizeKb } = await urlToBase64(pageUrl);
          if (mime === 'application/pdf') {
            pageDebug.push({ source: pageUrl.slice(0, 40), mime, status: 'skipped-pdf' });
            continue;
          }
          images.push({ mime, data, sizeKb });
          pageDebug.push({ source: pageUrl.slice(0, 40), sizeKb, mime, status: 'ok' });
          console.log(`[page ${i+1}] downloaded, ${sizeKb}KB`);
        } catch (e: any) {
          pageDebug.push({ source: pageUrl.slice(0, 40), status: `error: ${e.message}` });
          console.error(`[page ${i+1}] download failed:`, e.message);
        }
      }
    } else {
      throw new Error('Neither base64_pages nor pages[] provided in request body');
    }

    const imageCount = images.length;
    if (imageCount === 0) {
      throw new Error(
        `No images could be processed. Page statuses: ${JSON.stringify(pageDebug)}. ` +
        'For PDFs, scan each page as an image using the camera instead.',
      );
    }

    const instructionText = imageCount > 1
      ? `This is a ${imageCount}-page document. Extract health data from ALL pages.`
      : 'Extract all health information from this document.';

    const geminiKey   = Deno.env.get('GEMINI_API_KEY');
    const openaiKey   = Deno.env.get('OPENAI_API_KEY');
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');

    // NOTE: there used to be a "server-side OCR → DeepSeek" shortcut here that
    // flattened all page images into one OCR text blob before structured
    // extraction. It was removed — it silently dropped pages on multi-page
    // documents (Gemini's OCR call would sometimes only read one of several
    // attached images) and DeepSeek would then correctly-but-incompletely
    // extract only what it was given, returning success with missing sections.
    // It was also a strictly more expensive two-hop path (OCR call + DeepSeek
    // call) than just sending every image straight into one vision call below.
    // Going directly to vision is both more reliable and cheaper.

    // ── Provider fallback: Gemini → OpenAI → DeepSeek (vision/text) ──────────

    type ProviderResult = { text: string; provider: string; tokens: unknown; finishReason: string };

    // ── Gemini (tries models in order until one works) ────────────────────────
    async function callGemini(key: string): Promise<ProviderResult> {
      const parts: unknown[] = [];
      if (petCtx) parts.push({ text: petCtx });
      for (const img of images) parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
      parts.push({ text: instructionText });

      const reqBody = JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
      });

      const chainSlots2 = (await getChainConfig()).health_records;
      const models = chainSlots2.filter(s => s.provider === 'gemini' || s.provider === 'custom').map(s => s.model);

      const tryModel = async (model: string): Promise<ProviderResult | 'not-found'> => {
        const res = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody },
          VISION_TIMEOUT_MS,
        );
        if (res.status === 404) { console.log(`[gemini] model ${model} not found, trying next…`); return 'not-found'; }
        if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const j = await res.json() as any;
        if (j.error) throw new Error(`Gemini error: ${j.error.message}`);
        console.log(`[gemini] model ${model} succeeded`);
        return {
          text: j.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
          provider: `gemini/${model}`,
          tokens: j.usageMetadata
            ? { prompt_tokens: j.usageMetadata.promptTokenCount, completion_tokens: j.usageMetadata.candidatesTokenCount }
            : null,
          finishReason: j.candidates?.[0]?.finishReason ?? '',
        };
      };

      for (const model of models) {
        const r = await tryModel(model);
        if (r !== 'not-found') return r;
      }

      throw new Error(`Gemini: no usable generateContent model for this API key (tried ${models.join(', ')})`);
    }

    // ── OpenAI GPT-4o-mini ────────────────────────────────────────────────────
    async function callOpenAI(key: string): Promise<ProviderResult> {
      const content: unknown[] = [];
      if (petCtx) content.push({ type: 'text', text: petCtx });
      for (const img of images) content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } });
      content.push({ type: 'text', text: instructionText });

      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 8192,
          temperature: 0.1,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content },
          ],
        }),
      }, VISION_TIMEOUT_MS);
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json() as any;
      if (j.error) throw new Error(`OpenAI error: ${j.error.message}`);
      return {
        text: j.choices?.[0]?.message?.content ?? '',
        provider: 'gpt-4o-mini',
        tokens: j.usage ? { prompt_tokens: j.usage.prompt_tokens, completion_tokens: j.usage.completion_tokens } : null,
        finishReason: j.choices?.[0]?.finish_reason ?? '',
      };
    }

    // ── DeepSeek (text-only — last resort, cannot see images) ───────────────
    // We throw immediately rather than returning a fake "success" with 0 items.
    // Callers should configure GEMINI_API_KEY or OPENAI_API_KEY for vision capability.
    async function callDeepSeek(_key: string): Promise<ProviderResult> {
      throw new Error(
        'DeepSeek does not support vision. Set GEMINI_API_KEY or OPENAI_API_KEY in Supabase Edge Function Secrets to enable image analysis.',
      );
      // Dead code below kept for reference if text-only mode is ever needed:
      const userText = [
        petCtx,
        `[Note: ${imageCount} health record image(s) were uploaded but DeepSeek does not support vision.]`,
        instructionText,
      ].filter(Boolean).join('\n\n');

      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          max_tokens: 4096,
          temperature: 0.1,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userText },
          ],
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json() as any;
      if (j.error) throw new Error(`DeepSeek error: ${j.error.message}`);
      return {
        text: j.choices?.[0]?.message?.content ?? '',
        provider: 'deepseek-chat (text-only)',
        tokens: j.usage ? { prompt_tokens: j.usage.prompt_tokens, completion_tokens: j.usage.completion_tokens } : null,
        finishReason: j.choices?.[0]?.finish_reason ?? '',
      };
    }

    const tAI = Date.now();
    let aiResult: ProviderResult | null = null;

    const providerQueue: Array<{ name: string; key: string | undefined; fn: (k: string) => Promise<ProviderResult> }> = [
      { name: 'gemini',   key: geminiKey,   fn: callGemini },
      { name: 'openai',   key: openaiKey,   fn: callOpenAI },
      { name: 'deepseek', key: deepseekKey, fn: callDeepSeek },
    ];

    for (const p of providerQueue) {
      if (!p.key) { console.log(`[ai] ${p.name}: no key, skipping`); continue; }
      try {
        console.log(`[ai] trying ${p.name}…`);
        aiResult = await p.fn(p.key);
        console.log(`[ai] ${p.name} succeeded in ${Date.now() - tAI}ms`);
        break;
      } catch (err: any) {
        console.error(`[ai] ${p.name} failed: ${err.message} — trying next provider`);
      }
    }

    if (!aiResult) throw new Error('All AI providers failed. Set GEMINI_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY in Supabase Edge Function Secrets.');

    const aiElapsed = Date.now() - tAI;
    const rawText = aiResult.text;
    console.log(`[ai] provider used: ${aiResult.provider}`);
    console.log(`[ai] response length: ${rawText.length}, finish: ${aiResult.finishReason}`);
    console.log(`[ai] raw (first 800):\n${rawText.slice(0, 800)}`);

    // ── Parse JSON from AI response (with truncation salvage) ─────────────────
    const parsed = parseHealthJson(rawText);
    if (!parsed) {
      console.error('[parse] could not parse or salvage JSON. Raw (first 400):', rawText.slice(0, 400));
      throw new Error(`AI returned unparseable JSON. Provider: ${aiResult.provider}. finish: ${aiResult.finishReason}`);
    }
    if (aiResult.finishReason === 'MAX_TOKENS') {
      console.warn(`[parse] response was truncated (MAX_TOKENS) — salvaged ${parsed.items?.length ?? 0} complete items`);
    }
    const extracted: {
      summary: string;
      visit_date?: string | null;
      vet_name?: string | null;
      clinic?: string | null;
      document_patient_name?: string | null;
      document_species?: string | null;
      items: unknown[];
    } = { ...parsed, summary: parsed.summary ?? '', items: dedupeItems(parsed.items ?? []) };

    console.log('[parse] summary:', extracted.summary?.slice(0, 100));
    console.log('[parse] items count (after dedupe):', extracted.items?.length ?? 0);
    console.log('[parse] visit_date:', extracted.visit_date);
    console.log('[parse] vet_name:', extracted.vet_name);
    console.log('[parse] items preview:', JSON.stringify(extracted.items?.slice(0, 2)));

    const elapsed = Date.now() - t0;
    console.log(`[done] total elapsed: ${elapsed}ms`);

    const mismatchResult = detectMismatch(extracted.document_patient_name, pet?.name, extracted.document_species, pet?.species);
    console.log('[mismatch] doc_patient_name:', extracted.document_patient_name, '| pet_name:', pet?.name, '| doc_species:', extracted.document_species, '| pet_species:', pet?.species, '| result:', mismatchResult);

    // ── Write result to DB ────────────────────────────────────────────────────
    const { error: updateErr } = await supabase.from('health_records').update({
      status:           'done',
      ai_summary:       extracted.summary ?? null,
      extracted_data: {
        items:      extracted.items ?? [],
        visit_date: extracted.visit_date ?? null,
        vet_name:   extracted.vet_name ?? null,
        clinic:     extracted.clinic ?? null,
        patient_mismatch:       mismatchResult,
        document_patient_name:  extracted.document_patient_name ?? null,
        document_species:       extracted.document_species ?? null,
      },
      extraction_count: (extracted.items ?? []).length,
      auto_saved:       false,
      processed_at:     new Date().toISOString(),
      error_message:    null,
      debug_info: {
        pages:         pageDebug,
        image_count:   imageCount,
        elapsed_ms:    elapsed,
        ai_elapsed_ms: aiElapsed,
        tokens:        aiResult.tokens,
        finish_reason: aiResult.finishReason,
        model:         aiResult.provider,
        source:        body.base64_pages ? 'base64-direct' : 'url-download',
      },
    }).eq('id', record_id);

    if (updateErr) {
      throw new Error('Failed to save health record: ' + updateErr.message);
    } else {
      console.log('[db] record updated successfully');
    }

    return json({
      success:    true,
      item_count: (extracted.items ?? []).length,
      elapsed_ms: elapsed,
    });

  } catch (err: any) {
    console.error('[FATAL ERROR]', err.message);
    if (record_id_outer) {
      try {
        const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await sb.from('health_records').update({
          status:        'error',
          error_message: err.message ?? 'Unknown error',
          debug_info:    { elapsed_ms: Date.now() - t0, error: err.message },
        }).eq('id', record_id_outer);
        console.log('[error-handler] wrote error status to DB');
      } catch (e2) {
        console.error('[error-handler] failed to write error to DB:', e2);
      }
    }
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
