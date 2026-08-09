// PawBond — Edge Function: analyze-pet-mood
// Accepts a compressed base64 JPEG of a pet and returns a mood analysis via Gemini 2.5 Flash.
// Deploy: supabase functions deploy analyze-pet-mood

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requirePro, requireProForPet, proRequiredResponse } from '../_shared/requirePro.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';
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

const BASE_MOOD_PROMPT = `You are an expert animal behaviorist and veterinary wellness AI.
Analyze this pet photo and return a JSON mood assessment WITH actionable owner advice.

Return ONLY a valid JSON object — no markdown, no commentary, no code fences.

JSON schema (all fields required):
{
  "mood_label": "happy" | "playful" | "tired" | "anxious" | "calm" | "grumpy",
  "mood_score": <integer 0-100, overall wellbeing>,
  "happy_pct":   <integer 0-100>,
  "playful_pct": <integer 0-100>,
  "tired_pct":   <integer 0-100>,
  "anxious_pct": <integer 0-100>,
  "notes": "<2-3 warm sentences describing what you see: posture, eyes, ears, tail, energy>",
  "confidence": <integer 0-100>,
  "situation": "<1-2 sentences explaining WHY the pet might be feeling this way — likely triggers or context>",
  "advice": [
    {
      "action": "<short imperative title, e.g. 'Go for a walk', 'Give a calming massage'>",
      "detail": "<1 sentence of specific, practical guidance for the owner>",
      "priority": "now" | "today" | "ongoing"
    }
  ]
}

Rules for advice:
- Provide 2-4 action items tailored to the detected mood
- "now" = do immediately (e.g. comfort an anxious pet), "today" = within a few hours, "ongoing" = daily habit
- If mood_label is "happy" or "playful": advice should focus on enrichment, bonding, sustaining the good mood
- If mood_label is "tired": advice should focus on rest, hydration, gentle check for illness
- If mood_label is "anxious": advice should focus on immediate calming, removing stressors, environment safety
- If mood_label is "grumpy": advice should focus on giving space, identifying discomfort, quiet time
- If mood_label is "calm": advice should focus on maintaining routine, light engagement
- Keep advice warm, practical, and jargon-free — owner friendly
- happy_pct + playful_pct + tired_pct + anxious_pct should sum to ~100
- mood_score reflects overall wellbeing (not just happy_pct)
- notes must reference specific visual cues observed in the photo
- If image is blurry or pet not clearly visible, set confidence < 40
- IMPORTANT: If no pet is visible in the image, return ONLY: {"pet_detected":false,"message":"No pet found in this photo. Please take a clear photo of your pet's face and body."}`;

function buildSystemPrompt(expectedSpecies?: string): string {
  if (!expectedSpecies) return BASE_MOOD_PROMPT;
  const s = expectedSpecies.trim().toLowerCase();
  return BASE_MOOD_PROMPT + `

SPECIES VALIDATION (mandatory — check this FIRST before mood analysis):
This pet profile is registered as a ${s}. Before doing anything else, verify that the primary animal in the photo is a ${s}.
- If the animal IS a ${s}: proceed with the full mood JSON analysis above.
- If the animal is clearly NOT a ${s} (e.g. photo shows a cat but profile is a dog): return ONLY:
  {"species_match":false,"species_found":"<what animal you actually see, e.g. cat>","message":"Photo shows a <species_found>, but this profile is for a ${s}. Please upload a photo of your ${s}."}
- If you are uncertain or cannot clearly identify the species: proceed with normal mood analysis — do not block on ambiguity.`;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth + role check ───────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const { data: { user }, error: authErr } = await (await import('https://esm.sh/@supabase/supabase-js@2'))
      .createClient(supabaseUrl, anonKey)
      .auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const svcClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json() as {
      image_base64: string;   // base64 JPEG, no data URI prefix
      mime_type?: string;
      pet_id?: string;        // used for role check + context-tier inheritance
      pet_name?: string;
      pet_species?: string;
      pet_breed?: string;
    };

    if (!body.image_base64) return json({ error: 'image_base64 is required' }, 400);

    // Context-tier check: caretakers inherit pet owner's Pro subscription.
    // Fall back to own tier when no pet_id (scan without pet context).
    const proStatus = body.pet_id
      ? await requireProForPet(svcClient, user.id, body.pet_id)
      : await requirePro(svcClient, user.id);
    if (proStatus === 'expired') return proRequiredResponse();

    // Free users get realAiScansPerDay (2) real AI scans per day; check quota.
    // Gate applies regardless of whether pet_id is present — no bypass via omission.
    const FREE_AI_QUOTA = 2;
    if (proStatus === 'free') {
      if (!body.pet_id) {
        // No pet context: enforce quota against the user directly (user-level scan count)
        const today = new Date().toISOString().slice(0, 10);
        const { data: usageRow } = await svcClient
          .from('daily_scan_counts')
          .select('ai_attempts')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();
        if ((usageRow?.ai_attempts ?? 0) >= FREE_AI_QUOTA) {
          return json({ error: 'Daily AI quota reached', code: 'quota_exceeded' }, 429);
        }
      }
    }
    if (proStatus === 'free' && body.pet_id) {
      // Use the owner's local date so server and client agree on "today".
      const { data: profileRow } = await svcClient
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .single();
      const tz = profileRow?.timezone;
      const today = tz
        ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
        : new Date().toISOString().slice(0, 10);
      const { data: scanRow } = await svcClient
        .from('daily_scan_counts')
        .select('ai_attempts')
        .eq('pet_id', body.pet_id)
        .eq('date', today)
        .maybeSingle();
      if ((scanRow?.ai_attempts ?? 0) >= FREE_AI_QUOTA) {
        return json({ error: 'Daily AI quota reached', code: 'quota_exceeded' }, 429);
      }
    }

    // If pet_id supplied, verify caller can scan (owner/caretaker/caregiver, not viewer)
    if (body.pet_id) {
      const supa = (await import('https://esm.sh/@supabase/supabase-js@2'))
        .createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: ownerRow } = await supa.from('pets').select('id')
        .eq('id', body.pet_id).eq('owner_id', user.id).maybeSingle();
      const { data: familyRow } = await supa.from('pet_family').select('role')
        .eq('pet_id', body.pet_id).eq('user_id', user.id).maybeSingle();
      const canScan = !!ownerRow || ['caretaker', 'caregiver'].includes(familyRow?.role ?? '');
      if (!canScan) return json({ error: 'Viewers cannot run mood scans' }, 403);
    }

    const geminiKey  = Deno.env.get('GEMINI_API_KEY');
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!geminiKey && !deepseekKey) return json({ error: 'No AI provider configured' }, 500);

    const chain = (await getChainConfig()).mood_scan;

    const mime = body.mime_type ?? 'image/jpeg';
    const petCtx = [
      body.pet_name    ? `Pet name: ${body.pet_name}`   : null,
      body.pet_species ? `Species: ${body.pet_species}` : null,
      body.pet_breed   ? `Breed: ${body.pet_breed}`     : null,
    ].filter(Boolean).join(', ');

    const systemPrompt = buildSystemPrompt(body.pet_species);

    let rawText = '';
    let usedModel = '';
    let lastError = '';

    for (const slot of chain) {
      const timeoutMs = slot.timeoutSecs * 1000;
      try {
        if ((slot.provider === 'gemini' || slot.provider === 'custom') && geminiKey) {
          const parts: unknown[] = [];
          if (petCtx) parts.push({ text: petCtx });
          parts.push({ inlineData: { mimeType: mime, data: body.image_base64 } });
          parts.push({ text: "Analyze this pet's mood from the photo." });
          const reqBody = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
          };
          console.log(`[analyze-pet-mood] trying gemini/${slot.model} timeout=${slot.timeoutSecs}s`);
          const res = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${slot.model}:generateContent?key=${geminiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) },
            timeoutMs,
          );
          console.log(`[analyze-pet-mood] gemini/${slot.model} → ${res.status}`);
          if (res.status === 404) { lastError = `${slot.model} not found`; continue; }
          if (res.status === 429) { lastError = `${slot.model} quota exceeded`; break; }
          if (!res.ok) { lastError = `${slot.model} HTTP ${res.status}`; continue; }
          const j = await res.json() as any;
          if (j.error) { lastError = j.error.message; continue; }
          const t = (j.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
          if (!t) { lastError = 'empty response'; continue; }
          rawText = t; usedModel = slot.model; break;
        } else if (slot.provider === 'deepseek' && deepseekKey) {
          // DeepSeek doesn't support vision — skip for mood scan
          console.log(`[analyze-pet-mood] skipping deepseek slot (vision not supported)`);
          continue;
        }
      } catch (e: any) {
        lastError = e.message ?? String(e);
        console.warn(`[analyze-pet-mood] ${slot.provider}/${slot.model} failed:`, lastError);
      }
    }

    if (!rawText) {
      try {
        const sb = (await import('https://esm.sh/@supabase/supabase-js@2'))
          .createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await sb.from('api_usage_logs').insert({
          user_id: user.id, api_type: 'gemini_mood', success: false, error_msg: lastError,
        });
      } catch { /* non-fatal */ }
      return json({ error: `All AI slots failed: ${lastError}` }, 502);
    }

    // ── Parse JSON result ───────────────────────────────────────────────────
    let result: any;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return json({ error: 'No JSON in AI response' }, 502);
      result = JSON.parse(jsonMatch[0]);
      console.log(`[analyze-pet-mood] ${usedModel} parsed OK, mood_label: ${result.mood_label}, pet_detected: ${result.pet_detected}`);
    } catch (e: any) {
      return json({ error: `JSON parse failed: ${e.message}` }, 502);
    }

    if (result.pet_detected === false) {
      return json({
        pet_detected: false,
        message: result.message ?? 'No pet found in this photo. Please take a clear photo of your pet.',
      }, 422);
    }
    if (result.species_match === false) {
      return json({
        species_match: false,
        species_found: result.species_found ?? 'unknown pet',
        message: result.message ?? `This photo doesn't appear to be the expected species.`,
      }, 422);
    }

    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v ?? 0)));
    const happy_pct   = clamp(result.happy_pct);
    const playful_pct = clamp(result.playful_pct);
    const tired_pct   = clamp(result.tired_pct);
    const anxious_pct = clamp(result.anxious_pct);
    const mood_score  = clamp(result.mood_score);
    const confidence  = clamp(result.confidence ?? 80);
    const validLabels = ['happy', 'playful', 'tired', 'anxious', 'calm', 'grumpy'];
    const mood_label  = validLabels.includes(result.mood_label) ? result.mood_label : 'calm';
    const situation   = typeof result.situation === 'string' ? result.situation : null;
    const advice      = Array.isArray(result.advice)
      ? result.advice.filter((a: any) => a?.action && a?.detail).slice(0, 4) : [];

    try {
      const sb = (await import('https://esm.sh/@supabase/supabase-js@2'))
        .createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('api_usage_logs').insert({
        user_id: user.id, api_type: 'gemini_mood', subcategory: usedModel,
        success: true, metadata: { pet_id: body.pet_id ?? null, mood_label },
      });
    } catch { /* non-fatal */ }

    return json({
      mood_label, mood_score, happy_pct, playful_pct, tired_pct, anxious_pct,
      notes: result.notes ?? `Your pet looks ${mood_label} in this photo.`,
      situation, advice, confidence, model: usedModel, source: 'ai',
    });
  } catch (err: any) {
    console.error('[analyze-pet-mood] error:', err.message);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
