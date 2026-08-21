// FamilyCube — Edge Function: process-task-assignment
// Responsibility Engine Phase 2: deterministic adult-assignment algorithm.
//
// Given a task (a chore_tasks row, a calendar_events row, or an errands
// row) and a family, ranks eligible adult candidates and decides whether to
// AUTO-assign, SUGGEST a top pick, or ASK the family to choose — writing the
// full scoring trace to assignment_decisions either way, per the spec's
// "every automatic assignment should have an explanation/audit record" rule.
//
// This function does NOT touch kid-chore assignment (that's Phase 3, a
// separate scoring model per the spec) — it scores parent/grandparent
// candidates always, and includes teen candidates too when the task's
// category is teen_eligible (per responsibility_categories) — matching
// this app's existing Junior Dispatch model where teens with a car can
// cover eligible rides/errands. A needs_parent category restricts the
// candidate pool to parents only, before any scoring happens.
//
// Deploy: supabase functions deploy process-task-assignment
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

type TaskType = 'chore' | 'event' | 'errand';

interface Member {
  id: string;
  name: string;
  role: string;
  effort_debt_7d: number;
  effort_debt_30d: number;
  reliability_score: number;
  gp_cheerleader_mode: boolean;
  gp_drive_window_days: number[];
  gp_drive_window_start: string;
  gp_drive_window_end: string;
  gp_weekly_ride_cap: number;
}

interface ResponsibilityRule {
  member_id: string;
  category: string;
  rule_type: 'never' | 'prefer' | 'avoid' | 'require_confirmation';
  active: boolean;
}

interface CandidateScore {
  memberId: string;
  memberName: string;
  score: number;
  breakdown: {
    history: number;
    availability: number;
    route: number;
    preference: number;
    fairness: number;
    contextFit: number;
  };
  excluded: boolean;
  exclusionReason?: string;
}

// ── Scoring weights, per the spec's initial deterministic weighting ────────
const WEIGHTS = {
  history: 0.30,      // reliability_score
  availability: 0.25, // no calendar conflict at the task's time
  route: 0.15,        // route_context incremental burden, if any was computed
  preference: 0.10,   // responsibility_rules 'prefer'/'avoid'
  fairness: 0.10,      // inverse of effort_debt_7d relative to other candidates
  contextFit: 0.10,    // placeholder signal (task/category fit) — see note below
} as const;

const AUTO_MIN_TOP = 85;
const AUTO_MIN_GAP = 15;
const SUGGEST_MIN_TOP = 70;
const SUGGEST_MIN_GAP = 10;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      taskId, taskType, familyId, category, dryRun = false, targetField = 'assignee',
    } = body as { taskId?: string; taskType?: TaskType; familyId?: string; category?: string; dryRun?: boolean; targetField?: 'assignee' | 'helper' | 'driver' };

    if (!taskId || !taskType || !familyId || !category) {
      return json({ error: 'taskId, taskType, familyId, and category are required' }, 400);
    }
    if (!['chore', 'event', 'errand'].includes(taskType)) {
      return json({ error: 'taskType must be chore, event, or errand' }, 400);
    }
    // 'helper' (accompanying adult) and 'driver' (separate transport person,
    // Study category only) only exist as distinct concepts on
    // calendar_events — chores/errands have one assignee, full stop.
    if ((targetField === 'helper' || targetField === 'driver') && taskType !== 'event') {
      return json({ error: `targetField '${targetField}' is only valid for taskType 'event'` }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 0. Validate category against the real taxonomy ────────────────────
    // Without this, any caller can pass an arbitrary string and the engine
    // silently proceeds — responsibility_rules written against a real
    // category value would then never match, and sensitivity/high-risk
    // handling below would have nothing to key off. `category` here is
    // expected to be a responsibility_categories.id slug (e.g.
    // 'medical.doctor_visit'); a bare domain like 'medical' also matches
    // via the OR below so existing callers passing loose category strings
    // degrade gracefully rather than hard-failing.
    const { data: categoryRow } = await supabase
      .from('responsibility_categories')
      .select('id, domain, default_sensitivity, usually_adult_task, default_needs_parent, default_teen_eligible, default_gp_welcome')
      .or(`id.eq.${category},domain.eq.${category}`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (!categoryRow) {
      return json({
        error: `Unknown category "${category}" — not found in responsibility_categories. Pass a valid domain or domain.subcategory id.`,
      }, 400);
    }
    const sensitivity = categoryRow.default_sensitivity;
    const needsParent  = categoryRow.default_needs_parent as boolean;
    const teenEligible = categoryRow.default_teen_eligible as boolean;
    const gpWelcome    = categoryRow.default_gp_welcome as boolean;

    // ── 1. Load eligible candidates for this family ────────────────────────
    // members.family_id is uuid; the family_id this function receives is
    // whatever the caller's own table stores it as (text, per chore_tasks/
    // calendar_events/errands convention) — compare as text on both sides.
    // members.role is stored as 'grandparent'/'teenager' in the DB (the app
    // translates senior <-> grandparent AND teen <-> teenager client-side in
    // familyStore.fromRow/toRow — 'teen' does NOT match as-is, contrary to
    // what this comment used to claim) — this function queries the DB
    // directly, so it must match the stored values. Previously this used
    // 'teen', which never matched any real row — teens were silently never
    // candidates for ANY assignment, on every category, regardless of
    // teen_eligible (QA Round 9, Medium Finding 6 — verified live, a teen
    // never appeared as a candidate even on a teen_eligible transport run).
    //
    // Which roles are even candidates depends on the category's eligibility
    // switches: needs_parent means ONLY parents are considered (hard filter
    // at the query level, not a scoring penalty — a category that needs a
    // parent specifically has no business ranking a teen or GP at all).
    // Otherwise parents + grandparents are always eligible, and teens join
    // the pool only when the category is teen_eligible.
    const eligibleRoles = needsParent
      ? ['parent']
      : teenEligible
        ? ['parent', 'grandparent', 'teenager']
        : ['parent', 'grandparent'];

    const { data: members, error: memErr } = await supabase
      .from('members')
      .select('id, name, role, effort_debt_7d, effort_debt_30d, reliability_score, gp_cheerleader_mode, gp_drive_window_days, gp_drive_window_start, gp_drive_window_end, gp_weekly_ride_cap')
      .in('role', eligibleRoles)
      .filter('family_id', 'eq', familyId);
    if (memErr) throw memErr;

    const candidates = (members ?? []) as Member[];
    if (candidates.length === 0) {
      return json({
        decisionType: 'blocked',
        reason: needsParent
          ? 'This category requires a parent specifically, and no parent was found for this family.'
          : 'No eligible members found for this family.',
      });
    }

    // ── 2. Load hard rules for this category ──────────────────────────────────
    const { data: rules, error: rulesErr } = await supabase
      .from('responsibility_rules')
      .select('member_id, category, rule_type, active')
      .eq('family_id', familyId)
      .eq('category', category)
      .eq('active', true);
    if (rulesErr) throw rulesErr;

    const ruleList = (rules ?? []) as ResponsibilityRule[];
    const neverRule = (memberId: string) => ruleList.find(r => r.member_id === memberId && r.rule_type === 'never');
    const preferRule = (memberId: string) => ruleList.find(r => r.member_id === memberId && r.rule_type === 'prefer');
    const avoidRule = (memberId: string) => ruleList.find(r => r.member_id === memberId && r.rule_type === 'avoid');
    const requiresConfirmation = (memberId: string) =>
      !!ruleList.find(r => r.member_id === memberId && r.rule_type === 'require_confirmation');

    // ── 3. Load this task's scheduled time, if it has one, for availability ──
    // (calendar_events has date/start_time directly; chore_tasks/errands use
    // due_date/due_at — availability only meaningfully applies to time-bound
    // tasks, so this stays best-effort and never hard-excludes on its own
    // absence.)
    let taskDate: string | null = null;
    let taskTime: string | null = null;
    if (taskType === 'event') {
      const { data: ev } = await supabase
        .from('calendar_events')
        .select('date, start_time')
        .eq('id', taskId)
        .maybeSingle();
      taskDate = ev?.date ?? null;
      taskTime = ev?.start_time ?? null;
    } else if (taskType === 'errand') {
      const { data: er } = await supabase
        .from('errands')
        .select('due_at')
        .eq('id', taskId)
        .maybeSingle();
      if (er?.due_at) {
        const d = new Date(er.due_at);
        taskDate = d.toISOString().slice(0, 10);
        taskTime = d.toISOString().slice(11, 16);
      }
    }
    // chore_tasks.due_date exists but is a soft deadline, not a scheduling
    // slot — availability conflicts don't apply the same way, left null.

    // ── 4. Load calendar conflicts for candidates at that date/time ──────────
    const conflictedMemberIds = new Set<string>();
    if (taskDate && taskTime) {
      // Missing deleted_at filter meant a cancelled event still created a
      // phantom scheduling conflict, wrongly excluding an otherwise-free
      // candidate (QA Round 10 verification finding).
      const { data: dayEvents } = await supabase
        .from('calendar_events')
        .select('id, member_id, member_ids, start_time, end_time')
        .eq('family_id', familyId)
        .eq('date', taskDate)
        .is('deleted_at', null);
      const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      const taskMins = toMinutes(taskTime);
      for (const ev of dayEvents ?? []) {
        if (!ev.start_time) continue;
        const evStart = toMinutes(ev.start_time);
        const evEnd = ev.end_time ? toMinutes(ev.end_time) : evStart + 30;
        // Overlap if the task's start falls inside [evStart, evEnd), a
        // conservative single-point check since tasks don't always carry a
        // duration of their own.
        if (taskMins >= evStart && taskMins < evEnd) {
          const ids = [ev.member_id, ...(ev.member_ids ?? [])].filter(Boolean) as string[];
          ids.forEach(id => conflictedMemberIds.add(id));
        }
      }
    }

    // ── 5. Load route context (if any was pre-computed for this task+member) ─
    const { data: routeRows } = await supabase
      .from('route_context')
      .select('member_id, incremental_duration_seconds')
      .eq('family_id', familyId)
      .eq('reference_event_id', taskType === 'event' ? taskId : null);
    const routeByMember = new Map<string, number>();
    for (const r of routeRows ?? []) {
      if (r.member_id && r.incremental_duration_seconds != null) {
        routeByMember.set(r.member_id, r.incremental_duration_seconds);
      }
    }

    // ── 5b. Live GPS fallback — this app already has real-time location
    // tracking (member_locations, populated by gps-location-updater) fully
    // independent of the Apple Maps routing integration used for
    // route_context above. Two uses, both real data, no fabrication:
    //   - Availability: if GPS shows a candidate away from home in a named
    //     safe zone (school, work) with a RECENT ping, that's a stronger
    //     "are they actually free" signal than an empty calendar.
    //   - Route fallback: distance_from_home_miles is already computed
    //     (Haversine, straight-line — not a driving route, but real and
    //     free) — used only when route_context has no entry for this
    //     candidate at all, i.e. as a fallback signal, never overriding a
    //     real Apple Maps route once one exists.
    const GPS_FRESH_MS = 30 * 60_000; // 30 min — stale pings aren't trusted
    const { data: gpsRows } = await supabase
      .from('member_locations')
      .select('member_id, distance_from_home_miles, status, safe_zone_name, last_updated')
      .eq('family_id', familyId);
    const gpsByMember = new Map<string, { milesFromHome: number | null; awayFromHome: boolean; safeZoneName: string | null }>();
    for (const g of gpsRows ?? []) {
      if (!g.member_id || !g.last_updated) continue;
      const ageMs = Date.now() - new Date(g.last_updated).getTime();
      if (ageMs > GPS_FRESH_MS) continue; // stale — don't trust it for a live decision
      gpsByMember.set(g.member_id, {
        milesFromHome: g.distance_from_home_miles ?? null,
        awayFromHome: (g.distance_from_home_miles ?? 0) > 0.2, // >~1000ft counts as "out"
        safeZoneName: g.safe_zone_name ?? null,
      });
    }

    // ── 6. Score every non-hard-excluded candidate ────────────────────────────
    const maxDebt = Math.max(1, ...candidates.map(c => c.effort_debt_7d ?? 0)); // avoid /0
    const scored: CandidateScore[] = [];

    for (const c of candidates) {
      const breakdown = { history: 0, availability: 0, route: 0, preference: 0, fairness: 0, contextFit: 0 };

      // Hard exclusion: explicit "never" rule
      const never = neverRule(c.id);
      if (never) {
        scored.push({
          memberId: c.id, memberName: c.name, score: 0, breakdown,
          excluded: true, exclusionReason: `"never" rule for category "${category}"`,
        });
        continue;
      }
      // Hard exclusion: calendar conflict at the task's time
      if (conflictedMemberIds.has(c.id)) {
        scored.push({
          memberId: c.id, memberName: c.name, score: 0, breakdown,
          excluded: true, exclusionReason: 'Calendar conflict at the scheduled time',
        });
        continue;
      }

      // Hard exclusion: GP ride-dispatch preferences (Cheerleader Mode,
      // weekly cap, drive window) — a grandparent who's opted OUT of
      // driving, or already at/over their stated weekly ride cap, must
      // never be auto-dispatched a ride. This is the difference between
      // zero-touch respecting a GP's own stated limits vs. silently
      // overriding them — only applies to rides (taskType 'event') and
      // grandparent candidates; parents/teens have no such preferences.
      if (taskType === 'event' && c.role === 'grandparent') {
        if (c.gp_cheerleader_mode) {
          scored.push({
            memberId: c.id, memberName: c.name, score: 0, breakdown,
            excluded: true, exclusionReason: 'Cheerleader Mode — opted out of driving requests',
          });
          continue;
        }
        if (taskDate) {
          const weekStart = new Date(taskDate + 'T12:00');
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const weekStartStr = weekStart.toISOString().slice(0, 10);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 7);
          const weekEndStr = weekEnd.toISOString().slice(0, 10);
          // member_id is the ride's SUBJECT (the kid needing the ride), not
          // who's driving it — a GP is essentially never the subject of a
          // ride, so this count was always 0 and the cap never fired (QA
          // Round 9, High Finding 3 — verified live with a GP already at 2
          // confirmed rides against cap=1, still ranked top candidate,
          // uncapped). helper_name is where a confirmed driver's name
          // actually lands (see eventStore.ts's own row mapping).
          // Missing deleted_at filter meant a ride the parent had since
          // CANCELLED still counted against the GP's weekly cap for the
          // rest of that week, with no visible cause (QA Round 10
          // verification finding — hit live: a soft-deleted ride from 5
          // hours earlier still excluded the GP from candidacy).
          const { count: ridesThisWeek } = await supabase
            .from('calendar_events')
            .select('id', { count: 'exact', head: true })
            .eq('family_id', familyId)
            .eq('helper_name', c.name)
            .eq('helper_status', 'confirmed')
            .gte('date', weekStartStr)
            .lt('date', weekEndStr)
            .is('deleted_at', null);
          if ((ridesThisWeek ?? 0) >= (c.gp_weekly_ride_cap ?? 2)) {
            scored.push({
              memberId: c.id, memberName: c.name, score: 0, breakdown,
              excluded: true, exclusionReason: `Already at weekly ride cap (${c.gp_weekly_ride_cap ?? 2})`,
            });
            continue;
          }
          const dayOfWeek = new Date(taskDate + 'T12:00').getDay();
          const driveDays = c.gp_drive_window_days ?? [2, 4];
          if (!driveDays.includes(dayOfWeek)) {
            scored.push({
              memberId: c.id, memberName: c.name, score: 0, breakdown,
              excluded: true, exclusionReason: 'Outside configured drive days',
            });
            continue;
          }
          if (taskTime) {
            const [tH, tM] = taskTime.split(':').map(Number);
            const taskMins = (tH ?? 0) * 60 + (tM ?? 0);
            const [sH, sM] = (c.gp_drive_window_start ?? '14:00').split(':').map(Number);
            const [eH, eM] = (c.gp_drive_window_end ?? '17:30').split(':').map(Number);
            const startMins = (sH ?? 0) * 60 + (sM ?? 0);
            const endMins = (eH ?? 0) * 60 + (eM ?? 0);
            if (taskMins < startMins || taskMins > endMins) {
              scored.push({
                memberId: c.id, memberName: c.name, score: 0, breakdown,
                excluded: true, exclusionReason: 'Outside configured drive hours',
              });
              continue;
            }
          }
        }
      }

      // History/reliability — reliability_score is already 0-1
      breakdown.history = clamp((c.reliability_score ?? 1) * 100) * WEIGHTS.history;

      // Availability — no hard conflict already confirmed above (calendar
      // conflicts are a hard exclusion, not scored here). A fresh GPS ping
      // showing the candidate away from home in a named place (school,
      // work) is real corroborating evidence they're occupied even when
      // their calendar has no entry for it — dock a little rather than
      // excluding, since "away from home" isn't proof of unavailability
      // the way an overlapping calendar event is.
      const gps = gpsByMember.get(c.id);
      const awayWithNoCalendarEntry = gps?.awayFromHome && gps?.safeZoneName && !conflictedMemberIds.has(c.id);
      breakdown.availability = (
        !taskDate || !taskTime ? 60          // no scheduled time — signal is moot, neutral
        : awayWithNoCalendarEntry ? 75        // corroborated "probably busy" from live GPS, softer than a hard exclusion
        : 100
      ) * WEIGHTS.availability;

      // Route/context — prefer a real Apple Maps incremental-burden number
      // when one exists (route_context, populated by maps-directions).
      // Falling back to live GPS straight-line distance-from-home when no
      // route_context row exists yet for this candidate — real data, not a
      // routing calculation, but a genuine "who's already out and about"
      // signal that costs nothing and needs no API key. Only when NEITHER
      // exists does this stay the neutral placeholder.
      const incrementalSec = routeByMember.get(c.id);
      let routeScore: number;
      if (incrementalSec != null) {
        routeScore = clamp(100 - incrementalSec / 60 * 5); // -5 pts per extra minute, floor 0
      } else if (gps?.milesFromHome != null) {
        // Closer to home (likely closer to most errands) scores a little
        // higher than someone already several miles out — a coarse proxy,
        // not a real route, so kept mild (max +/-20 either side of neutral).
        routeScore = clamp(60 + (2 - Math.min(gps.milesFromHome, 4)) * 5);
      } else {
        routeScore = 60;
      }
      breakdown.route = routeScore * WEIGHTS.route;

      // Preference — driven ONLY by explicit family prefer/avoid rules.
      // gp_welcome/teen_eligible already do their job at the eligibility
      // gate above (who's even in the candidate pool) — they must NOT also
      // add a scoring boost here, or "grandparent is allowed to help" turns
      // into "grandparent is preferred over the parents", which is a real
      // bug: on a family with no usage history yet (reliability_score/
      // effort_debt all at their defaults for every member), preference is
      // the ONLY component that differs between candidates, so a role-based
      // boost here silently wins every tie — Mary would out-score Priya and
      // Alex on nearly every gp_welcome category regardless of who's
      // actually more available or already carrying more of the load. No
      // candidate gets a default edge over another based on role alone.
      let prefScore = 50; // neutral
      if (preferRule(c.id)) prefScore = 100;
      else if (avoidRule(c.id)) prefScore = 10;
      breakdown.preference = prefScore * WEIGHTS.preference;

      // Fairness — inverse of this candidate's share of 7-day effort debt
      // relative to whoever carries the most right now
      const debtShare = (c.effort_debt_7d ?? 0) / maxDebt;
      breakdown.fairness = clamp(100 - debtShare * 100) * WEIGHTS.fairness;

      // Context fit — placeholder neutral score. The spec's "task/context
      // fit" signal (e.g. a candidate's historical completion rate FOR
      // THIS SPECIFIC CATEGORY, not just overall reliability) needs
      // responsibility_history to accumulate real rows before it can be
      // computed meaningfully — until there's enough history, this stays a
      // flat neutral contribution rather than a fabricated number.
      breakdown.contextFit = 60 * WEIGHTS.contextFit;

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      scored.push({ memberId: c.id, memberName: c.name, score: clamp(total), breakdown, excluded: false });
    }

    const eligible = scored.filter(s => !s.excluded).sort((a, b) => b.score - a.score);
    const excluded = scored.filter(s => s.excluded);

    // ── 7. Decide AUTO / SUGGEST / ASK ────────────────────────────────────────
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

      // Hard rule from the spec: "high-risk task without confirmation"
      // never auto-assigns, no matter how confident the score is. Category
      // sensitivity comes from the real taxonomy now, not a caller-supplied
      // guess — a high_risk category (e.g. medical.emergency) can never
      // silently AUTO, only SUGGEST at best, and 'sensitive' categories
      // (e.g. financial.bill_pay) never AUTO either, only SUGGEST/ASK.
      const sensitiveOverride = requiresConfirmation(top.memberId)
        || sensitivity === 'high_risk'
        || sensitivity === 'sensitive';
      if (!sensitiveOverride && top.score >= AUTO_MIN_TOP && gap >= AUTO_MIN_GAP) {
        decisionType = 'auto';
        selectedMemberId = top.memberId;
      } else if (top.score >= SUGGEST_MIN_TOP && gap >= SUGGEST_MIN_GAP) {
        decisionType = 'suggest';
        selectedMemberId = top.memberId;
      } else {
        decisionType = 'ask';
        selectedMemberId = top.memberId; // top pick shown as the default option, not auto-applied
      }
    }

    const explanation = {
      selected: selectedMemberId ? eligible.find(e => e.memberId === selectedMemberId)?.memberName : null,
      topScore: eligible[0]?.score ?? null,
      gap: eligible.length > 1 ? eligible[0].score - eligible[1].score : null,
      excludedCount: excluded.length,
      excludedReasons: excluded.map(e => ({ member: e.memberName, reason: e.exclusionReason })),
      categoryId: categoryRow.id,
      categorySensitivity: sensitivity,
      eligibility: { needsParent, teenEligible, gpWelcome, rolesConsidered: eligibleRoles },
    };

    // ── 8. Write the audit record — every decision, not just AUTO ones ───────
    let decisionId: string | null = null;
    if (!dryRun) {
      const { data: inserted, error: insErr } = await supabase
        .from('assignment_decisions')
        .insert({
          family_id: familyId,
          task_id: taskId,
          task_type: taskType,
          selected_member_id: decisionType === 'blocked' ? null : selectedMemberId,
          decision_type: decisionType,
          confidence,
          candidate_scores: scored,
          explanation,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      decisionId = inserted?.id ?? null;

      // ── 9. If AUTO, actually assign it and log to responsibility_history ───
      if (decisionType === 'auto' && selectedMemberId) {
        const table = taskType === 'chore' ? 'chore_tasks' : taskType === 'event' ? 'calendar_events' : 'errands';
        // calendar_events has no "helper" column — the real column is
        // helper_name (confirmed against information_schema; eventStore.ts
        // maps it the same way). This silently failed every AUTO write on
        // targetField:'helper' while still recording a responsibility_history
        // row claiming the assignment succeeded (QA Round 9, Critical
        // Finding 2 — reproduced live: update was a no-op, decision +
        // history rows still landed, poisoning the fairness/effort-debt
        // ledger with an assignment that never actually happened).
        const assigneeColumn =
          targetField === 'helper' ? 'helper_name' :
          targetField === 'driver' ? 'driver_name' :
          taskType === 'event' ? 'member_id' : 'assigned_to_id';
        // 'helper'/'driver' store a display name on calendar_events
        // (external helpers like a coach have no member row at all), not a
        // member_id — resolve the picked member's name for that column.
        let assigneeValue: string | null = selectedMemberId;
        if (targetField === 'helper' || targetField === 'driver') {
          const { data: m } = await supabase.from('members').select('name').eq('id', selectedMemberId).single();
          assigneeValue = m?.name ?? null;
        }
        const updatePatch: Record<string, unknown> = {
          [assigneeColumn]: assigneeValue,
          assignment_decision_id: decisionId,
        };
        if (targetField === 'helper') updatePatch.helper_status = 'confirmed';
        if (targetField === 'driver') { updatePatch.driver_status = 'confirmed'; updatePatch.ride_required = true; }
        const { error: updateErr } = await supabase.from(table).update(updatePatch).eq('id', taskId);
        // The write's own error was previously discarded, so a failed
        // assignment (wrong column, RLS denial, etc) still fell through to
        // recording a responsibility_history row claiming success — a
        // split-brain audit trail the fairness engine then trusted. Never
        // write history for an assignment that didn't actually land.
        if (updateErr) throw updateErr;

        await supabase.from('responsibility_history').insert({
          family_id: familyId,
          [taskType === 'chore' ? 'chore_id' : taskType === 'event' ? 'event_id' : 'errand_id']: taskId,
          member_id: selectedMemberId,
          category,
          responsibility_type: taskType === 'chore' ? 'chore' : taskType === 'event' ? 'adult_task' : 'errand',
          outcome: 'assigned',
          metadata: { decisionId, auto: true, targetField },
        });
      }
    }

    return json({
      decisionType, selectedMemberId, confidence, decisionId,
      candidates: scored, explanation, dryRun,
    });

  } catch (err: any) {
    console.error('[process-task-assignment] fatal:', err);
    return json({ error: err.message ?? String(err) }, 500);
  }
});
