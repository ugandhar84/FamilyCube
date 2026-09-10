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

If the document DOES contain medical content, decide if it is primarily a MEDICATION prescription, a VACCINE record, or both, then extract EVERY medication and/or EVERY vaccine listed — not just the first one.

Discharge summaries and multi-dose vaccine cards commonly list several medications or several vaccines on one
document. Extract ALL of them as separate entries in the "medications"/"vaccines" arrays below — dropping a drug or
a dose silently is a real safety issue, not just a minor omission, so never silently pick only one or merge multiple
items into a single entry. If a document is genuinely too crowded/long to extract every single item with confidence
(e.g. 15+ entries and some are only partially legible), extract as many complete, confident entries as you can and
add a top-level "additional_items_found": true with "additional_items_note": a one-sentence description of what
else was on the document but not extracted (e.g. "Also lists 3 more vaccines in the bottom row that were too blurry
to read reliably — please add those separately").

For a MEDICATION prescription, extract:
- name: drug/medication name (brand or generic)
- dosage: e.g. "10mg", "500mg/5ml" — CRITICAL: if the numeric dose is even slightly unclear, blurry, or ambiguous
  between two readings (e.g. could be "10mg" or "100mg", decimal point unclear), do NOT guess a number. Leave dosage
  as null and add a note in "notes" describing exactly what's ambiguous (e.g. "Dosage number unclear — could be 10mg
  or 100mg, please verify against the original"). A wrong guessed number is far worse than an honest blank, since
  this can become an actual medication record someone relies on.
- frequency: e.g. "Once daily", "Twice a day", "Every 8 hours"
- duration: e.g. "7 days", "30 days", "Ongoing"
- instructions: any special instructions (e.g. "Take with food", "Avoid sunlight")
- refills: number of refills AUTHORIZED (not refills already used) — if the label says "refills used: 1 of 3", the
  authorized count is 3, not 1; if it's unclear which number is meant, leave this null rather than guessing
- prescriber: doctor/provider name
- prescribed_date: "YYYY-MM-DD" format
- pharmacy: pharmacy name if printed
- notes: any other relevant notes, PLUS any ambiguity/uncertainty flags from above

For a VACCINE record, extract:
- vaccine_name: full vaccine name (e.g. "Influenza", "MMR", "COVID-19 mRNA")
- manufacturer: brand/manufacturer name if visible
- lot_number: lot/batch number if visible
- administered_date: "YYYY-MM-DD"
- dose_number: e.g. 1, 2 (integer or null) — same rule as dosage above: if unclear/ambiguous, null, don't guess
- total_doses: total doses in series if stated (integer or null)
- next_due_date: "YYYY-MM-DD" for next dose/booster if stated
- site: injection site if visible (e.g. "Left arm")
- administered_by: provider or clinic name

Return ONLY a valid JSON object with no markdown fences or commentary:
{
  "doc_type": "medication" | "vaccine" | "both" | "none",
  "reason": "only present when doc_type is none",
  "confidence": "high" | "low",
  "confidence_note": "only present when confidence is low — one short sentence on what's unclear and why the user should double-check the original document",
  "additional_items_found": false,
  "additional_items_note": "only present when additional_items_found is true",
  "medications": [ { ... } ],
  "vaccines": [ { ... } ]
}

"medications" and "vaccines" are ARRAYS — one entry per medication/vaccine found, in the order they appear on the
document (top to bottom, left to right). A document with a single medication and nothing else still returns
"medications" as a one-element array, never a bare object. Include only the array(s) relevant to the document type
(a pure vaccine card returns "vaccines" only, no "medications" key at all).
If a field is not visible or not applicable for a given entry, use null or an empty string for that field.
Set confidence to "low" whenever ANY field (especially dosage/dose_number) was hard to read, the image quality was
poor, or you had to choose between two plausible readings — this signal is what lets a parent know to double-check
the original document before trusting a health record, so use it honestly rather than defaulting to "high."`;

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
    // Was 1024, then 2048 — still not enough. Live-reported via edge logs:
    // a real immunization card listing 10+ vaccines produced a genuinely
    // long "additional_items_note" (the model correctly tried to name every
    // extra vaccine found) and got cut off mid-string at 2048 tokens,
    // failing extractJson with no closing brace to recover. additional_
    // items_note has no real upper bound (a busy multi-dose vaccine card
    // can legitimately need to list a dozen+ items), so this needs real
    // headroom, not just a bump — matches parse-flyer's own 16384 budget
    // for the same class of "list everything visible" extraction.
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  };

  // Was 15s — too tight now that this call also carries a full retry (both
  // primary and retry go through this exact function, see the handler's
  // own comment on why the retry re-calls callGeminiVision instead of a
  // separate lighter path). Live-reported via edge logs: a 3-image request
  // against the 8192-token budget genuinely took longer than 15s under
  // load, so BOTH the primary call AND its retry timed out back-to-back —
  // there was no timeout headroom left to actually benefit from having a
  // retry at all. Matches parse-flyer's own 35s budget for the same class
  // of multi-image, high-token-budget vision extraction.
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 35_000);

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
  const j = await res.json();
  const text: string = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini returned empty content');
  return text;
}

// ── JSON extraction ────────────────────────────────────────────────────────────

// A response cut off mid-string (e.g. maxOutputTokens hit while listing a
// long additional_items_note) still has every field BEFORE the cutoff
// intact — the core doc_type/medication/vaccine data a busy vaccine card
// needs was very likely already written before the model got to the long
// trailing note. Rather than lose the whole scan over one truncated
// trailing field, close the dangling string/object and drop whatever key
// was mid-write, keeping everything that completed. Best-effort: only
// used as a last resort when a straight parse and the brace-matching
// fallback below have both already failed.
function tryRepairTruncated(cleaned: string): Record<string, unknown> | null {
  // Track string state AND a bracket-nesting stack while scanning forward,
  // remembering the last comma seen outside a string at each nesting
  // depth. Now that the schema includes "medications"/"vaccines" ARRAYS (a
  // busy multi-item document can truncate mid-way through the 2nd or 3rd
  // array element, not just mid a top-level field), naive brace-only
  // counting doesn't work: closing an unclosed '[' needs a ']' BEFORE the
  // enclosing '}', in the correct order — repair must track '{' vs '['
  // separately, not just count total opens/closes.
  let inString = false;
  const stack: ('{' | '[')[] = [];
  // lastSafeCommaAtDepth[i] = index of the last top-of-stack-depth-i comma
  // seen outside a string — i.e. a comma that safely separates complete
  // sibling elements/fields at that nesting level.
  const lastSafeCommaAtDepth: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === '"' && cleaned[i - 1] !== '\\') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
    else if (c === ',') lastSafeCommaAtDepth[stack.length] = i;
  }
  if (stack.length === 0) return null; // nothing actually unclosed — not our case
  let repaired = cleaned;
  if (inString) {
    // Cut back to the last comma at the CURRENT nesting depth (where the
    // dangling string actually started) — not just the last comma anywhere,
    // which could be a shallower or deeper sibling's separator instead of
    // this one's, giving a structurally wrong cut point.
    const cut = lastSafeCommaAtDepth[stack.length];
    if (cut === undefined) return null;
    repaired = repaired.slice(0, cut);
  } else {
    // Not mid-string — cut off right after a value, possibly with a
    // trailing comma from an unfinished next field/element.
    repaired = repaired.replace(/,\s*$/, '');
  }
  // Re-derive the stack after the cut (the slice may have popped some
  // opens along with the dropped dangling content) and close everything
  // still open, innermost-first, using the correct bracket for each.
  let closeStack: ('{' | '[')[] = [];
  let scanString = false;
  for (let i = 0; i < repaired.length; i++) {
    const c = repaired[i];
    if (c === '"' && repaired[i - 1] !== '\\') { scanString = !scanString; continue; }
    if (scanString) continue;
    if (c === '{' || c === '[') closeStack.push(c);
    else if (c === '}' || c === ']') closeStack.pop();
  }
  while (closeStack.length) {
    repaired += closeStack.pop() === '{' ? '}' : ']';
  }
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function extractJson(raw: string): Record<string, unknown> {
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find the JSON object within the response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { /* fall through to truncation repair below */ }
    }
    // The object never closed at all (maxOutputTokens cut it off mid-
    // string/mid-field) — match[0] above only matches a response that DOES
    // contain a trailing '}', which a genuinely truncated one won't.
    // Live-reported via edge logs: a real immunization card with 10+
    // vaccines got cut off mid-"additional_items_note" string, losing the
    // whole scan (including the already-complete doc_type/vaccine fields)
    // over one long trailing note.
    const repaired = tryRepairTruncated(cleaned);
    if (repaired) {
      console.warn('[parse-prescription] extractJson: recovered truncated response, dropped incomplete trailing field');
      return repaired;
    }
    // Was a bare "Could not parse JSON from AI response" with no visibility
    // into WHY — live-reported failure had no JSON object anywhere in the
    // response at all (Gemini most likely returned plain-text commentary/a
    // refusal instead of the requested JSON), and there was no way to tell
    // that apart from a genuinely malformed-JSON case without this. Logged
    // (not returned to the client — could contain document text) so edge
    // logs show the actual model output on the next occurrence.
    console.error('[parse-prescription] extractJson: no JSON object found, raw response:', cleaned.slice(0, 500));
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
    let parsed: Record<string, unknown> | undefined;

    try {
      rawText = await callGeminiVision(geminiKey, primary, extras);
      // extractJson throwing here (e.g. a response truncated by
      // maxOutputTokens, or a model reply that isn't valid JSON at all) is
      // just as real a per-model failure as an HTTP error — previously
      // this throw wasn't caught by this try block, so it skipped the
      // 1.5-flash fallback entirely and fell straight to the outer 500
      // handler, turning a single bad 2.5-flash reply into a hard failure
      // instead of a retry (live-reported: "couldn't parse JSON" error).
      parsed = extractJson(rawText);
    } catch (e1) {
      console.warn('[parse-prescription] gemini-2.5-flash failed, retrying:', e1);
      usedModel = 'gemini-2.5-flash-retry';
      try {
        // Was callGeminiFallback — a differently-shaped request (no
        // systemInstruction, no extraPages, half the token budget) that
        // dropped the extra scanned pages entirely on retry. Live-reported:
        // the primary call failed with Gemini's own "Unable to process
        // input image" (a transient vision-pipeline error, not a real
        // problem with the image — retrying the exact same image later
        // succeeded), then this differently-built retry came back 200 OK
        // but with plain-text content extractJson couldn't find a JSON
        // object in at all. Re-calling callGeminiVision with the SAME
        // request shape (all pages, same token budget, same system
        // instruction) gives a transient failure a real chance to resolve,
        // instead of falling back to a request shape that's more likely to
        // produce a different kind of bad response.
        rawText = await callGeminiVision(geminiKey, primary, extras);
        parsed = extractJson(rawText);
      } catch (e2) {
        console.error('[parse-prescription] all models failed:', e2);
        return json({ error: 'AI parsing failed. Please enter details manually.' }, 422);
      }
    }

    return json({ ...parsed, _model: usedModel });
  } catch (err: any) {
    console.error('[parse-prescription] unhandled error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
