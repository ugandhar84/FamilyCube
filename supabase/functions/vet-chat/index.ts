// PawBond — Edge Function: vet-chat
// Priority chain: DeepSeek → Gemini fallback (per vet_chat config in app_settings)
// Deploy: supabase functions deploy vet-chat

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

const VET_SYSTEM_PROMPT = `You are PetDoc, a friendly and knowledgeable AI veterinary assistant for PawBond.
You help pet owners understand their pets' health, behavior, and training needs.

IMPORTANT RULES:
- Always recommend consulting a real vet for diagnosis, medication, or emergencies
- For emergencies (seizures, difficulty breathing, trauma, poisoning), immediately say to call a vet NOW
- Be warm, empathetic, and jargon-free — talk like a trusted friend who happens to be a vet
- Give practical, actionable advice owners can use today
- Ask clarifying questions when symptoms are vague
- Reference the pet's specific details (name, species, breed, age) in your response when relevant
- Keep responses concise (3-5 sentences max per point) but thorough
- NEVER claim to diagnose — always say "this could be..." or "common causes include..."
- DISCLAIMER: Always end responses about health concerns with: "Remember, I'm an AI assistant — your vet knows your pet best."

SPECIES-SPECIFIC GUIDANCE (apply when species is known):
- DOG: Consider breed-specific predispositions. Dogs can eat many human foods but not grapes, raisins, xylitol, chocolate, onions, or macadamia nuts. Parvovirus is a key concern in unvaccinated dogs.
- CAT: Cats are obligate carnivores — never recommend vegetarian diets. Many human medications (ibuprofen, acetaminophen, aspirin) are severely toxic to cats. Cats hide pain; subtle behavior changes matter. Urinary blockage is an emergency in male cats. Lilies (all parts) are lethal to cats.
- RABBIT: Rabbits need unlimited hay (80% of diet) + leafy greens; no iceberg lettuce, sugary fruits only as rare treats. GI stasis is a life-threatening emergency. Rabbits cannot vomit — any bloat/gas is urgent. Handle gently — spinal injury from kicking is a real risk.
- BIRD: Teflon/PTFE fumes are immediately fatal to birds. Avocado, chocolate, onions, and caffeine are toxic. Birds hide illness until critical — any lethargy in a bird is urgent. Crop issues (sour crop, crop impaction) need prompt vet care.
- OTHER (reptile/small mammal): Note species when giving advice. Reptiles need species-appropriate UVB and temperature gradients. Hamsters/guinea pigs have different dental, dietary, and housing needs — clarify the exact species before advising.`;


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
      messages: { role: 'user' | 'model'; text: string }[];
      pet_id?: string;
      pet_name?: string;
      pet_species?: string;
      pet_breed?: string;
      pet_age_years?: number;
      pet_weight_kg?: number;
    };

    if (!body.pet_id) return json({ error: 'pet_id required' }, 400);
    const proStatus = await requireUltimateForPet(svcClient, user.id, body.pet_id);
    if (proStatus === 'free' || proStatus === 'expired') return ultimateRequiredResponse();

    if (!body.messages?.length) return json({ error: 'messages required' }, 400);

    const lastUserText = [...body.messages].reverse().find(m => m.role === 'user')?.text ?? '';
    const modResult = await moderateContent(lastUserText, Deno.env.get('OPENAI_API_KEY'));
    if (modResult.blocked) return blockedResponse(modResult);

    const petCtx = [
      body.pet_name    ? `Pet name: ${body.pet_name}` : null,
      body.pet_species ? `Species: ${body.pet_species}` : null,
      body.pet_breed   ? `Breed: ${body.pet_breed}` : null,
      body.pet_age_years != null ? `Age: ${body.pet_age_years} years` : null,
      body.pet_weight_kg != null ? `Weight: ${body.pet_weight_kg}kg` : null,
    ].filter(Boolean).join(' | ');

    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    const geminiKey   = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey && !deepseekKey) return json({ error: 'No AI provider configured' }, 500);

    const chain = (await getChainConfig()).vet_chat;

    const result = await runChain(chain, {
      geminiKey,
      deepseekKey,
      tag: 'vet-chat',
      buildGeminiBody: () => ({
        systemInstruction: { parts: [{ text: VET_SYSTEM_PROMPT }] },
        contents: body.messages.map((m, i) => ({
          role: m.role,
          parts: [{ text: i === 0 && petCtx ? `[Pet info: ${petCtx}]\n\n${m.text}` : m.text }],
        })),
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
      buildDeepSeekMessages: () => {
        const msgs: { role: string; content: string }[] = [
          { role: 'system', content: VET_SYSTEM_PROMPT },
        ];
        body.messages.forEach((m, i) => {
          msgs.push({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: i === 0 && petCtx ? `[Pet info: ${petCtx}]\n\n${m.text}` : m.text,
          });
        });
        return msgs;
      },
      deepseekExtra: { max_tokens: 1024, temperature: 0.3 },
    });

    return json({ reply: result.text });
  } catch (e: any) {
    console.error('[vet-chat] error:', e.message);
    return json({ error: e.message ?? 'AI unavailable' }, 503);
  }
});
