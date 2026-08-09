// PawBond — Edge Function: symptom-scan
// Text-only: symptom_scan chain (DeepSeek first → Gemini fallback)
// With photo: general_vision chain (Gemini vision only — DeepSeek has no vision)
// Deploy: supabase functions deploy symptom-scan

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUltimateForPet, ultimateRequiredResponse } from '../_shared/requirePro.ts';
import { moderateContent, blockedResponse } from '../_shared/moderate.ts';
import { getChainConfig, runChain } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const JSON_SCHEMA = `{
  "urgency": "emergency" | "see_vet_soon" | "monitor" | "normal",
  "urgency_label": "<short human label, e.g. 'Go to vet today'>",
  "summary": "<2-3 sentences describing your assessment>",
  "possible_causes": ["<cause 1>", "<cause 2>", "<cause 3>"],
  "what_to_watch": ["<warning sign 1>", "<warning sign 2>"],
  "home_care": ["<actionable step 1>", "<actionable step 2>"],
  "vet_needed": <true if vet visit recommended>,
  "confidence": <integer 0-100>,
  "disclaimer": "This is an AI assessment, not a diagnosis. Always consult your veterinarian."
}`;

const URGENCY_RULES = `Urgency levels:
- "emergency": Immediate vet visit required (seizures, difficulty breathing, trauma, collapse, poisoning)
- "see_vet_soon": Vet visit within 24-48 hours
- "monitor": Watch at home, see vet if worsens
- "normal": Looks healthy, no concern

Rules:
- Be conservative — when in doubt, recommend vet visit
- possible_causes: list 2-4 realistic causes, most likely first
- home_care: practical steps owner can do right now
- what_to_watch: specific warning signs that mean "go to vet now"`;

const SPECIES_RULES = `Species-specific emergency flags (escalate urgency when relevant):
- CAT: male cat straining to urinate = EMERGENCY. Any Lily ingestion = EMERGENCY. Acetaminophen/ibuprofen = EMERGENCY.
- DOG: grape/raisin/xylitol ingestion = EMERGENCY. Bloat/GDV (distended abdomen, unproductive retching) = EMERGENCY.
- RABBIT: not eating or defecating for >4 hours = EMERGENCY (GI stasis). Labored breathing = EMERGENCY.
- BIRD: any lethargy, fluffed feathers, or sitting on cage floor = EMERGENCY (birds hide illness until critical). PTFE fume exposure = EMERGENCY.
Use species context from pet info to calibrate possible_causes and home_care advice.`;

const VISION_PROMPT = `You are an expert veterinary AI assistant. Analyze the pet photo and symptom description provided.
Return ONLY a valid JSON object — no markdown, no code fences.

JSON schema (all fields required):
${JSON_SCHEMA}

${URGENCY_RULES}
${SPECIES_RULES}
- If no pet visible in image: return { "error": "no_pet_detected", "message": "No pet visible. Please retake the photo." }`;

const TEXT_PROMPT = `You are an expert veterinary AI assistant. Analyze the symptom description provided by the pet owner.
Return ONLY a valid JSON object — no markdown, no code fences.

JSON schema (all fields required):
${JSON_SCHEMA}

${URGENCY_RULES}
${SPECIES_RULES}`;

const URGENCY_EMOJI: Record<string, string> = {
  emergency:    '🚨',
  see_vet_soon: '⚠️',
  monitor:      '👁️',
  normal:       '✅',
};

async function saveAndNotify(
  svcClient: ReturnType<typeof createClient>,
  userId: string,
  body: { symptoms: string; pet_id?: string; pet_name?: string; photo_url?: string },
  result: Record<string, unknown>,
): Promise<Response> {
  const { data: saved } = await svcClient.from('symptom_scan_results').insert({
    user_id:       userId,
    pet_id:        body.pet_id ?? null,
    symptoms_text: body.symptoms,
    photo_url:     body.photo_url ?? null,
    urgency:       result.urgency,
    result,
  }).select('id').single();

  const scanId = saved?.id ?? null;

  try {
    const { data: tokens } = await svcClient
      .from('push_tokens').select('token')
      .eq('user_id', userId).like('token', 'ExponentPushToken%');

    if (tokens?.length) {
      const petName   = body.pet_name ? `${body.pet_name}'s` : 'Your pet\'s';
      const urgency   = String(result.urgency ?? 'monitor');
      const emoji     = URGENCY_EMOJI[urgency] ?? '🔬';
      const label     = String(result.urgency_label ?? urgency);
      const title     = `${emoji} Symptom analysis ready`;
      const notifBody = `${petName} scan result: ${label}`;

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map((t: { token: string }) => ({
          to: t.token, sound: 'default', title, body: notifBody,
          data: { type: 'symptom_scan_ready', scan_id: scanId, pet_id: body.pet_id ?? null },
          priority: urgency === 'emergency' ? 'high' : 'normal',
          channelId: urgency === 'emergency' ? 'health_alerts' : 'reminders',
        }))),
      });

      await svcClient.from('notification_logs').insert({
        user_id: userId, title, body: notifBody,
        type: 'symptom_scan_ready',
        data: { scan_id: scanId, pet_id: body.pet_id ?? null, urgency },
      });
    }
  } catch (e) {
    console.warn('[symptom-scan] push notification failed:', e);
  }

  return json({ ...result, _scan_id: scanId });
}

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

    const svcClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json() as {
      image_base64?: string;
      mime_type?: string;
      symptoms: string;
      pet_id?: string;
      pet_name?: string;
      pet_species?: string;
      pet_breed?: string;
      pet_age_years?: number;
    };

    if (!body.pet_id) return json({ error: 'pet_id required' }, 400);
    const proStatus = await requireUltimateForPet(svcClient, user.id, body.pet_id);
    if (proStatus === 'free' || proStatus === 'expired') return ultimateRequiredResponse();

    if (!body.symptoms) return json({ error: 'symptoms required' }, 400);

    const modResult = await moderateContent(body.symptoms, Deno.env.get('OPENAI_API_KEY'));
    if (modResult.blocked) return blockedResponse(modResult);

    const hasPhoto    = !!body.image_base64;
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    const geminiKey   = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey && !deepseekKey) return json({ error: 'No AI provider configured' }, 500);

    const cfg   = await getChainConfig();
    // For vision requests DeepSeek slots are skipped (no vision support); use general_vision chain.
    const chain = hasPhoto ? cfg.general_vision : cfg.symptom_scan;

    const petCtx = [
      body.pet_name    ? `Pet name: ${body.pet_name}` : null,
      body.pet_species ? `Species: ${body.pet_species}` : null,
      body.pet_breed   ? `Breed: ${body.pet_breed}` : null,
      body.pet_age_years != null ? `Age: ${body.pet_age_years} years` : null,
    ].filter(Boolean).join(', ');

    const userTextParts = [
      petCtx ? `Pet info: ${petCtx}` : null,
      `Owner-reported symptoms: ${body.symptoms}`,
      'Analyze the symptoms and return your assessment as JSON.',
    ].filter(Boolean).join('\n\n');

    const result = await runChain(chain, {
      geminiKey,
      // Skip deepseek for vision scans — it has no image support
      deepseekKey: hasPhoto ? undefined : deepseekKey,
      tag: 'symptom-scan',
      buildGeminiBody: () => {
        const parts = hasPhoto
          ? [
              ...(petCtx ? [{ text: `Pet info: ${petCtx}` }] : []),
              { text: `Owner-reported symptoms: ${body.symptoms}` },
              { inlineData: { mimeType: body.mime_type ?? 'image/jpeg', data: body.image_base64 } },
              { text: 'Analyze the symptoms and photo and return your assessment as JSON.' },
            ]
          : [{ text: userTextParts }];
        return {
          systemInstruction: { parts: [{ text: hasPhoto ? VISION_PROMPT : TEXT_PROMPT }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        };
      },
      buildDeepSeekMessages: () => [
        { role: 'system', content: TEXT_PROMPT },
        { role: 'user',   content: userTextParts },
      ],
      deepseekExtra: { max_tokens: 2048, temperature: 0.1 },
    });

    const clean  = result.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed.error) {
      console.warn('[symptom-scan] AI returned error response:', parsed.error);
      return json(parsed);
    }

    return await saveAndNotify(svcClient, user.id, body, parsed);
  } catch (e: any) {
    console.error('[symptom-scan] error:', e.message);
    return json({ error: e.message ?? 'AI unavailable' }, 503);
  }
});
