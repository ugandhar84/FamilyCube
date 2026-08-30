import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Animated, Alert,
} from 'react-native';
import { ChefHat, RefreshCw, MessageSquare, Check, ShoppingBag } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useEventStore } from '@/store/eventStore';
import { localDateStr } from '@/lib/dates';

import {
  Meal, AiDayOptions, AiMealResult,
  MEAL_CACHE_KEY, CACHE_TTL_MS, DAYS, detectDays, categorizeItem, weekOf,
} from './meals/types';
import FlatSectionHeader from './meals/FlatSectionHeader';
import RecipeModal from './meals/RecipeModal';
import DayCard from './meals/DayCard';
import AiPlannerBanner from './meals/AiPlannerBanner';
import MealSelectionPhase from './meals/MealSelectionPhase';
import MealFormSheet from './meals/MealFormSheet';
import { showToast } from '@/components/AppToast';

// ─── Main MealsTab ────────────────────────────────────────────────────────────

export default function MealsTab({ colors, isDark }: { colors: any; isDark: boolean }) {
  const { members, activeMemberId } = useFamilyStore();
  const familyId    = (members[0] as any)?.familyId ?? 'family-1';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const isKid = (activeMember as any)?.role === 'kid';
  const curWeek     = weekOf();
  const addQuest    = useQuestStore().addQuest;

  const [meals, setMeals]       = useState<Meal[]>([]);
  const [loading, setLoading]   = useState(true);

  // AI state
  const [aiOpen, setAiOpen]       = useState(true);
  const [aiPref, setAiPref]       = useState('Kid-friendly, high-protein, 30 min max');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState<string | null>(null);
  const [groceryList, setGroceryList]   = useState<string[]>([]);
  const [addedCart, setAddedCart]       = useState(false);
  const [tip, setTip]                   = useState<string | null>(null);
  // Selection phase: day → array of 3 options; user picks up to 2 per day
  const [pendingOptions, setPendingOptions] = useState<AiDayOptions[] | null>(null);
  const [selected, setSelected]             = useState<Record<string, number[]>>({}); // day → [indices]
  const [savingPlan, setSavingPlan]         = useState(false);

  // Modals
  const [activeRecipe, setActiveRecipe] = useState<Meal | null>(null);
  const [editMeal, setEditMeal]         = useState<Meal | null>(null);
  const [addDay, setAddDay]             = useState<string | null>(null);
  const [savingMeal, setSavingMeal]     = useState(false);

  // Pulse animation for the AI dot
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('family_meals').select('*').eq('week_of', curWeek).order('day');
    if (data) setMeals(data as Meal[]);
    setLoading(false);
  }, [curWeek]);

  useEffect(() => { load(); }, [load]);

  // Restore cached grocery list
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
    setAddedCart(false);
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

      // Default: first option pre-selected for each day
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
        setMeals(prev => [...prev.filter(m => !m.ai_generated), ...(inserted as Meal[])]);
        setPendingOptions(null);
        setSelected({});
        Alert.alert('Plan Saved', `${inserted.length} meal${inserted.length > 1 ? 's' : ''} added to your week.`);
      } else {
        Alert.alert('Nothing Saved', 'No meals were inserted. Try selecting at least one meal per day.');
      }

      AsyncStorage.setItem(MEAL_CACHE_KEY, JSON.stringify({
        groceryList, tip, savedAt: Date.now(),
      }));
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Something went wrong saving your plan. Please try again.');
    } finally {
      setSavingPlan(false);
    }
  };

  const addGroceryItems = async (names: string[]) => {
    const { addItem, items: existing, familyId: sfId } = useGroceryStore.getState();
    const effectiveFamilyId = sfId ?? familyId;
    const existingNames = new Set(existing.map(i => i.name.toLowerCase().trim()));
    for (const name of names) {
      if (!existingNames.has(name.toLowerCase().trim())) {
        await addItem({ familyId: effectiveFamilyId, name, quantity: '1', category: categorizeItem(name), addedBy: activeMember?.id ?? '', aiGenerated: true });
      }
    }
  };

  const addAllToCart = async () => {
    if (!groceryList.length) return;
    await addGroceryItems(groceryList);
    setAddedCart(true);
  };

  // Shared "Mon"/"Tue"/etc -> real YYYY-MM-DD for THIS week, used by both
  // the cooking-quest due date and the meal's own linked calendar event.
  const dayNameToDate = (day: string): string => {
    const DAYS_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const todayIdx = new Date().getDay(); // 0=Sun
    const dayIdx = DAYS_ORDER.indexOf(day);
    const daysUntil = ((dayIdx - (todayIdx === 0 ? 6 : todayIdx - 1) + 7) % 7);
    const d = new Date();
    d.setDate(d.getDate() + daysUntil);
    // Was due.toISOString() (UTC date) — for anyone west of UTC in the
    // evening this silently wrote a date one calendar day off from what
    // the day picker showed (e.g. picking "Fri" could write Saturday's date).
    return localDateStr(d);
  };

  // "6:00 PM" -> "18:00" (24h, for calendar_events.start_time). Same
  // simple format MealFormSheet.tsx's own picker writes and parses.
  const parseTimeLabelTo24h = (label: string | null | undefined): string | null => {
    if (!label) return null;
    const m = label.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    if (m[3] === 'PM' && h !== 12) h += 12;
    if (m[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };

  const addMinutesToTime = (hhmm: string, minutes: number): string => {
    const [h, m] = hhmm.split(':').map(Number);
    const total = (h * 60 + m + minutes) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Materializes/updates/removes a meal's linked calendar_events row based
  // on whether it currently has a start_time — same "funnel every
  // syncable domain through calendar_events" pattern chores' addChore/
  // updateChore/deleteChore got, so a timed meal rides the existing 2-way
  // calendar sync engine (calendar-sync-push/Apple EventKit) for free.
  // Includes an end time (start + prep_minutes, defaulting to 30min) so a
  // synced external calendar entry covers the actual cooking window
  // instead of being open-ended (live-requested: "put end time too").
  const syncMealCalendarEvent = async (meal: { id: string; day: string; title: string; start_time?: string | null; prep_minutes?: number | null; linked_event_id?: string | null }): Promise<string | null> => {
    const time24 = parseTimeLabelTo24h(meal.start_time);
    const { addEvent, updateEvent, deleteEvent } = useEventStore.getState();

    if (!time24) {
      if (meal.linked_event_id) deleteEvent(meal.linked_event_id);
      return null;
    }
    const date = dayNameToDate(meal.day);
    const endTime = addMinutesToTime(time24, meal.prep_minutes || 30);
    if (meal.linked_event_id) {
      updateEvent(meal.linked_event_id, { title: meal.title, date, time: time24, endTime });
      return meal.linked_event_id;
    }
    return addEvent({
      title: meal.title, date, time: time24, endTime,
      type: 'reminder', category: 'Meal',
      createdBy: activeMemberId ?? undefined,
    });
  };

  // Create a cooking quest for the assigned chef
  const createCookingQuest = (mealTitle: string, chefId: string, day: string, prepMins?: number | null) => {
    const dueDate = dayNameToDate(day);

    addQuest({
      title:            `🍳 Cook ${mealTitle}`,
      description:      `Prepare ${mealTitle} for the family on ${day}.`,
      category:         'Cooking',
      priority:         'medium',
      coins:            15,
      xpReward:         20,
      assignedToId:     chefId,
      assignedToIds:    [chefId],
      isPool:           false,
      isDaily:          false,
      recurrence:       'once',
      status:           'todo',
      dueDate,
      estimatedMinutes: prepMins ?? undefined,
      createdById:      activeMember?.id ?? '',
      photoRequired:    false,
      isAdultTask:      members.find(m => m.id === chefId)?.role === 'parent' || members.find(m => m.id === chefId)?.role === 'senior',
    });
  };

  // Single save handler for both MealFormSheet modes — add mode needs
  // addDay set (which day this new meal belongs to), edit mode needs
  // editMeal set (the row being patched). Was two separate functions
  // (addManualMeal/updateMeal) each hand-maintaining their own insert/
  // update + cooking-quest logic; merged since MealFormSheet.tsx itself
  // is now the single component backing both flows.
  const saveMeal = async (patch: {
    title: string; type: string; emoji: string; chef_id: string | null;
    prep_minutes: number | null; dietary_tags: string[]; ingredients: string[];
    prep_steps: string[]; start_time: string | null; timezone: string | null;
  }) => {
    setSavingMeal(true);
    try {
      if (editMeal) {
        const prevChefId = editMeal.chef_id;
        const linkedEventId = await syncMealCalendarEvent({ ...editMeal, ...patch });
        const fullPatch = { ...patch, linked_event_id: linkedEventId };
        await supabase.from('family_meals').update(fullPatch).eq('id', editMeal.id);
        setMeals(prev => prev.map(m => m.id === editMeal.id ? { ...m, ...fullPatch } : m));
        showToast('Meal updated');
        if (patch.chef_id && patch.chef_id !== prevChefId) {
          createCookingQuest(patch.title, patch.chef_id, editMeal.day, patch.prep_minutes);
        }
        setEditMeal(null);
      } else if (addDay) {
        const newId = `${familyId}-${curWeek}-${addDay}-manual-${Date.now()}`;
        const linkedEventId = await syncMealCalendarEvent({ id: newId, day: addDay, title: patch.title, start_time: patch.start_time, prep_minutes: patch.prep_minutes, linked_event_id: null });
        const { data } = await supabase.from('family_meals').insert({
          id: newId,
          family_id: familyId, week_of: curWeek, day: addDay,
          ...patch, ai_generated: false, linked_event_id: linkedEventId,
        }).select().single();
        if (data) { setMeals(prev => [...prev, data as Meal]); showToast('Meal added'); }
        if (patch.chef_id) createCookingQuest(patch.title, patch.chef_id, addDay, patch.prep_minutes);
        setAddDay(null);
      }
    } finally {
      setSavingMeal(false);
    }
  };

  const deleteMeal = async (id: string) => {
    const meal = meals.find(m => m.id === id);
    if (meal?.linked_event_id) useEventStore.getState().deleteEvent(meal.linked_event_id);
    await supabase.from('family_meals').delete().eq('id', id);
    setMeals(prev => prev.filter(m => m.id !== id));
    showToast('Meal deleted');
  };

  const mealsByDay = useMemo(() => {
    const map: Record<string, Meal[]> = {};
    meals.forEach(m => {
      (map[m.day] = map[m.day] ?? []).push(m);
    });
    return map;
  }, [meals]);

  if (loading) return (
    <View>
      <FlatSectionHeader Icon={ChefHat} title="Meal Planner" accent={colors.danger} colors={colors} />
      <ActivityIndicator color={colors.danger} style={{ marginVertical: 24 }} />
    </View>
  );

  return (
    <>
      {/* ── CubeAI Planner Banner (flat) ─────────────────────────────── */}
      <AiPlannerBanner
        colors={colors} isDark={isDark}
        aiOpen={aiOpen} setAiOpen={setAiOpen}
        pulseOpacity={pulseOpacity} pulseScale={pulseScale}
        aiPref={aiPref} setAiPref={setAiPref}
        aiLoading={aiLoading} aiError={aiError}
        generateMealPlan={generateMealPlan}
      />

      {/* ── Meal Selection Phase (flat) ─────────────────────────── */}
      {pendingOptions && (
        <MealSelectionPhase
          colors={colors} isDark={isDark}
          pendingOptions={pendingOptions} setPendingOptions={setPendingOptions}
          selected={selected} setSelected={setSelected}
          tip={tip} savingPlan={savingPlan} confirmPlan={confirmPlan}
        />
      )}

      {/* ── Weekly Plan Grid (flat) ─────────────────────────────── */}
      {aiLoading && (
        <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accent }}>CubeAI is crafting your week plan…</Text>
        </View>
      )}

      <View>
        <FlatSectionHeader
          Icon={ChefHat} title="Week Plan" accent={colors.danger} colors={colors}
          badge={`Wk of ${curWeek}`}
          onAction={load} actionIcon={<RefreshCw size={14} color={colors.danger} />}
        />

        {/* Nutrition tip */}
        {tip && (
          <View style={{ borderRadius: 12, backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30', padding: 10, marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal, lineHeight: 18 }}>💡 {tip}</Text>
          </View>
        )}

        {/* Day cards */}
        <View>
          {DAYS.map(day => (
            <DayCard key={day} day={day} meals={mealsByDay[day] ?? []}
              colors={colors} isDark={isDark}
              onRecipe={m => setActiveRecipe(m)}
              onEdit={m => setEditMeal(m)}
              onDelete={isKid ? undefined : m => deleteMeal(m.id)}
              onAdd={() => setAddDay(day)}
            />
          ))}
        </View>

        {/* Grocery action row */}
        {groceryList.length > 0 && (
          <View style={{ marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, gap: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textSecondary, letterSpacing: 0.5 }}>
              SMART GROCERY LIST — {groceryList.length} ITEMS
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={addAllToCart} disabled={addedCart}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 10, borderWidth: 1,
                  borderColor: addedCart ? colors.success + '50' : colors.teal + '50',
                  backgroundColor: addedCart ? colors.success + '12' : colors.teal + '12' }}>
                {addedCart
                  ? <><Check size={13} color={colors.success} /><Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>Added to Grocery!</Text></>
                  : <><ShoppingBag size={13} color={colors.teal} /><Text style={{ fontSize: 13, fontWeight: '800', color: colors.teal }}>Add All to Grocery</Text></>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const lines = groceryList.slice(0, 12).map(g => `• ${g}`).join('\n');
                  const msg = `🛒 *Grocery List for the week*\n\n${lines}${groceryList.length > 12 ? `\n…and ${groceryList.length - 12} more` : ''}`;
                  useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1,
                  borderColor: colors.accent + '50', backgroundColor: colors.accent + '12' }}>
                <MessageSquare size={13} color={colors.accent} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.accent }}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Meal Form Sheet — shared Add/Edit stepper ────── */}
      <MealFormSheet
        visible={!!addDay || !!editMeal}
        day={addDay}
        editingMeal={editMeal}
        members={members} colors={colors} isDark={isDark}
        onClose={() => { setAddDay(null); setEditMeal(null); }}
        onSave={saveMeal}
        saving={savingMeal}
      />

      {/* Modals */}
      <RecipeModal meal={activeRecipe} visible={!!activeRecipe}
        onClose={() => setActiveRecipe(null)}
        onAddToGrocery={addGroceryItems}
        senderId={activeMember?.id ?? ''}
        colors={colors} isDark={isDark} />
    </>
  );
}
