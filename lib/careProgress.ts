/**
 * Species-aware care-progress calculation.
 *
 * Each species has a set of "expected daily activities" that form the baseline.
 * Custom checklist items are added on top (deduplicating any type already covered
 * by the species baseline so nothing is double-counted).
 *
 * Returns 0.0–1.0.
 */

/**
 * Uniform progress color used everywhere (hero card, today carousel,
 * filter strip, widget, summary card).
 *   0 %        → red   #EF4444
 *   1 – 59 %   → red   #EF4444  (needs attention)
 *   60 – 99 %  → amber #F59E0B  (good progress)
 *   100 %      → green #22C55E  (complete)
 */
export function careProgressColor(pct: number): string {
  if (pct >= 100) return '#22C55E';
  if (pct >= 60)  return '#F59E0B';
  return '#EF4444';
}

interface SpeciesSlots {
  meals: number;   // expected meal logs per day
  walk:  boolean;  // expects a walk
  mood:  boolean;  // expects a mood check
}

const SPECIES_SLOTS: Record<string, SpeciesSlots> = {
  dog:      { meals: 2, walk: true,  mood: true  },
  cat:      { meals: 2, walk: false, mood: true  },
  rabbit:   { meals: 2, walk: false, mood: true  },
  bird:     { meals: 1, walk: false, mood: false },
  fish:     { meals: 1, walk: false, mood: false },
  reptile:  { meals: 1, walk: false, mood: false },
  hamster:  { meals: 1, walk: false, mood: false },
  guinea:   { meals: 2, walk: false, mood: false },
  turtle:   { meals: 1, walk: false, mood: false },
  other:    { meals: 1, walk: false, mood: false },
};

function resolveSlots(species?: string | null): SpeciesSlots {
  if (!species) return SPECIES_SLOTS.other;
  return SPECIES_SLOTS[species.toLowerCase()] ?? SPECIES_SLOTS.other;
}

export function computeCareProgress(opts: {
  petId:      string;
  today:      string; // 'YYYY-MM-DD'
  species?:   string | null;
  checklist:  Record<string, any[]>;
  feedingLogs: Record<string, any[]>;
  moodLogs:   Record<string, any[]>;
}): number {
  const { petId, today, species, checklist, feedingLogs, moodLogs } = opts;
  const slots  = resolveSlots(species);
  const feeds  = feedingLogs[`${petId}:${today}`] ?? [];
  const items  = (checklist[petId] ?? []).filter((i: any) => i.date === today || !i.date);
  const moods  = (moodLogs[petId] ?? []).filter((l: any) => l.date === today);
  const mealFeeds = feeds.filter((f: any) => f.meal_type !== 'water');

  let done = 0, total = 0;

  // ── Species baseline ────────────────────────────────────────────────────────

  // Meal slots (capped at species expectation)
  total += slots.meals;
  const mealSlotsDone =
    (mealFeeds.some((f: any) => f.meal_type === 'breakfast' || f.meal_type === 'meal') ? 1 : 0) +
    (mealFeeds.some((f: any) => f.meal_type === 'lunch')  ? 1 : 0) +
    (mealFeeds.some((f: any) => f.meal_type === 'dinner') ? 1 : 0) +
    (mealFeeds.some((f: any) => f.meal_type === 'treat')  ? 1 : 0);
  done += Math.min(mealSlotsDone, slots.meals);

  // Walk slot (species-gated)
  if (slots.walk) {
    total++;
    if (items.some((i: any) => i.type === 'walk' && i.completed)) done++;
  }

  // Mood slot (species-gated)
  if (slots.mood) {
    total++;
    if (moods.length > 0) done++;
  }

  // ── Custom checklist items (exclude types already covered above) ────────────
  const coveredTypes = new Set<string>(['meal', 'treat', 'water']);
  if (slots.walk) coveredTypes.add('walk');
  if (slots.mood) coveredTypes.add('mood');

  const extraItems = items.filter((i: any) => !coveredTypes.has(i.type));
  if (extraItems.length > 0) {
    total += extraItems.length;
    done  += extraItems.filter((i: any) => i.completed).length;
  }

  // Walk items for non-walk species still count as extra
  if (!slots.walk) {
    const walkItems = items.filter((i: any) => i.type === 'walk');
    if (walkItems.length > 0) {
      total += walkItems.length;
      done  += walkItems.filter((i: any) => i.completed).length;
    }
  }

  return total > 0 ? done / total : 0;
}
