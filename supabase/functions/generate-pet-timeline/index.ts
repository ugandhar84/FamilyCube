// PawBond — Edge Function: generate-pet-timeline
// Analyzes pet journal data via DeepSeek (with Gemini 2.5 Flash fallback)
// and generates timeline entries. Pro-only feature.
// Deploy: supabase functions deploy generate-pet-timeline

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireProForPet, proRequiredResponse } from '../_shared/requirePro.ts';
import { fetchWithTimeout, TEXT_TIMEOUT_MS } from '../_shared/fetchWithTimeout.ts';
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

const TIMELINE_PROMPT = `You are a pet chronicle AI that transforms journal data into meaningful timeline milestones.
Analyze this pet's journal and extract the most significant, memorable moments that should be highlighted on their timeline.

Return ONLY a valid JSON array — no markdown, no commentary, no code fences.

JSON schema (array of objects):
[
  {
    "title": "<short milestone title, e.g. 'First vet visit', 'Birthday', 'Learned to sit'>",
    "description": "<1-2 sentences describing the moment and why it matters>",
    "event_date": "<YYYY-MM-DD, the date this happened>",
    "category": "milestone" | "health" | "achievement" | "moment",
    "icon": "<emoji that represents this milestone>"
  }
]

Rules:
- Extract 5-10 of the MOST meaningful events from the journal
- milestone = first experiences, adoptions, significant changes (breed recognition, age milestones)
- health = major vet visits, vaccinations, health milestones, lab results
- achievement = training progress, behavioral improvements, learned behaviors
- moment = touching or funny moments from notes, memorable interactions
- Each event_date must be in YYYY-MM-DD format
- Focus on positive, memorable moments that tell the pet's story
- Include pet name in descriptions when available
- Rank by significance (earliest/most impactful first)
- For health_records: use ai_summary as the description. If extracted_data contains items where is_abnormal=true, include those as separate health entries with their notes — these are important clinical findings worth highlighting on the timeline
- If no meaningful data exists, return an empty array []`;

function compactJournal(journalData: Record<string, any>): Record<string, any> {
  const out = { ...journalData };
  if (Array.isArray(out.health_records)) {
    out.health_records = out.health_records.map((r: any) => ({
      file_name: r.file_name,
      doc_type: r.doc_type,
      created_at: r.created_at,
      ai_summary: r.ai_summary,
      abnormal_findings: (r.extracted_data?.items ?? [])
        .filter((it: any) => it.is_abnormal)
        .map((it: any) => ({ title: it.title, raw_value: it.raw_value, unit: it.unit, notes: it.notes })),
    }));
  }
  return out;
}

async function analyzeWithDeepSeek(
  journalData: Record<string, any>,
  petName: string,
  apiKey: string,
  dsModels: string[] = ['deepseek-chat'],
): Promise<any> {
  const journalSummary = JSON.stringify(compactJournal(journalData), null, 2).slice(0, 8000);
  const prompt = `Pet name: ${petName}\n\nJournal data:\n${journalSummary}`;

  const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: dsModels[0] ?? 'deepseek-chat',
      messages: [
        { role: 'system', content: TIMELINE_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  }, TEXT_TIMEOUT_MS);

  if (!res.ok) {
    const errText = await res.text();
    console.error('[generate-pet-timeline] DeepSeek error:', errText.slice(0, 300));
    throw new Error(`DeepSeek ${res.status}: ${errText.slice(0, 120)}`);
  }

  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error('Empty response from DeepSeek');

  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in response');

  return JSON.parse(jsonMatch[0]);
}

async function analyzeWithGemini(
  journalData: Record<string, any>,
  petName: string,
  apiKey: string,
  geminiModels: string[] = ['gemini-2.5-flash', 'gemini-2.0-flash'],
): Promise<any> {
  const journalSummary = JSON.stringify(compactJournal(journalData), null, 2).slice(0, 8000);
  const prompt = `Pet name: ${petName}\n\nJournal data:\n${journalSummary}`;

  const models = geminiModels;

  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: TIMELINE_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          }),
        },
        TEXT_TIMEOUT_MS,
      );

      if (res.status === 404) { console.error(`[generate-pet-timeline] ${model} 404 not found`); continue; }
      if (!res.ok) {
        const errBody = await res.text();
        console.error(`[generate-pet-timeline] ${model} error ${res.status}:`, errBody.slice(0, 300));
        continue;
      }

      const data = await res.json() as any;
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      console.log(`[generate-pet-timeline] ${model} content length:`, content.length, 'finishReason:', data.candidates?.[0]?.finishReason);
      if (!content) { console.error(`[generate-pet-timeline] ${model} empty content, candidate:`, JSON.stringify(data.candidates?.[0]).slice(0, 200)); continue; }

      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      return JSON.parse(jsonMatch[0]);
    } catch (e: any) {
      console.error(`[generate-pet-timeline] ${model} failed:`, e.message);
      continue;
    }
  }

  throw new Error('All Gemini models failed');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { data: { user }, error: authErr } = await (
      await import('https://esm.sh/@supabase/supabase-js@2')
    )
      .createClient(supabaseUrl, anonKey)
      .auth.getUser(authHeader.replace('Bearer ', ''));

    if (authErr || !user) { console.error('[timeline] auth failed', authErr?.message); return json({ error: 'Unauthorized' }, 401); }

    console.log('[timeline] user:', user.id);
    const svcClient = createClient(supabaseUrl, svcKey);
    const body = await req.json() as { pet_id: string; year: number };
    const { pet_id, year } = body;
    console.log('[timeline] body:', { pet_id, year });

    if (!pet_id) return json({ error: 'pet_id is required' }, 400);
    const now = new Date();
    console.log('[timeline] now:', now.toISOString(), 'requested year:', year);
    if (!year || year < 2020 || year > now.getFullYear()) {
      console.error('[timeline] invalid year:', year);
      return json({ error: 'Valid year is required (2020 – current year)' }, 400);
    }

    // Pro gate: context-aware (caretaker inherits owner tier)
    const proStatus = await requireProForPet(svcClient, user.id, pet_id);
    console.log('[timeline] proStatus:', proStatus);
    if (proStatus === 'free' || proStatus === 'expired') return proRequiredResponse();

    // Check attempt limit (max 2 per year)
    const { count: attemptCount } = await svcClient
      .from('timeline_generations')
      .select('id', { count: 'exact', head: true })
      .eq('pet_id', pet_id)
      .eq('success', true)
      .gte('created_at', `${year}-01-01`)
      .lte('created_at', `${year + 1}-01-01`);

    console.log('[timeline] attempt count for year', year, ':', attemptCount);
    if ((attemptCount ?? 0) >= 4) {
      return json({ error: 'Maximum 4 generations per year reached (quarterly limit). Review existing timeline.', code: 'max_attempts' }, 429);
    }

    // Fetch pet details
    const { data: petRow } = await svcClient
      .from('pets')
      .select('id, name')
      .eq('id', pet_id)
      .maybeSingle();

    console.log('[timeline] petRow:', petRow);
    if (!petRow) return json({ error: 'Pet not found' }, 404);

    // Fetch journal data — scoped to the requested year
    const { data: journalData, error: journalErr } = await svcClient.rpc('get_pet_journal', { p_pet_id: pet_id });
    console.log('[timeline] journalData keys:', journalData ? Object.keys(journalData) : null, 'err:', journalErr?.message);
    if (!journalData) {
      return json({ error: 'Could not fetch journal data' }, 500);
    }
    // Filter journal entries to the requested year for AI context
    const yearStr = String(year);
    const filteredJournal: Record<string, any[]> = {};
    for (const [key, rows] of Object.entries(journalData as Record<string, any[]>)) {
      filteredJournal[key] = (rows ?? []).filter((r: any) => {
        const dateStr: string = r.date ?? r.created_at ?? r.achieved_at ?? r.noted_at ?? '';
        return dateStr.startsWith(yearStr);
      });
    }

    const totalFiltered = Object.values(filteredJournal).reduce((s, a) => s + a.length, 0);
    console.log(`[timeline] filteredJournal for ${yearStr}: ${totalFiltered} total records`,
      Object.entries(filteredJournal).filter(([,v]) => v.length > 0).map(([k,v]) => `${k}:${v.length}`).join(', ') || 'ALL EMPTY');

    // If no data exists for the requested year, widen to previous year too so the AI
    // has something to work with (e.g. pet adopted in late 2025, timeline requested for 2026)
    const journalForAI = totalFiltered > 0 ? filteredJournal : (() => {
      console.log('[timeline] no data for year — widening to last 2 years');
      const prevYear = String(year - 1);
      const wide: Record<string, any[]> = {};
      for (const [key, rows] of Object.entries(journalData as Record<string, any[]>)) {
        wide[key] = (rows ?? []).filter((r: any) => {
          const d: string = r.date ?? r.created_at ?? r.achieved_at ?? r.noted_at ?? '';
          return d.startsWith(yearStr) || d.startsWith(prevYear);
        });
      }
      const wideTotal = Object.values(wide).reduce((s, a) => s + a.length, 0);
      console.log(`[timeline] widened total: ${wideTotal}`);
      return wideTotal > 0 ? wide : journalData as Record<string, any[]>;
    })();

    // Try DeepSeek first, then Gemini
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const timelineChain = (await getChainConfig()).pet_timeline;
    const dsModels  = timelineChain.filter(s => s.provider === 'deepseek').map(s => s.model);
    const gModels   = timelineChain.filter(s => s.provider === 'gemini' || s.provider === 'custom').map(s => s.model);

    let timelineEntries: any = [];
    let aiProvider = 'unknown';
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;
    let lastError = '';

    if (deepseekKey && dsModels.length) {
      try {
        console.log('[generate-pet-timeline] trying DeepSeek');
        timelineEntries = await analyzeWithDeepSeek(journalForAI, petRow.name, deepseekKey, dsModels);
        aiProvider = 'deepseek';
        // DeepSeek pricing: $0.14/1M input, $0.28/1M output (approximate)
        tokensIn = Math.ceil(JSON.stringify(journalData).length / 4);
        tokensOut = Math.ceil(JSON.stringify(timelineEntries).length / 4);
        costUsd = (tokensIn / 1_000_000) * 0.14 + (tokensOut / 1_000_000) * 0.28;
      } catch (e: any) {
        lastError = e.message;
        console.error('[generate-pet-timeline] DeepSeek failed:', e.message, '— falling back to Gemini');
      }
    }

    if (!timelineEntries.length && geminiKey && gModels.length) {
      try {
        console.log('[generate-pet-timeline] trying Gemini');
        timelineEntries = await analyzeWithGemini(journalForAI, petRow.name, geminiKey, gModels);
        aiProvider = 'gemini';
        // Gemini 2.5 Flash pricing: $0.075/1M input, $0.30/1M output
        tokensIn = Math.ceil(JSON.stringify(journalData).length / 4);
        tokensOut = Math.ceil(JSON.stringify(timelineEntries).length / 4);
        costUsd = (tokensIn / 1_000_000) * 0.075 + (tokensOut / 1_000_000) * 0.30;
      } catch (e: any) {
        lastError = e.message;
        console.error('[generate-pet-timeline] Gemini failed:', e.message);
      }
    }

    if (!timelineEntries.length) {
      // Log failure
      try {
        await svcClient.from('timeline_generations').insert({
          pet_id,
          generated_by: user.id,
          ai_provider: 'none',
          success: false,
          error_msg: lastError,
        });
      } catch {}
      return json({ error: `Timeline generation failed: ${lastError}` }, 502);
    }

    // Delete AI-generated entries for this year (keep source_record_id-tagged ones —
    // those are directly linked to health records and cascade-delete with them)
    await svcClient
      .from('pet_timelines')
      .delete()
      .eq('pet_id', pet_id)
      .gte('event_date', `${year}-01-01`)
      .lte('event_date', `${year}-12-31`)
      .is('source_record_id', null);

    // Insert timeline entries
    const entriesToInsert = timelineEntries.map((entry: any) => ({
      pet_id,
      title: entry.title,
      description: entry.description,
      event_date: entry.event_date,
      category: entry.category,
      photo_url: null,
      is_pinned: false,
      created_by: user.id,
    }));

    const { error: insertErr } = await svcClient
      .from('pet_timelines')
      .insert(entriesToInsert);

    if (insertErr) {
      console.error('[generate-pet-timeline] insert error:', insertErr.message);
      throw insertErr;
    }

    // Log usage
    try {
      await svcClient.from('timeline_generations').insert({
        pet_id,
        generated_by: user.id,
        ai_provider: aiProvider,
        prompt_tokens: tokensIn,
        completion_tokens: tokensOut,
        cost_usd: costUsd,
        success: true,
      });
    } catch {}

    return json({
      success: true,
      timeline_entries: timelineEntries,
      ai_provider: aiProvider,
      entries_count: timelineEntries.length,
    });
  } catch (err: any) {
    console.error('[generate-pet-timeline] error:', err.message);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
