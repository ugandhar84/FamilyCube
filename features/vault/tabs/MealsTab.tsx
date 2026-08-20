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
import { BRAND } from './shared';

import {
  Meal, AiDayOptions, AiMealResult,
  MEAL_CACHE_KEY, CACHE_TTL_MS, DAYS, detectDays, categorizeItem, weekOf,
} from './meals/types';
import FlatSectionHeader from './meals/FlatSectionHeader';
import RecipeModal from './meals/RecipeModal';
import EditMealModal from './meals/EditMealModal';
import DayCard from './meals/DayCard';
import AiPlannerBanner from './meals/AiPlannerBanner';
import MealSelectionPhase from './meals/MealSelectionPhase';
import AddMealSheet from './meals/AddMealSheet';

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
  const [addTitle, setAddTitle]         = useState('');
  const [addType, setAddType]           = useState('dinner');
  const [addEmoji, setAddEmoji]         = useState('🍽️');
  const [addChefId, setAddChefId]       = useState('');
  const [addPrepMins, setAddPrepMins]   = useState('');
  const [addKidRating, setAddKidRating] = useState(3);
  const [addDietTags, setAddDietTags]   = useState<string[]>([]);
  const [addIngredients, setAddIngredients] = useState('');
  const [addPrepSteps, setAddPrepSteps]     = useState('');
  const [addShowEmoji, setAddShowEmoji]     = useState(false);

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

  const resetAddForm = () => {
    setAddDay(null); setAddTitle(''); setAddType('dinner'); setAddEmoji('🍽️');
    setAddChefId(''); setAddPrepMins(''); setAddKidRating(3);
    setAddDietTags([]); setAddIngredients(''); setAddPrepSteps(''); setAddShowEmoji(false);
  };

  // Create a cooking quest for the assigned chef
  const createCookingQuest = (mealTitle: string, chefId: string, day: string, prepMins?: number | null) => {
    const DAYS_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const todayIdx = new Date().getDay(); // 0=Sun
    const dayIdx = DAYS_ORDER.indexOf(day);
    // Calculate due date as the day in this week
    const daysUntil = ((dayIdx - (todayIdx === 0 ? 6 : todayIdx - 1) + 7) % 7);
    const due = new Date();
    due.setDate(due.getDate() + daysUntil);
    const dueDate = due.toISOString().split('T')[0];

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

  const addManualMeal = async () => {
    if (!addDay || !addTitle.trim()) return;
    const chefId = addChefId || null;
    const prepMins = addPrepMins ? parseInt(addPrepMins) : null;
    const { data } = await supabase.from('family_meals').insert({
      id: `${familyId}-${curWeek}-${addDay}-manual-${Date.now()}`,
      family_id: familyId, week_of: curWeek,
      day: addDay, title: addTitle.trim(), type: addType,
      emoji: addEmoji,
      chef_id: chefId,
      prep_minutes: prepMins,
      dietary_tags: addDietTags,
      ingredients: addIngredients.split('\n').map(s => s.trim()).filter(Boolean),
      prep_steps: addPrepSteps.split('\n').map(s => s.trim()).filter(Boolean),
      ai_generated: false,
    }).select().single();
    if (data) setMeals(prev => [...prev, data as Meal]);
    if (chefId) createCookingQuest(addTitle.trim(), chefId, addDay, prepMins);
    resetAddForm();
  };

  const updateMeal = async (id: string, patch: Partial<Meal>) => {
    const prev = meals.find(m => m.id === id);
    await supabase.from('family_meals').update(patch).eq('id', id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    // Create quest if chef was newly assigned (or changed)
    if (patch.chef_id && patch.chef_id !== prev?.chef_id && prev) {
      const meal = { ...prev, ...patch };
      createCookingQuest(meal.title, patch.chef_id, meal.day, meal.prep_minutes);
    }
  };

  const deleteMeal = async (id: string) => {
    await supabase.from('family_meals').delete().eq('id', id);
    setMeals(prev => prev.filter(m => m.id !== id));
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
      <FlatSectionHeader Icon={ChefHat} title="Meal Planner" accent={BRAND.amber} colors={colors} />
      <ActivityIndicator color={BRAND.amber} style={{ marginVertical: 24 }} />
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
          <ActivityIndicator color={BRAND.purple} size="small" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND.purple }}>CubeAI is crafting your week plan…</Text>
        </View>
      )}

      <View>
        <FlatSectionHeader
          Icon={ChefHat} title="Week Plan" accent={BRAND.amber} colors={colors}
          badge={`Wk of ${curWeek}`}
          onAction={load} actionIcon={<RefreshCw size={14} color={BRAND.amber} />}
        />

        {/* Nutrition tip */}
        {tip && (
          <View style={{ borderRadius: 12, backgroundColor: BRAND.teal + '15', borderWidth: 1, borderColor: BRAND.teal + '30', padding: 10, marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? BRAND.teal : '#0F766E', lineHeight: 18 }}>💡 {tip}</Text>
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
              onAdd={() => { setAddDay(day); setAddTitle(''); setAddType('Dinner'); }}
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
                  borderColor: addedCart ? BRAND.emerald + '50' : BRAND.teal + '50',
                  backgroundColor: addedCart ? BRAND.emerald + '12' : BRAND.teal + '12' }}>
                {addedCart
                  ? <><Check size={13} color={BRAND.emerald} /><Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.emerald }}>Added to Grocery!</Text></>
                  : <><ShoppingBag size={13} color={BRAND.teal} /><Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.teal }}>Add All to Grocery</Text></>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const lines = groceryList.slice(0, 12).map(g => `• ${g}`).join('\n');
                  const msg = `🛒 *Grocery List for the week*\n\n${lines}${groceryList.length > 12 ? `\n…and ${groceryList.length - 12} more` : ''}`;
                  useChatStore.getState().sendMessage('all', activeMember?.id ?? '', msg);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1,
                  borderColor: BRAND.purple + '50', backgroundColor: BRAND.purple + '12' }}>
                <MessageSquare size={13} color={BRAND.purple} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: BRAND.purple }}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Add Meal Sheet ─────────────────────────────── */}
      <AddMealSheet
        colors={colors} isDark={isDark}
        addDay={addDay}
        addTitle={addTitle} setAddTitle={setAddTitle}
        addType={addType} setAddType={setAddType}
        addEmoji={addEmoji} setAddEmoji={setAddEmoji}
        addChefId={addChefId} setAddChefId={setAddChefId}
        addPrepMins={addPrepMins} setAddPrepMins={setAddPrepMins}
        addDietTags={addDietTags} setAddDietTags={setAddDietTags}
        addIngredients={addIngredients} setAddIngredients={setAddIngredients}
        addPrepSteps={addPrepSteps} setAddPrepSteps={setAddPrepSteps}
        addShowEmoji={addShowEmoji} setAddShowEmoji={setAddShowEmoji}
        members={members}
        resetAddForm={resetAddForm}
        addManualMeal={addManualMeal}
      />

      {/* Modals */}
      <RecipeModal meal={activeRecipe} visible={!!activeRecipe}
        onClose={() => setActiveRecipe(null)}
        onAddToGrocery={addGroceryItems}
        senderId={activeMember?.id ?? ''}
        colors={colors} isDark={isDark} />

      <EditMealModal meal={editMeal} visible={!!editMeal}
        onClose={() => setEditMeal(null)}
        onSave={updateMeal}
        members={members} colors={colors} isDark={isDark} />
    </>
  );
}
