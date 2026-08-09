// generate-milestones — AI-powered personalised milestone generation using DeepSeek
// Called by:
//   • milestone-cron (daily, once per pet that has new activity)
//   • client on-demand (user taps refresh on Milestones tab)
//
// Deploy: supabase functions deploy generate-milestones

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithTimeout, TEXT_TIMEOUT_MS } from '../_shared/fetchWithTimeout.ts';
import { getChainConfig } from '../_shared/getChainConfig.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// How many AI milestones to keep per pet (older ones are pruned on regeneration)
const MAX_AI_MILESTONES = 20;

const SYSTEM_PROMPT = `You are a creative writer for a pet memory app called PawBond.
Given a pet's real activity data, generate meaningful, personal milestone cards.

Rules:
- Output ONLY a valid JSON object in this exact shape: { "milestones": [ ... ] }
- Each item in the array: { "title": string, "date": "YYYY-MM-DD", "emoji": string, "category": string }
- title: short (max 8 words), warm, celebratory. Reference the pet by name. No quotes around it.
- date: the actual date this milestone happened (from the data provided)
- emoji: single emoji that best captures the moment
- category: one of: health | mood | social | journal | weight | activity | streak
- Generate between 5 and ${MAX_AI_MILESTONES} milestones — only genuine ones, not made-up
- Prefer specific personal moments over generic ones
- Do NOT include day-count milestones like "Day 30" — those are handled separately
- If there is not enough data, return fewer milestones (even 0 is OK — use { "milestones": [] })`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const dsKey = Deno.env.get('DEEPSEEK_API_KEY');
  if (!dsKey) return json({ error: 'DEEPSEEK_API_KEY not set' }, 500);
  const dsModels = (await getChainConfig()).general_text
    .filter(s => s.provider === 'deepseek').map(s => s.model);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const svcKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db          = createClient(supabaseUrl, svcKey);

  // Accept pet_id from body (on-demand) or process all pets (cron)
  let petIds: string[] = [];
  let isOnDemand = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.pet_id) { petIds = [body.pet_id]; isOnDemand = true; }
  } catch { /* no body */ }

  // On-demand: enforce weekly quota (once per 7 days per pet)
  if (isOnDemand && petIds.length === 1) {
    const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: recent } = await db
      .from('milestones')
      .select('created_at')
      .eq('pet_id', petIds[0])
      .eq('milestone_type', 'ai')
      .gte('created_at', SEVEN_DAYS_AGO)
      .limit(1);
    if (recent && recent.length > 0) {
      const lastGen = new Date(recent[0].created_at);
      const nextAllowed = new Date(lastGen.getTime() + 7 * 86_400_000);
      return json({ error: 'quota_exceeded', next_allowed_at: nextAllowed.toISOString() }, 429);
    }
  }

  if (petIds.length === 0) {
    // Cron mode — all pets that have adoption_date
    const { data: pets } = await db
      .from('pets')
      .select('id')
      .not('adoption_date', 'is', null);
    petIds = (pets ?? []).map((p: any) => p.id);
  }

  const results: { pet_id: string; inserted: number; error?: string }[] = [];

  for (const petId of petIds) {
    try {
      const result = await processPet(db, dsKey, petId, dsModels);
      results.push(result);
    } catch (e: any) {
      results.push({ pet_id: petId, inserted: 0, error: e.message });
      console.error(`[generate-milestones] pet ${petId} failed:`, e.message);
    }
  }

  return json({ results, pets_processed: petIds.length });
});

async function processPet(
  db: ReturnType<typeof createClient>,
  dsKey: string,
  petId: string,
  dsModels: string[] = ['deepseek-chat'],
): Promise<{ pet_id: string; inserted: number }> {
  // ── 1. Fetch pet profile ──────────────────────────────────────────────────
  const { data: pet } = await db
    .from('pets')
    .select('name, species, breed, gender, adoption_date, birthday')
    .eq('id', petId)
    .single();
  if (!pet) throw new Error('Pet not found');

  // ── 2. Fetch activity data (last 365 days) ────────────────────────────────
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const sinceStr = since.toISOString().slice(0, 10);

  const [
    { data: journals },
    { data: moods },
    { data: healthRecords },
    { data: playdates },
    { data: weights },
    { data: feedingStreaks },
  ] = await Promise.all([
    db.from('journal_entries')
      .select('content, created_at')
      .eq('pet_id', petId)
      .gte('created_at', sinceStr)
      .order('created_at', { ascending: true })
      .limit(60),

    db.from('mood_logs')
      .select('mood_label, mood_score, notes, date, created_at')
      .eq('pet_id', petId)
      .gte('created_at', sinceStr)
      .order('created_at', { ascending: true })
      .limit(60),

    db.from('health_records')
      .select('record_type, title, notes, date, created_at')
      .eq('pet_id', petId)
      .gte('created_at', sinceStr)
      .order('created_at', { ascending: true })
      .limit(40),

    db.from('playdate_requests')
      .select('status, scheduled_date, created_at')
      .eq('from_pet_id', petId)
      .eq('status', 'agreed')
      .gte('created_at', sinceStr)
      .order('created_at', { ascending: true })
      .limit(20),

    db.from('weight_logs')
      .select('weight_kg, unit, logged_at')
      .eq('pet_id', petId)
      .gte('logged_at', sinceStr)
      .order('logged_at', { ascending: true })
      .limit(30),

    db.from('feeding_logs')
      .select('fed_at')
      .eq('pet_id', petId)
      .gte('fed_at', sinceStr)
      .order('fed_at', { ascending: true })
      .limit(100),
  ]);

  // ── 3. Compute a feeding streak (consecutive days with a log) ─────────────
  const fedDays = new Set((feedingStreaks ?? []).map((f: any) => f.fed_at?.slice(0, 10)));
  let maxStreak = 0, currentStreak = 0, streakEndDate = '';
  const today = new Date().toISOString().slice(0, 10);
  let cursor = new Date(sinceStr);
  const end   = new Date(today);
  while (cursor <= end) {
    const d = cursor.toISOString().slice(0, 10);
    if (fedDays.has(d)) {
      currentStreak++;
      if (currentStreak > maxStreak) { maxStreak = currentStreak; streakEndDate = d; }
    } else {
      currentStreak = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // ── 4. Build the prompt ───────────────────────────────────────────────────
  const daysHome = pet.adoption_date
    ? Math.floor((Date.now() - new Date(pet.adoption_date).getTime()) / 86_400_000)
    : null;

  const userMsg = `
Pet name: ${pet.name}
Species: ${pet.species ?? 'unknown'} | Breed: ${pet.breed ?? 'unknown'} | Gender: ${pet.gender ?? 'unknown'}
Adoption date: ${pet.adoption_date ?? 'unknown'} (${daysHome != null ? daysHome + ' days ago' : 'unknown'})
Birthday: ${pet.birthday ?? 'unknown'}

--- JOURNAL ENTRIES (${(journals ?? []).length}) ---
${(journals ?? []).map((j: any) => `[${j.created_at?.slice(0, 10)}] ${(j.content ?? '').slice(0, 120)}`).join('\n') || 'none'}

--- MOOD LOGS (${(moods ?? []).length}) ---
${(moods ?? []).map((m: any) => `[${m.date ?? m.created_at?.slice(0, 10)}] ${m.mood_label} (score: ${m.mood_score ?? '?'})${m.notes ? ' — ' + (m.notes ?? '').slice(0, 80) : ''}`).join('\n') || 'none'}

--- HEALTH RECORDS (${(healthRecords ?? []).length}) ---
${(healthRecords ?? []).map((r: any) => `[${r.date ?? r.created_at?.slice(0, 10)}] ${r.record_type}: ${r.title ?? ''}${r.notes ? ' — ' + (r.notes ?? '').slice(0, 80) : ''}`).join('\n') || 'none'}

--- PLAYDATES COMPLETED (${(playdates ?? []).length}) ---
${(playdates ?? []).map((p: any) => `[${p.scheduled_date ?? p.created_at?.slice(0, 10)}] completed playdate`).join('\n') || 'none'}

--- WEIGHT LOGS (${(weights ?? []).length}) ---
${(weights ?? []).map((w: any) => `[${w.logged_at?.slice(0, 10)}] ${w.weight_kg} kg`).join('\n') || 'none'}

--- FEEDING STREAK ---
Best streak in the last year: ${maxStreak} consecutive days${streakEndDate ? ' (ended ' + streakEndDate + ')' : ''}

Generate personal milestone cards for ${pet.name} based ONLY on the real data above.
Return ONLY the JSON object { "milestones": [ ... ] }. No markdown, no explanation, no extra keys.`;

  // ── 5. Call DeepSeek ──────────────────────────────────────────────────────
  const t = Date.now();
  const res = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dsKey}` },
    body: JSON.stringify({
      model: dsModels[0] ?? 'deepseek-chat',
      max_tokens: 2048,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMsg },
      ],
    }),
  }, TEXT_TIMEOUT_MS);
  console.log(`[generate-milestones] DeepSeek ${res.status} in ${Date.now() - t}ms`);
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const dsJson = await res.json() as any;
  if (dsJson.error) throw new Error(`DeepSeek error: ${dsJson.error.message}`);

  let raw = dsJson.choices?.[0]?.message?.content ?? '[]';

  // DeepSeek sometimes wraps the array in {"milestones": [...]} with json_object mode
  let milestones: any[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      milestones = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // json_object mode may wrap in any key — find the first array value
      const arr = parsed.milestones ?? parsed.data ?? parsed.items ?? parsed.moments ?? parsed.results;
      milestones = Array.isArray(arr) ? arr : Object.values(parsed).find((v: any) => Array.isArray(v)) ?? [];
    }
  } catch {
    // strip markdown fences if present
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    milestones = JSON.parse(raw);
    if (!Array.isArray(milestones)) milestones = [];
  }

  if (!milestones.length) {
    console.log(`[generate-milestones] ${pet.name} — no milestones generated`);
    return { pet_id: petId, inserted: 0 };
  }

  // ── 6. Delete old AI milestones, insert fresh batch ─────────────────────
  const today2 = new Date().toISOString().slice(0, 10);
  const rows = milestones
    .filter((m: any) => m.title && m.date)
    .slice(0, MAX_AI_MILESTONES)
    .map((m: any, i: number) => ({
      pet_id:         petId,
      day_count:      -(i + 1), // negative index — never collides with real day-count rows
      title:          String(m.title).slice(0, 120),
      emoji:          String(m.emoji ?? '🐾').slice(0, 8),
      category:       String(m.category ?? 'activity').slice(0, 30),
      achieved_at:    String(m.date).slice(0, 10) <= today2 ? String(m.date).slice(0, 10) : today2,
      milestone_type: 'ai',
    }));

  if (!rows.length) return { pet_id: petId, inserted: 0 };

  // Delete the previous AI batch for this pet before inserting the new one.
  // This keeps the list clean — each refresh is a curated replacement, not an accumulation.
  const { error: delErr } = await db
    .from('milestones')
    .delete()
    .eq('pet_id', petId)
    .eq('milestone_type', 'ai');
  if (delErr) throw new Error(`delete old AI milestones failed: ${delErr.message}`);

  const { error: upsertErr, data: upserted } = await db
    .from('milestones')
    .upsert(rows, { onConflict: 'pet_id,day_count', ignoreDuplicates: true })
    .select('id');

  if (upsertErr) throw new Error(`insert failed: ${upsertErr.message}`);

  const inserted = (upserted ?? []).length;
  console.log(`[generate-milestones] ${pet.name} — ${inserted}/${rows.length} new milestones inserted`);
  return { pet_id: petId, inserted };
}
