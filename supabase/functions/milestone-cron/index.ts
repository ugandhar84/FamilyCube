// milestone-cron — runs daily via Supabase cron
// 1. Inserts day-count milestones (Day 1, 30, 100 …) for all pets
// 2. Triggers AI milestone generation for every pet via generate-milestones
//
// Deploy: supabase functions deploy milestone-cron
// Schedule: every day at 06:00 UTC

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MILESTONE_DAYS: Record<number, string> = {
  1:    'First day home 🏠',
  7:    'One week together 🐾',
  30:   'One month together 🌙',
  100:  '100 days of memories ⭐',
  180:  'Half a year together 🌿',
  365:  'First full year 🎂',
  500:  '500 days together 🎉',
  730:  'Two years of love 💜',
  1000: '1000 days — legendary! 🏆',
};

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const svcKey      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db          = createClient(supabaseUrl, svcKey);

  const { data: pets, error: petsErr } = await db
    .from('pets')
    .select('id, name, adoption_date')
    .not('adoption_date', 'is', null);

  if (petsErr) return json({ error: petsErr.message }, 500);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const inserted: { pet_id: string; day_count: number; title: string }[] = [];
  const skipped:  { pet_id: string; day_count: number }[] = [];

  // ── Step 1: day-count milestones ──────────────────────────────────────────
  // Was one INSERT per qualifying pet, in a loop — scales with total pet
  // count as the fleet grows, even though on any given day only a handful
  // of pets actually hit a milestone day. Build every qualifying row in
  // memory first, then a single batched upsert; milestones_pet_day_unique
  // (pet_id, day_count) already exists, so ignoreDuplicates safely no-ops
  // any row that (rare backfill/re-run case) already exists instead of
  // needing a per-row try/insert to detect that.
  const candidates: { pet: { id: string; name: string }; daysCount: number }[] = [];
  for (const pet of (pets ?? [])) {
    const adoption = new Date(pet.adoption_date);
    adoption.setUTCHours(0, 0, 0, 0);
    const daysCount = Math.floor((today.getTime() - adoption.getTime()) / 86_400_000);
    if (daysCount in MILESTONE_DAYS) candidates.push({ pet, daysCount });
  }

  if (candidates.length > 0) {
    const rows = candidates.map(({ pet, daysCount }) => ({
      pet_id:         pet.id,
      day_count:      daysCount,
      title:          MILESTONE_DAYS[daysCount],
      achieved_at:    today.toISOString().slice(0, 10),
      milestone_type: 'day_count',
    }));
    const { data: upserted, error: upsertErr } = await db
      .from('milestones')
      .upsert(rows, { onConflict: 'pet_id,day_count', ignoreDuplicates: true })
      .select('pet_id, day_count');

    if (upsertErr) {
      console.warn('[milestone-cron] batched upsert failed:', upsertErr.message);
      for (const { pet, daysCount } of candidates) skipped.push({ pet_id: pet.id, day_count: daysCount });
    } else {
      const landedKeys = new Set((upserted ?? []).map((r: any) => `${r.pet_id}:${r.day_count}`));
      for (const { pet, daysCount } of candidates) {
        if (landedKeys.has(`${pet.id}:${daysCount}`)) {
          inserted.push({ pet_id: pet.id, day_count: daysCount, title: MILESTONE_DAYS[daysCount] });
          console.log(`[milestone-cron] ✓ ${pet.name} — Day ${daysCount}: ${MILESTONE_DAYS[daysCount]}`);
        } else {
          skipped.push({ pet_id: pet.id, day_count: daysCount });
        }
      }
    }
  }

  // ── Step 2: trigger AI milestone generation for all pets ─────────────────
  // Fire-and-forget via self-invocation so cron completes quickly
  const aiUrl = `${supabaseUrl}/functions/v1/generate-milestones`;
  fetch(aiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${svcKey}`,
    },
    body: JSON.stringify({}), // empty body = process all pets
  }).catch(e => console.warn('[milestone-cron] AI generation fire-and-forget error:', e.message));

  console.log(`[milestone-cron] done — ${inserted.length} day-count inserted, ${skipped.length} skipped, AI generation triggered`);
  return json({ inserted, skipped, pets_checked: (pets ?? []).length, ai_triggered: true });
});
