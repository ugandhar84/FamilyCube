/**
 * useKioskMeals — reads this week's real meal plan for the kiosk.
 *
 * Meals are NOT a net-new domain in this app and this hook deliberately
 * does not create a store for them. The real feature is
 * features/vault/tabs/MealsTab.tsx, backed by the `family_meals` Supabase
 * table keyed by (family_id, week_of, day) — its `Meal` type, its `weekOf()`
 * week-start helper and its 'Mon'|'Tue'|… day convention are all imported
 * from features/vault/tabs/meals/types.ts here rather than restated, so the
 * two surfaces cannot drift apart on the shape of a meal.
 *
 * Why a hook rather than a Zustand store: MealsTab itself holds meals in
 * plain component state with a single `select('*').eq('week_of', …)` fetch.
 * Introducing a store now would mean two competing sources of truth for the
 * same table (the store, and MealsTab's own useState) — strictly worse than
 * this hook running the same query MealsTab runs. If meals ever do get a
 * store, both surfaces should move to it together.
 *
 * Realtime: subscribes to family_meals, so a meal added or reassigned from
 * a phone appears on the kitchen display without anyone touching it — which
 * is the entire point of a wall-mounted always-on dashboard.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { type Meal, weekOf, DAYS } from '@/features/vault/tabs/meals/types';

/** Today in the 'Mon'|'Tue'|… form `family_meals.day` stores. */
export function todayMealDay(): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
}

/**
 * DAYS ('Mon'…'Sun') rotated so today leads. A kitchen display should open
 * on tonight's dinner, not on Monday — the mockup's own three meal cards
 * are "Tonight / Sunday / Monday", i.e. forward from now.
 */
export function daysFromToday(): string[] {
  const i = DAYS.indexOf(todayMealDay());
  return i < 0 ? [...DAYS] : [...DAYS.slice(i), ...DAYS.slice(0, i)];
}

export function useKioskMeals() {
  const members = useFamilyStore(s => s.members);
  const familyId = (members[0] as any)?.familyId as string | undefined;
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const week = weekOf();

  const load = useCallback(async () => {
    // Same query MealsTab.load() runs. Scoped by family_id as well when we
    // have one — MealsTab omits it (relying on RLS), but a kiosk session
    // can mount before members resolve, and being explicit costs nothing.
    let q = supabase.from('family_meals').select('*').eq('week_of', week);
    if (familyId) q = q.eq('family_id', familyId);
    const { data, error } = await q.order('day');
    if (error) console.warn('[useKioskMeals] load error', error.message);
    if (data) setMeals(data as Meal[]);
    setLoading(false);
  }, [week, familyId]);

  useEffect(() => {
    load();
    // Debounced, for the same reason KioskFindFamTab debounces its own
    // realtime reload: a burst of writes (confirming a whole AI-generated
    // week inserts 7-14 rows at once) would otherwise fire one full
    // re-fetch per row.
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`kiosk_meals_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_meals' }, () => {
        if (t) clearTimeout(t);
        t = setTimeout(load, 400);
      })
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [load]);

  return { meals, loading, reload: load, week };
}
