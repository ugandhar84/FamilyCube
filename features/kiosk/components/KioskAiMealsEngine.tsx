/**
 * KioskAiMealsEngine — kiosk mount of the real CubeAI Meal Planner
 * (family-ai `meal_plan` action, week-of-options generation, pick-and-
 * confirm phase), previously deliberately scoped OUT of KioskMealsTab.tsx
 * ("NO AI meal generation... Kiosk READS the plan... planning the week
 * stays on the phone") — reversed on request, matching the same treatment
 * KioskAiChoresEngine already gives the Chores tab's own CubeAI engine
 * [live-requested: "need to ai section similar to the chores ,, to match
 * the mobile functionality"].
 *
 * Rendered INLINE on the meal-plan panel, same as mobile's own always-
 * inline AiPlannerBanner/MealSelectionPhase placement — NOT a right-side
 * drawer [clarified after an initial drawer-wrapped attempt: "oh Ai
 * repose can be inline but the open and view the recipies should be side
 * form" — the side-form treatment is reserved for opening/viewing one
 * meal's recipe (KioskRecipeDrawer, unchanged), not the planner's own
 * banner/results].
 *
 * Reuses the real components directly rather than re-implementing them —
 * AiPlannerBanner (the header + preference chips + input) and
 * MealSelectionPhase (the pick-up-to-2-per-day review/confirm step), from
 * features/vault/tabs/meals/, are both genuinely exported, self-contained,
 * prop-driven components with no Modal of their own — same category as
 * KioskAiChoresEngine's own AutoBalanceCard/FomoCard/AdviceCard reuse, not
 * something that needed forking.
 *
 * generateMealPlan/confirmPlan below are ported from MealsTab.tsx's own
 * identically-named functions (read in full before writing this) — plain
 * logic with no React-screen coupling beyond local state, just relocated
 * to a kiosk-owned component so it can call the same real family-ai edge
 * function and family_meals table kiosk already reads via useKioskMeals,
 * instead of duplicating a second implementation. MealsTab.tsx itself is
 * completely untouched.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import AiPlannerBanner from '@/features/vault/tabs/meals/AiPlannerBanner';
import MealSelectionPhase from '@/features/vault/tabs/meals/MealSelectionPhase';
import {
  AiDayOptions, AiMealResult,
  MEAL_CACHE_KEY, CACHE_TTL_MS, detectDays, weekOf,
} from '@/features/vault/tabs/meals/types';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskColors } from '../kioskPalette';

export function KioskAiMealsEngine({
  familyId, members, onPlanSaved,
}: {
  familyId: string;
  members: FamilyMember[];
  /** Called after a plan is successfully saved — kiosk reloads its own
   *  useKioskMeals list (which also has its own realtime subscription, so
   *  this is a belt-and-braces immediate refresh, not the only way the
   *  new plan would ever show up). */
  onPlanSaved?: () => void;
}) {
  const { k, isDark } = useKioskColors();

  // AiPlannerBanner/MealSelectionPhase expect a phone-shaped `colors`
  // theme — a thin field-by-field adapter onto KioskColors' own tokens,
  // same pattern KioskPinStoreLocationSheet.tsx's own phoneColorsShim
  // uses for LocationAutocompleteInput, rather than reimplementing either
  // component kiosk-side or pulling in the real (wrong-palette) mobile
  // useTheme(). Confirmed by grep: together they only ever read these 8
  // fields (accent/background/border/danger/success/surface/teal/
  // textPrimary/textSecondary/textTertiary).
  const colors = {
    accent: k.purple, background: k.bg, border: k.cardBorder,
    danger: k.danger, success: k.sage, surface: k.well, teal: k.sage,
    textPrimary: k.text, textSecondary: k.textMuted, textTertiary: k.textFaint,
  };
  const curWeek = weekOf();

  const [aiOpen, setAiOpen]       = useState(true);
  const [aiPref, setAiPref]       = useState('Kid-friendly, high-protein, 30 min max');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState<string | null>(null);
  const [groceryList, setGroceryList] = useState<string[]>([]);
  const [tip, setTip]                 = useState<string | null>(null);
  const [pendingOptions, setPendingOptions] = useState<AiDayOptions[] | null>(null);
  const [selected, setSelected]             = useState<Record<string, number[]>>({});
  const [savingPlan, setSavingPlan]         = useState(false);

  // Same pulse animation AiPlannerBanner's own status dot uses on mobile.
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 2.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(pulseScale,   { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
      ]),
      Animated.delay(400),
    ])).start();
  }, []);

  // Restore cached grocery list/tip — same MEAL_CACHE_KEY MealsTab.tsx
  // itself reads/writes, so a plan generated on kiosk and one generated on
  // a phone share the same cache rather than kiosk keeping a second copy.
  useEffect(() => {
    AsyncStorage.getItem(MEAL_CACHE_KEY).then(raw => {
      if (!raw) return;
      try {
        const { groceryList: gl, tip: t, savedAt } = JSON.parse(raw);
        if (Date.now() - savedAt < CACHE_TTL_MS) {
          if (gl?.length) setGroceryList(gl);
          if (t) setTip(t);
        }
      } catch {}
    });
  }, []);

  const generateMealPlan = async () => {
    setAiLoading(true);
    setAiError(null);
    setPendingOptions(null);
    setSelected({});
    try {
      const localeRegion = Intl.DateTimeFormat().resolvedOptions().locale?.split('-').pop()?.toUpperCase() ?? 'US';
      const useMetric = !['US', 'LR', 'MM'].includes(localeRegion);
      const dayNames = detectDays(aiPref);

      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'meal_plan',
          preferences: aiPref.trim() || 'Kid-friendly, balanced, under 35 min prep',
          dayNames,
          members: members.map(m => ({ name: (m as any).name, role: (m as any).role })),
          useMetric, region: localeRegion,
        },
      });
      if (error) throw new Error(error.message);
      const result: AiMealResult = data?.result ?? data;
      if (!result?.weeklyOptions?.length) throw new Error('No options returned');

      const defaults: Record<string, number[]> = {};
      result.weeklyOptions.forEach(d => { defaults[d.day] = [0]; });

      setPendingOptions(result.weeklyOptions);
      setSelected(defaults);
      setGroceryList(result.groceryAutoList ?? []);
      setTip(result.nutritionCoachingTip ?? null);
      setAiOpen(false);
    } catch {
      setAiError('Couldn\'t generate plan. Check connection and try again.');
    }
    setAiLoading(false);
  };

  const confirmPlan = async () => {
    if (!pendingOptions) return;
    setSavingPlan(true);
    const MEAL_TYPE_LABELS = ['lunch', 'dinner'];
    const upserts = pendingOptions.flatMap(dayOpt => {
      const indices = selected[dayOpt.day] ?? [0];
      return indices.map((idx, slot) => {
        const m = dayOpt.options[idx];
        return {
          id: `${familyId}-${curWeek}-${dayOpt.day}-${slot}-${Date.now()}`,
          family_id: familyId, week_of: curWeek,
          day: dayOpt.day,
          title: m.mealName,
          type: indices.length > 1 ? (MEAL_TYPE_LABELS[slot] ?? 'dinner') : 'dinner',
          chef_id: null,
          ingredients:         m.ingredientsList,
          emoji:               m.emoji ?? null,
          prep_minutes:        m.prepMinutes,
          dietary_tags:        m.dietaryTags,
          kid_friendly_rating: m.kidFriendlyRating,
          prep_steps:          m.prepSteps ?? [],
          ai_generated:        true,
        };
      });
    });

    try {
      await supabase.from('family_meals')
        .delete().eq('family_id', familyId).eq('week_of', curWeek).eq('ai_generated', true);

      const { data: inserted, error: insertErr } = await supabase
        .from('family_meals').insert(upserts).select();

      if (insertErr) throw new Error(insertErr.message);

      if (inserted && inserted.length > 0) {
        setPendingOptions(null);
        setSelected({});
        onPlanSaved?.();
      }

      AsyncStorage.setItem(MEAL_CACHE_KEY, JSON.stringify({
        groceryList, tip, savedAt: Date.now(),
      }));
    } catch (err: any) {
      setAiError(err?.message ?? 'Something went wrong saving your plan. Please try again.');
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <>
      <AiPlannerBanner
        colors={colors} isDark={isDark}
        aiOpen={aiOpen} setAiOpen={setAiOpen}
        pulseOpacity={pulseOpacity} pulseScale={pulseScale}
        aiPref={aiPref} setAiPref={setAiPref}
        aiLoading={aiLoading} aiError={aiError}
        generateMealPlan={generateMealPlan}
      />
      {pendingOptions && (
        <MealSelectionPhase
          colors={colors} isDark={isDark}
          pendingOptions={pendingOptions} setPendingOptions={setPendingOptions}
          selected={selected} setSelected={setSelected}
          tip={tip} savingPlan={savingPlan} confirmPlan={confirmPlan}
        />
      )}
    </>
  );
}
