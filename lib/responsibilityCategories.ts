// Client-side access to the Responsibility Engine's category taxonomy
// (responsibility_categories table) — the fixed domain/subcategory
// vocabulary the assignment algorithm (process-task-assignment,
// process-kid-chore-assignment) scores against. Distinct from
// familyCustomCategories.ts, which is a per-family custom-label system for
// event/quest titles — this is the shared, global taxonomy every family
// uses so responsibility_rules and fairness scoring stay consistent.
import { supabase } from '@/lib/supabase';

export interface ResponsibilityCategory {
  id: string;                 // slug, e.g. 'medical.doctor_visit'
  domain: string;              // e.g. 'medical'
  domainLabel: string;         // e.g. 'Medical'
  subcategory: string;
  subcategoryLabel: string;
  defaultSensitivity: 'routine' | 'important' | 'sensitive' | 'high_risk';
  typicalEffortPoints: number;
  defaultNeedsParent: boolean;
  defaultTeenEligible: boolean;
  defaultGpWelcome: boolean;
  iconHint: string | null;
}

let _cache: ResponsibilityCategory[] | null = null;
let _cachePromise: Promise<ResponsibilityCategory[]> | null = null;

function fromRow(r: any): ResponsibilityCategory {
  return {
    id: r.id,
    domain: r.domain,
    domainLabel: r.domain_label,
    subcategory: r.subcategory,
    subcategoryLabel: r.subcategory_label,
    defaultSensitivity: r.default_sensitivity,
    typicalEffortPoints: r.typical_effort_points,
    defaultNeedsParent: r.default_needs_parent ?? false,
    defaultTeenEligible: r.default_teen_eligible ?? false,
    defaultGpWelcome: r.default_gp_welcome ?? false,
    iconHint: r.icon_hint ?? null,
  };
}

/** All active categories, domain-grouped order. Cached for the process lifetime — this is shared reference data, not per-family. */
export async function fetchResponsibilityCategories(): Promise<ResponsibilityCategory[]> {
  if (_cache) return _cache;
  if (_cachePromise) return _cachePromise;
  _cachePromise = (async () => {
    const { data, error } = await supabase
      .from('responsibility_categories')
      .select('id, domain, domain_label, subcategory, subcategory_label, default_sensitivity, typical_effort_points, default_needs_parent, default_teen_eligible, default_gp_welcome, icon_hint')
      .eq('active', true)
      .order('sort_order');
    if (error) { console.warn('[responsibilityCategories] fetch failed:', error.message); _cachePromise = null; return []; }
    _cache = (data ?? []).map(fromRow);
    return _cache;
  })();
  return _cachePromise;
}

/** Group by domain for a two-level picker UI. */
export async function fetchCategoriesByDomain(): Promise<Record<string, ResponsibilityCategory[]>> {
  const all = await fetchResponsibilityCategories();
  const grouped: Record<string, ResponsibilityCategory[]> = {};
  for (const c of all) {
    (grouped[c.domain] ??= []).push(c);
  }
  return grouped;
}

/**
 * Best-effort lookup for pre-filling eligibility toggles from a loose
 * category string (e.g. this app's existing EventCategory values like
 * "Medical", "Ride", "Errand"). Tries an exact domain match first (case-
 * insensitive), then a small hand-mapped alias table for the handful of
 * existing category names that don't literally match a taxonomy domain
 * (Ride -> transport, Study -> school, Event/Birthday -> social).
 * Returns null when nothing reasonable matches — callers should leave
 * existing manual toggles untouched in that case, not force them off.
 */
const DOMAIN_ALIASES: Record<string, string> = {
  ride: 'transport',
  study: 'school',
  event: 'social',
  birthday: 'social',
  // QuestCategory (store/questStore.ts) is a different, chore-domain-
  // specific vocabulary from EventCategory — 'Kitchen'/'Room'/'Yard'/etc.
  // Mapped separately here rather than assuming these line up with the
  // event aliases above.
  kitchen: 'household',
  room: 'household',
  yard: 'household',
  school: 'school',
  pet: 'household',
  'living room': 'household',
  garage: 'household',
  bathroom: 'household',
  laundry: 'household',
  errand: 'errand',
  tech: 'household',
  finance: 'financial',
  health: 'medical',
  garden: 'household',
  car: 'household',
  shopping: 'errand',
  cooking: 'household',
  social: 'social',
  creative: 'household',
};

export async function lookupCategoryDefaultsByLooseLabel(label: string): Promise<{
  needsParent: boolean; teenEligible: boolean; gpWelcome: boolean; matchedDomain: string;
} | null> {
  const all = await fetchResponsibilityCategories();
  const lower = label.toLowerCase().trim();
  const targetDomain = DOMAIN_ALIASES[lower] ?? lower;
  const matches = all.filter(c => c.domain === targetDomain);
  if (matches.length === 0) return null;
  // A category string like "Medical" has no subcategory of its own — use
  // the domain's most common defaults (majority vote across its
  // subcategories) rather than picking one arbitrary subcategory's values.
  const needsParentVotes = matches.filter(c => c.defaultNeedsParent).length;
  const teenEligibleVotes = matches.filter(c => c.defaultTeenEligible).length;
  const gpWelcomeVotes = matches.filter(c => c.defaultGpWelcome).length;
  return {
    needsParent: needsParentVotes > matches.length / 2,
    teenEligible: teenEligibleVotes > matches.length / 2,
    gpWelcome: gpWelcomeVotes > matches.length / 2,
    matchedDomain: targetDomain,
  };
}

/** Resolve a loose app-level category label (e.g. "Ride") to its taxonomy domain slug (e.g. "transport"), for looking up subcategory options. */
export function resolveDomainFromLooseLabel(label: string): string {
  const lower = label.toLowerCase().trim();
  return DOMAIN_ALIASES[lower] ?? lower;
}

/** Subcategories for one domain, in sort order — feeds the optional subcategory refinement chips. */
export async function fetchSubcategoriesForDomain(domain: string): Promise<ResponsibilityCategory[]> {
  const grouped = await fetchCategoriesByDomain();
  return grouped[domain] ?? [];
}

// ── Assignment suggestion (process-task-assignment) ─────────────────────
// Lets a form call the live Responsibility Engine and show the result
// in-place, instead of the engine being a backend-only capability nobody
// in the app can see.

export interface AssignmentCandidateScore {
  memberId: string;
  memberName: string;
  score: number;
  excluded: boolean;
  exclusionReason?: string;
}

export interface AssignmentSuggestion {
  decisionType: 'auto' | 'suggest' | 'ask' | 'blocked';
  selectedMemberId: string | null;
  confidence: number | null;
  candidates: AssignmentCandidateScore[];
  explanation: {
    selected: string | null;
    topScore: number | null;
    gap: number | null;
    excludedReasons: { member: string; reason?: string }[];
    eligibility?: { needsParent: boolean; teenEligible: boolean; gpWelcome: boolean; rolesConsidered: string[] };
  };
  reason?: string; // present when blocked with no candidates at all
  error?: string;
}

/**
 * Calls process-task-assignment for a not-yet-created task, so a parent can
 * see "who would this go to" while still filling out the form. taskId here
 * can be a placeholder — the edge function only uses it for the audit
 * record it writes, and this call always passes dryRun so nothing is
 * written or assigned until the parent actually submits the form.
 */
export async function previewAssignment(params: {
  taskId: string; taskType: 'chore' | 'event' | 'errand'; familyId: string; category: string;
}): Promise<AssignmentSuggestion> {
  const empty = { decisionType: 'blocked' as const, selectedMemberId: null, confidence: null, candidates: [], explanation: { selected: null, topScore: null, gap: null, excludedReasons: [] } };
  try {
    const { data, error } = await supabase.functions.invoke('process-task-assignment', {
      body: { ...params, dryRun: true },
    });
    if (error) return { ...empty, error: error.message ?? 'Request failed' };
    if (data?.error) return { ...empty, error: data.error };
    return data as AssignmentSuggestion;
  } catch (e: any) {
    return { ...empty, error: e.message ?? String(e) };
  }
}

/**
 * Calls process-kid-chore-assignment for an EXISTING chore_tasks row (edit
 * flow only — the kid-scoring function reads age/skill/rotation/effort
 * signals from a real row, so unlike previewAssignment above, this cannot
 * run for a not-yet-created chore). Always dryRun — nothing is written or
 * assigned until the parent explicitly saves changes.
 */
export async function previewKidChoreAssignment(params: {
  choreId: string; familyId: string;
}): Promise<AssignmentSuggestion> {
  const empty = { decisionType: 'blocked' as const, selectedMemberId: null, confidence: null, candidates: [], explanation: { selected: null, topScore: null, gap: null, excludedReasons: [] } };
  try {
    const { data, error } = await supabase.functions.invoke('process-kid-chore-assignment', {
      body: { ...params, dryRun: true },
    });
    if (error) return { ...empty, error: error.message ?? 'Request failed' };
    if (data?.error) return { ...empty, error: data.error };
    return data as AssignmentSuggestion;
  } catch (e: any) {
    return { ...empty, error: e.message ?? String(e) };
  }
}

/**
 * Real (non-preview) call to process-task-assignment — used right after a
 * task/event/errand row is created, so an AUTO decision actually assigns it
 * server-side (writes member_id/assigned_to_id + responsibility_history)
 * instead of the engine only ever being reachable via the manual "Who would
 * this go to?" preview button. SUGGEST/ASK/blocked decisions still just
 * write the audit row (assignment_decisions) and leave the task unassigned —
 * only AUTO self-applies, by design (see process-task-assignment step 9).
 * Silently swallows failures — this fires fire-and-forget after the row the
 * user cares about (the event/chore) is already saved, so a transient engine
 * error should never surface as if the save itself failed.
 */
export async function applyAssignment(params: {
  taskId: string; taskType: 'chore' | 'event' | 'errand'; familyId: string; category: string;
}): Promise<AssignmentSuggestion | null> {
  try {
    const { data, error } = await supabase.functions.invoke('process-task-assignment', {
      body: { ...params, dryRun: false },
    });
    if (error || data?.error) {
      console.warn('[responsibilityCategories] applyAssignment failed:', error?.message ?? data?.error);
      return null;
    }
    return data as AssignmentSuggestion;
  } catch (e: any) {
    console.warn('[responsibilityCategories] applyAssignment threw:', e.message ?? e);
    return null;
  }
}
