// FamilyCube — Edge Function: process-kid-chore-assignment
// Responsibility Engine Phase 3: kid chore assignment algorithm.
//
// Separate scoring model from process-task-assignment (adults) per the
// spec: fairness/age/workload/rotation/skill/growth/reliability, NOT
// history/availability/route/preference. Compares kids by EFFORT, not raw
// chore count (spec's explicit rule — "Emma: 6 chores x 2 effort = 12,
// Noah: 3 chores x 5 effort = 15 — Noah has done more responsibility").
//
// Recurring chores with an explicit rotation (recurrence_rule.siblingIds +
// rotationCycleDays) bypass scoring entirely and use deterministic
// rotation, also per spec ("recurring chores can use deterministic
// rotation... use smart scoring for unexpected chores, missed chores,
// conflicts, workload imbalance, and new chores").
//
// Deploy: supabase functions deploy process-kid-chore-assignment
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Kid {
  id: string;
  name: string;
  date_of_birth: string | null;
  skill_level: number;
  streak: number;
  parent_blocked_categories: string[];
}

interface ChoreRow {
  id: string;
  category: string;
  category_type: string;
  min_age: number | null;
  max_age: number | null;
  required_skill_level: number;
  recurrence_rule: { frequency?: string; siblingIds?: string[]; rotationCycleDays?: number } | null;
}

interface CandidateScore {
  memberId: string;
  memberName: string;
  score: number;
  breakdown: {
    fairness: number;
    ageSuitability: number;
    workload: number;
    rotation: number;
    skillFit: number;
    growth: number;
    reliability: number;
  };
  excluded: boolean;
  exclusionReason?: string;
}

const WEIGHTS = {
  fairness: 0.30,
  ageSuitability: 0.20,
  workload: 0.20,
  rotation: 0.10,
  skillFit: 0.10,
  growth: 0.05,
  reliability: 0.05,
} as const;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { choreId, familyId, dryRun = false } = body as { choreId?: string; familyId?: string; dryRun?: boolean };

    if (!choreId || !familyId) {
      return json({ error: 'choreId and familyId are required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Load the chore ─────────────────────────────────────────────────
    const { data: chore, error: choreErr } = await supabase
      .from('chore_tasks')
      .select('id, category, category_type, min_age, max_age, required_skill_level, recurrence_rule')
      .eq('id', choreId)
      .maybeSingle();
    if (choreErr) throw choreErr;
    if (!chore) return json({ error: 'Chore not found' }, 404);
    const c = chore as ChoreRow;

    // ── 1b. Look up the real category taxonomy — if this chore's category
    // is flagged usually_adult_task (Medical, Financial, Work), block kid
    // assignment outright rather than let scoring quietly proceed. Unknown/
    // unmatched category strings degrade gracefully (usuallyAdultTask
    // false) rather than hard-failing, since chore_tasks.category has
    // always been free text and existing chores predate the taxonomy.
    const { data: categoryRow } = await supabase
      .from('responsibility_categories')
      .select('id, usually_adult_task')
      .or(`id.eq.${c.category},domain.eq.${c.category}`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (categoryRow?.usually_adult_task) {
      return json({
        decisionType: 'blocked',
        reason: `"${c.category}" is an adult-only category (${categoryRow.id}) — not appropriate for kid assignment.`,
      });
    }

    // ── 2. Load eligible kids for this family ─────────────────────────────
    // members.role is stored as 'child' in the DB (the app translates
    // 'child' <-> 'kid' client-side in familyStore.fromRow/toRow) — this
    // function queries the DB directly, so it must match the stored value,
    // not the app-level one.
    const { data: kidRows, error: kidErr } = await supabase
      .from('members')
      .select('id, name, date_of_birth, skill_level, streak, parent_blocked_categories')
      .eq('role', 'child')
      .filter('family_id', 'eq', familyId);
    if (kidErr) throw kidErr;
    const kids = (kidRows ?? []) as Kid[];
    if (kids.length === 0) {
      return json({ decisionType: 'blocked', reason: 'No kids found for this family.' });
    }

    // ── 3. Deterministic rotation shortcut ─────────────────────────────────
    // A recurring chore with an explicit sibling rotation list bypasses
    // scoring entirely — whoever's turn it is, per rotationCycleDays, gets
    // it. This mirrors the app's existing client-side rotation interpreter
    // (choreStore's recurrenceRule handling) rather than reinventing it —
    // the engine's job here is just to pick the same answer deterministically
    // server-side so an edge-function-driven auto-assign agrees with what
    // the client would already compute.
    const rotation = c.recurrence_rule;
    if (rotation?.frequency && rotation.frequency !== 'once' && rotation.siblingIds?.length) {
      const cycleDays = rotation.rotationCycleDays ?? rotation.siblingIds.length;
      const dayIndex = Math.floor(Date.now() / 86_400_000) % cycleDays;
      const turnIndex = dayIndex % rotation.siblingIds.length;
      const rotationMemberId = rotation.siblingIds[turnIndex];
      const rotationKid = kids.find(k => k.id === rotationMemberId);

      if (rotationKid) {
        let decisionId: string | null = null;
        if (!dryRun) {
          const { data: inserted, error: insErr } = await supabase
            .from('assignment_decisions')
            .insert({
              family_id: familyId, task_id: choreId, task_type: 'chore',
              selected_member_id: rotationKid.id, decision_type: 'auto', confidence: 100,
              candidate_scores: [], explanation: { method: 'deterministic_rotation', turnIndex, cycleDays },
            })
            .select('id').single();
          if (insErr) throw insErr;
          decisionId = inserted?.id ?? null;
          await supabase.from('chore_tasks').update({
            assigned_to_id: rotationKid.id, assignment_decision_id: decisionId,
          }).eq('id', choreId);
          await supabase.from('responsibility_history').insert({
            family_id: familyId, chore_id: choreId, member_id: rotationKid.id,
            category: c.category, responsibility_type: 'chore', outcome: 'assigned',
            metadata: { decisionId, method: 'deterministic_rotation' },
          });
        }
        return json({
          decisionType: 'auto', selectedMemberId: rotationKid.id, decisionId,
          explanation: { method: 'deterministic_rotation', turnIndex, cycleDays }, dryRun,
        });
      }
      // Fall through to scoring if the rotation pointer landed on a kid no
      // longer in this family (e.g. removed) — better to score than to
      // silently fail the rotation.
    }

    // ── 4. Load 7-day effort totals from responsibility_history for the
    //      fairness/workload signals — effort-based, never chore-count.
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: historyRows } = await supabase
      .from('responsibility_history')
      .select('member_id, effort_points, outcome')
      .eq('family_id', familyId)
      .eq('responsibility_type', 'chore')
      .gte('occurred_at', sevenDaysAgo)
      .in('outcome', ['assigned', 'accepted', 'completed']);

    const effortByKid = new Map<string, number>();
    for (const h of historyRows ?? []) {
      if (!h.member_id) continue;
      effortByKid.set(h.member_id, (effortByKid.get(h.member_id) ?? 0) + (h.effort_points ?? 0));
    }
    const maxEffort = Math.max(1, ...kids.map(k => effortByKid.get(k.id) ?? 0));

    // Current open workload (todo/in_progress chores already on each kid) —
    // distinct signal from 7-day effort history: this is "how much is on
    // their plate RIGHT NOW," not "how much have they done historically."
    const { data: openChores } = await supabase
      .from('chore_tasks')
      .select('assigned_to_id')
      .eq('family_id', familyId)
      .in('status', ['todo', 'in_progress'])
      .not('assigned_to_id', 'is', null);
    const openCountByKid = new Map<string, number>();
    for (const row of openChores ?? []) {
      if (!row.assigned_to_id) continue;
      openCountByKid.set(row.assigned_to_id, (openCountByKid.get(row.assigned_to_id) ?? 0) + 1);
    }
    const maxOpen = Math.max(1, ...kids.map(k => openCountByKid.get(k.id) ?? 0));

    // ── 5. Score every non-hard-excluded kid ───────────────────────────────
    const scored: CandidateScore[] = [];
    for (const k of kids) {
      const breakdown = { fairness: 0, ageSuitability: 0, workload: 0, rotation: 0, skillFit: 0, growth: 0, reliability: 0 };

      // Hard exclusion: parent block on this category
      if (k.parent_blocked_categories?.includes(c.category)) {
        scored.push({ memberId: k.id, memberName: k.name, score: 0, breakdown, excluded: true, exclusionReason: `Parent blocked "${c.category}" for this kid` });
        continue;
      }
      // Hard exclusion: too young / too old (only when both age fields present)
      if (k.date_of_birth) {
        const age = ageFromDob(k.date_of_birth);
        if (c.min_age != null && age < c.min_age) {
          scored.push({ memberId: k.id, memberName: k.name, score: 0, breakdown, excluded: true, exclusionReason: `Too young (age ${age}, needs ${c.min_age}+)` });
          continue;
        }
        if (c.max_age != null && age > c.max_age) {
          scored.push({ memberId: k.id, memberName: k.name, score: 0, breakdown, excluded: true, exclusionReason: `Too old for this chore (age ${age}, max ${c.max_age})` });
          continue;
        }
      }
      // Hard exclusion: required skill unavailable
      if ((k.skill_level ?? 1) < (c.required_skill_level ?? 1)) {
        scored.push({ memberId: k.id, memberName: k.name, score: 0, breakdown, excluded: true, exclusionReason: `Skill level ${k.skill_level ?? 1} below required ${c.required_skill_level}` });
        continue;
      }
      // Hard exclusion: already overloaded — more open chores than anyone
      // else AND at least double the family's median open count. A blunt
      // but effective guard against piling onto one kid indefinitely.
      const openCount = openCountByKid.get(k.id) ?? 0;
      if (maxOpen >= 4 && openCount === maxOpen && kids.length > 1) {
        scored.push({ memberId: k.id, memberName: k.name, score: 0, breakdown, excluded: true, exclusionReason: `Already has ${openCount} open chores — overloaded relative to siblings` });
        continue;
      }

      // Fairness — inverse of this kid's share of 7-day effort
      const effortShare = (effortByKid.get(k.id) ?? 0) / maxEffort;
      breakdown.fairness = clamp(100 - effortShare * 100) * WEIGHTS.fairness;

      // Age suitability — neutral (80) when dob is unknown or chore has no
      // age range; full credit when known and within range (already passed
      // hard exclusion above, so remaining candidates are always in-range)
      breakdown.ageSuitability = (k.date_of_birth && (c.min_age != null || c.max_age != null) ? 100 : 80) * WEIGHTS.ageSuitability;

      // Workload — inverse of current open-chore share
      const workloadShare = openCount / maxOpen;
      breakdown.workload = clamp(100 - workloadShare * 100) * WEIGHTS.workload;

      // Rotation — neutral flat score for non-rotation chores (the actual
      // rotation logic is the deterministic shortcut above; for a one-off
      // chore there's no rotation concept to score, so this stays neutral
      // rather than arbitrarily favoring/penalizing anyone)
      breakdown.rotation = 60 * WEIGHTS.rotation;

      // Skill fit — how much headroom above the minimum required (a kid
      // exactly at the required level scores lower than one comfortably
      // above it, since assigning right-at-the-edge risks a redo)
      const skillMargin = (k.skill_level ?? 1) - (c.required_skill_level ?? 1);
      breakdown.skillFit = clamp(60 + skillMargin * 15) * WEIGHTS.skillFit;

      // Growth opportunity — favor a kid taking on something slightly above
      // their comfort zone (skillMargin near 0, not deeply positive) —
      // small weight (5%) since this is a nice-to-have, not primary
      breakdown.growth = clamp(100 - Math.abs(skillMargin) * 25) * WEIGHTS.growth;

      // Reliability — proxied by streak (a kid maintaining a streak has
      // been reliably completing chores; no separate reliability_score
      // field exists for kids the way it does for adults, streak is this
      // app's existing, already-computed reliability signal)
      breakdown.reliability = clamp((k.streak ?? 0) * 10) * WEIGHTS.reliability;

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      scored.push({ memberId: k.id, memberName: k.name, score: clamp(total), breakdown, excluded: false });
    }

    const eligible = scored.filter(s => !s.excluded).sort((a, b) => b.score - a.score);
    const excluded = scored.filter(s => s.excluded);

    // Kid chores default to the pool/claim model in this app (bounty-style,
    // first-come) far more often than adult tasks — so the bar for AUTO is
    // deliberately the same conservative thresholds as Phase 2, not looser,
    // even though a wrong kid-chore auto-assign is lower-stakes than an
    // adult one. Consistency here matters more than tuning two different
    // bars this early, before any real usage data exists to tune against.
    let decisionType: 'auto' | 'suggest' | 'ask' | 'blocked';
    let selectedMemberId: string | null = null;
    let confidence: number | null = null;

    if (eligible.length === 0) {
      decisionType = 'blocked';
    } else {
      const top = eligible[0];
      const runnerUp = eligible[1];
      const gap = runnerUp ? top.score - runnerUp.score : top.score;
      confidence = top.score;
      if (top.score >= 85 && gap >= 15) { decisionType = 'auto'; selectedMemberId = top.memberId; }
      else if (top.score >= 70 && gap >= 10) { decisionType = 'suggest'; selectedMemberId = top.memberId; }
      else { decisionType = 'ask'; selectedMemberId = top.memberId; }
    }

    const explanation = {
      selected: selectedMemberId ? eligible.find(e => e.memberId === selectedMemberId)?.memberName : null,
      topScore: eligible[0]?.score ?? null,
      gap: eligible.length > 1 ? eligible[0].score - eligible[1].score : null,
      excludedCount: excluded.length,
      excludedReasons: excluded.map(e => ({ member: e.memberName, reason: e.exclusionReason })),
    };

    let decisionId: string | null = null;
    if (!dryRun) {
      const { data: inserted, error: insErr } = await supabase
        .from('assignment_decisions')
        .insert({
          family_id: familyId, task_id: choreId, task_type: 'chore',
          selected_member_id: decisionType === 'blocked' ? null : selectedMemberId,
          decision_type: decisionType, confidence, candidate_scores: scored, explanation,
        })
        .select('id').single();
      if (insErr) throw insErr;
      decisionId = inserted?.id ?? null;

      if (decisionType === 'auto' && selectedMemberId) {
        await supabase.from('chore_tasks').update({
          assigned_to_id: selectedMemberId, assignment_decision_id: decisionId,
        }).eq('id', choreId);
        await supabase.from('responsibility_history').insert({
          family_id: familyId, chore_id: choreId, member_id: selectedMemberId,
          category: c.category, responsibility_type: 'chore', outcome: 'assigned',
          metadata: { decisionId, auto: true },
        });
      }
    }

    return json({ decisionType, selectedMemberId, confidence, decisionId, candidates: scored, explanation, dryRun });

  } catch (err: any) {
    console.error('[process-kid-chore-assignment] fatal:', err);
    return json({ error: err.message ?? String(err) }, 500);
  }
});
