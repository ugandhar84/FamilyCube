import { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert, ActivityIndicator, Animated,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Sparkles, BookOpen, ChefHat } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useFamilyStore } from '@/store/familyStore';
import FullPageOverlay from '@/components/FullPageOverlay';
import { PanResponder } from 'react-native';
import MealsWeekPage from './MealsWeekPage';
import FamilyRecipeBookPage from './FamilyRecipeBookPage';
import AiSuggestionsPage from './meals/AiSuggestionsPage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { type Meal, type AiDayOptions, type AiMealResult, weekOf, detectDays } from './meals/types';
import { localDateStr } from '@/lib/dates';

function todayDayAbbr(): string {
  const ABBRS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return ABBRS[new Date().getDay()];
}

function currentWeekOf(): string {
  // Must use localDateStr (not toISOString) to match weekOf() in types.ts —
  // toISOString() is UTC and can return the wrong date for IST/east-of-UTC zones.
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}

export default function MealsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const familyId = (members[0] as any)?.familyId as string | undefined;
  const P = colors.primary;

  const [showWeekPlan, setShowWeekPlan]     = useState(false);
  const [showRecipes, setShowRecipes]       = useState(false);
  const [showInspirationPage, setShowInspirationPage] = useState(false);

  // AI planner state — lives here so AiSuggestionsPage is its own standalone page
  const [aiPref, setAiPref]  = useState('Kid-friendly, high-protein, 30 min max');
  const [aiOpen, setAiOpen]  = useState(true);
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
  const [aiLoading, setAiLoading]           = useState(false);
  const [cacheLoading, setCacheLoading]     = useState(false);
  const [pendingOptions, setPendingOptions] = useState<AiDayOptions[] | null>(null);
  const [selected, setSelected]             = useState<Record<string, number[]>>({});
  const [tip, setTip]                       = useState<string | null>(null);
  const [groceryList, setGroceryList]       = useState<string[]>([]);
  const [savingPlan, setSavingPlan]         = useState(false);

  // Fetch today's next upcoming meal based on current time of day
  const [tonightMeal, setTonightMeal] = useState<Meal | null>(null);
  const [tonightLabel, setTonightLabel] = useState('TODAY\'S MEAL');
  useEffect(() => {
    if (!familyId) return;
    const today = todayDayAbbr();
    const week  = currentWeekOf();
    const hour  = new Date().getHours();
    // Pick which meal slot to show based on time of day
    // Before 10am → breakfast; 10am–3pm → lunch; after 3pm → dinner
    let preferredTypes: string[];
    let label: string;
    if (hour < 10) {
      preferredTypes = ['breakfast', 'Breakfast'];
      label = 'THIS MORNING';
    } else if (hour < 15) {
      preferredTypes = ['lunch', 'Lunch'];
      label = 'TODAY\'S LUNCH';
    } else {
      preferredTypes = ['dinner', 'Dinner'];
      label = 'TONIGHT\'S DINNER';
    }
    setTonightLabel(label);
    // Fetch all of today's meals — no week_of filter to avoid UTC/local mismatch;
    // day+family uniquely scopes to this week in practice.
    supabase
      .from('family_meals')
      .select('*')
      .eq('family_id', familyId)
      .eq('day', today)
      .gte('week_of', week) // must be this week or later (catches next-week spill)
      .order('week_of', { ascending: true })
      .limit(10)
      .then(({ data }) => {
        if (!data?.length) return;
        // Sort: preferred type first, then rest
        const sorted = [...data].sort((a, b) => {
          const ai = preferredTypes.indexOf(a.type);
          const bi = preferredTypes.indexOf(b.type);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        setTonightMeal(sorted[0] as Meal);
      });
  }, [familyId]);

  // Chef name for tonight's meal
  const chefName = tonightMeal?.chef_id
    ? members.find(m => m.id === tonightMeal.chef_id)?.name?.split(' ')[0] ?? null
    : null;

  useFocusEffect(useCallback(() => {
    hideTabBar();
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => {
      showTabBar();
      useUIStore.getState().setFullBleedScreenActive(false);
    };
  }, []));

  useEffect(() => {
    if (showWeekPlan || showRecipes || showInspirationPage) hideTabBar();
    // Don't showTabBar here — the screen itself keeps it hidden
  }, [showWeekPlan, showRecipes, showInspirationPage]);

  // Load cached suggestions — DB first (shared across family), AsyncStorage fallback
  useEffect(() => {
    if (!showInspirationPage || pendingOptions) return;
    const famId = familyId ?? 'family-1';
    const curWeek = weekOf();
    const localKey = `cubeai_meal_suggestions_${famId}_${curWeek}`;
    setCacheLoading(true);

    supabase
      .from('family_ai_meal_cache')
      .select('suggestions, tip, grocery_list, preferences')
      .eq('family_id', famId)
      .eq('week_of', curWeek)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.suggestions?.length) {
          const opts = data.suggestions as AiDayOptions[];
          const defaults: Record<string, number[]> = {};
          opts.forEach((d: AiDayOptions) => { defaults[d.day] = [0]; });
          setPendingOptions(opts);
          setSelected(defaults);
          setGroceryList((data.grocery_list as string[]) ?? []);
          setTip(data.tip ?? null);
          if (data.preferences) setAiPref(data.preferences);
          setCacheLoading(false);
          return;
        }
        // Fallback to local AsyncStorage cache
        AsyncStorage.getItem(localKey)
          .then(raw => {
            if (raw) {
              try {
                const cached = JSON.parse(raw);
                if (cached?.suggestions?.length) {
                  const opts = cached.suggestions as AiDayOptions[];
                  const defaults: Record<string, number[]> = {};
                  opts.forEach((d: AiDayOptions) => { defaults[d.day] = [0]; });
                  setPendingOptions(opts);
                  setSelected(defaults);
                  setGroceryList(cached.groceryList ?? []);
                  setTip(cached.tip ?? null);
                  if (cached.preferences) setAiPref(cached.preferences);
                }
              } catch { /* corrupt cache */ }
            }
            setCacheLoading(false);
          })
          .catch(() => setCacheLoading(false));
      });
  }, [showInspirationPage]);

  const generateMealPlan = async () => {
    setAiLoading(true);
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
      result.weeklyOptions.forEach((d: AiDayOptions) => { defaults[d.day] = [0]; });
      setPendingOptions(result.weeklyOptions);
      setSelected(defaults);
      setGroceryList(result.groceryAutoList ?? []);
      setTip(result.nutritionCoachingTip ?? null);
      // Cache suggestions in DB (family-shared) + AsyncStorage (offline fallback)
      const famId = familyId ?? 'family-1';
      const curWeekStr = weekOf();
      const localKey = `cubeai_meal_suggestions_${famId}_${curWeekStr}`;
      const payload = {
        suggestions: result.weeklyOptions,
        tip: result.nutritionCoachingTip ?? null,
        groceryList: result.groceryAutoList ?? [],
        preferences: aiPref.trim(),
      };
      AsyncStorage.setItem(localKey, JSON.stringify(payload)).catch(() => {});
      supabase.from('family_ai_meal_cache').upsert({
        family_id: famId,
        week_of: curWeekStr,
        suggestions: result.weeklyOptions,
        tip: result.nutritionCoachingTip ?? null,
        grocery_list: result.groceryAutoList ?? [],
        preferences: aiPref.trim(),
        generated_at: new Date().toISOString(),
      }, { onConflict: 'family_id,week_of' }).then(() => {});
    } catch {
      Alert.alert('CubeAI', 'Couldn\'t generate plan. Check connection and try again.');
      setShowInspirationPage(false);
    }
    setAiLoading(false);
  };

  const confirmPlan = async (dayOverrides?: Record<string, string>, mealTypeOverrides?: Record<string, string>) => {
    if (!pendingOptions) return;
    setSavingPlan(true);
    const curWeek = weekOf();
    const famId = familyId ?? 'family-1';

    // Resolve "next-Mon" → { day: "Mon", weekOf: next-week local date }
    const resolveAssignedDay = (key: string): { day: string; weekOfStr: string } => {
      if (key.startsWith('next-')) {
        const day = key.slice(5);
        const d = new Date();
        const todayIdx = d.getDay(); // 0=Sun
        const daysUntilMonday = todayIdx === 0 ? 1 : 8 - todayIdx;
        d.setDate(d.getDate() + daysUntilMonday);
        // weekOf uses Monday of the week — compute Monday of next week using localDateStr
        const mon = new Date(d);
        mon.setDate(mon.getDate() - (mon.getDay() === 0 ? 6 : mon.getDay() - 1));
        return { day, weekOfStr: localDateStr(mon) };
      }
      return { day: key, weekOfStr: curWeek };
    };

    const upserts = pendingOptions.flatMap((dayOpt: AiDayOptions) => {
      const indices = selected[dayOpt.day] ?? [0];
      return indices.map((idx: number, slot: number) => {
        const m = dayOpt.options[idx];
        const rowKey = `${dayOpt.day}-${idx}`;
        const rawDay = dayOverrides?.[rowKey] ?? dayOpt.day;
        const { day: assignedDay, weekOfStr: assignedWeek } = resolveAssignedDay(rawDay);
        const assignedType = mealTypeOverrides?.[rowKey] ?? 'dinner';
        return {
          id: `${famId}-${assignedWeek}-${assignedDay}-${slot}-${Date.now()}`,
          family_id: famId, week_of: assignedWeek, day: assignedDay,
          title: m.mealName, type: assignedType,
          chef_id: null, ingredients: m.ingredientsList, emoji: m.emoji ?? null,
          prep_minutes: m.prepMinutes, dietary_tags: m.dietaryTags,
          kid_friendly_rating: m.kidFriendlyRating, prep_steps: m.prepSteps ?? [],
          ai_generated: true,
        };
      });
    });
    try {
      await supabase.from('family_meals').delete().eq('family_id', famId).eq('week_of', curWeek).eq('ai_generated', true);
      const { data: inserted, error: insertErr } = await supabase.from('family_meals').insert(upserts).select();
      if (insertErr) throw new Error(insertErr.message);
      // Clear both caches — plan accepted, next open should start fresh
      const localKey = `cubeai_meal_suggestions_${famId}_${curWeek}`;
      AsyncStorage.removeItem(localKey).catch(() => {});
      supabase.from('family_ai_meal_cache').delete().eq('family_id', famId).eq('week_of', curWeek).then(() => {});
      Alert.alert('Plan Saved', `${inserted?.length ?? 0} meal${(inserted?.length ?? 0) !== 1 ? 's' : ''} added to your week.`);
      setPendingOptions(null);
      setSelected({});
      setCacheLoading(false);
      setShowInspirationPage(false);
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Something went wrong.');
    } finally {
      setSavingPlan(false);
    }
  };

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardBg = isDark ? colors.card : '#FFFFFF';

  // Track whether any sub-page overlay is open — used to block the root swipe
  const subPageOpen = useRef(false);
  useEffect(() => {
    subPageOpen.current = showWeekPlan || showRecipes || showInspirationPage;
  }, [showWeekPlan, showRecipes, showInspirationPage]);

  // Edge swipe-back: start within 30px of left edge, drag 100px → go back
  // Disabled when a sub-page overlay is open (its own SwipeBackWrapper handles the gesture)
  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      !subPageOpen.current && g.dx > 10 && Math.abs(g.dy) < 40 && g.moveX - g.dx < 30,
    onPanResponderRelease: (_, g) => {
      if (!subPageOpen.current && (g.dx > 100 || g.vx > 0.8)) router.back();
    },
  })).current;

  const categories = [
    {
      key: 'week',
      title: "This week's meals",
      subtitle: "Plan, edit and view the family's weekly dinner schedule",
      icon: CalendarDays,
      color: colors.primary,
      bg: colors.primaryLight,
      onPress: () => setShowWeekPlan(true),
    },
    {
      key: 'ai',
      title: 'A little inspiration',
      subtitle: 'CubeAI suggests meals for the week — pick your favourites and add them in one tap',
      icon: Sparkles,
      color: colors.pink,
      bg: colors.pinkLight,
      onPress: () => { setAiOpen(true); setShowInspirationPage(true); },
    },
    {
      key: 'recipes',
      title: 'Family recipe book',
      subtitle: 'Saved family recipes — add any to this week in one tap',
      icon: BookOpen,
      color: colors.teal,
      bg: colors.tealLight,
      onPress: () => setShowRecipes(true),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: canvas }} {...swipePan.panHandlers}>

      {/* ── ReviewInbox-style header ── */}
      <View style={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas,
        gap: 6,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
            FAMILY CUBE / {familyName.toUpperCase()}
          </Text>
          {activeMember && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
              {(activeMember as any).name} · {(activeMember as any).role === 'parent' ? 'Parent / Admin' : 'Member'}
            </Text>
          )}
        </View>

        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Hub</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
          Meals
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
          Plan the week, explore recipes, and keep the list stocked.
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 32 }}
      >

        {/* ── Tonight's dinner hero card ── */}
        <Pressable
          onPress={() => setShowWeekPlan(true)}
          style={({ pressed }) => ({
            borderRadius: 22, overflow: 'hidden',
            backgroundColor: isDark ? colors.card : '#FFFFFF',
            opacity: pressed ? 0.88 : 1,
            ...Platform.select({
              ios: {
                shadowColor: colors.navy,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.22 : 0.10,
                shadowRadius: 14,
              },
              android: { elevation: 4 },
            }),
          })}
        >
          {/* Pastel top band */}
          <View style={{
            backgroundColor: colors.primaryLight,
            paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16,
            flexDirection: 'row', alignItems: 'center', gap: 14,
          }}>
            {/* Emoji bubble */}
            <View style={{
              width: 72, height: 72, borderRadius: 20,
              backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.75)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {tonightMeal?.emoji ? (
                <Text style={{ fontSize: 38 }}>{tonightMeal.emoji}</Text>
              ) : (
                <ChefHat size={32} color={colors.primary} strokeWidth={1.6} />
              )}
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.primary }}>
                {tonightLabel}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, lineHeight: 25 }}
                numberOfLines={2}>
                {tonightMeal?.title ?? 'No meal planned yet'}
              </Text>
            </View>
          </View>

          {/* Bottom info strip */}
          <View style={{
            paddingHorizontal: 18, paddingVertical: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <View style={{ gap: 2 }}>
              {tonightMeal?.start_time ? (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                  {tonightMeal.start_time}
                  {chefName ? ` · ${chefName} cooks` : ''}
                </Text>
              ) : chefName ? (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                  {chefName} cooks tonight
                </Text>
              ) : (
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  Tap to plan the week
                </Text>
              )}
              {tonightMeal?.prep_minutes != null && (
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {tonightMeal.prep_minutes} min prep
                  {tonightMeal.dietary_tags?.length ? ' · ' + tonightMeal.dietary_tags.slice(0, 2).join(', ') : ''}
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 22, color: colors.primary }}>›</Text>
          </View>
        </Pressable>

        {/* ── Category cards (ReviewInbox style) ── */}
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <Pressable
              key={cat.key}
              onPress={cat.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 16,
                backgroundColor: cardBg,
                borderRadius: 18, padding: 18,
                opacity: pressed ? 0.85 : 1,
                ...Platform.select({
                  ios: {
                    shadowColor: colors.navy,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isDark ? 0.16 : 0.07,
                    shadowRadius: 10,
                  },
                  android: { elevation: 2 },
                }),
              })}
            >
              <View style={{
                width: 52, height: 52, borderRadius: 14,
                backgroundColor: cat.bg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={24} color={cat.color} strokeWidth={1.8} />
              </View>

              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {cat.title}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
                  {cat.subtitle}
                </Text>
              </View>

              <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
            </Pressable>
          );
        })}

      </ScrollView>

      {/* ── Week plan full-page overlay ── */}
      <FullPageOverlay
        visible={showWeekPlan}
        onDismiss={() => setShowWeekPlan(false)}
        zIndex={50}
      >
        <MealsWeekPage
          onClose={() => setShowWeekPlan(false)}
        />
      </FullPageOverlay>

      {/* ── Family recipe book overlay ── */}
      <FullPageOverlay
        visible={showRecipes}
        onDismiss={() => setShowRecipes(false)}
        zIndex={50}
      >
        <FamilyRecipeBookPage onClose={() => setShowRecipes(false)} />
      </FullPageOverlay>

      {/* ── A little inspiration — single page handles both generate + results ── */}
      <FullPageOverlay
        visible={showInspirationPage}
        onDismiss={() => { setShowInspirationPage(false); setPendingOptions(null); setSelected({}); setCacheLoading(false); }}
        zIndex={60}
      >
        <AiSuggestionsPage
          visible={showInspirationPage}
          pendingOptions={pendingOptions ?? []}
          selected={selected}
          setSelected={setSelected}
          tip={tip}
          savingPlan={savingPlan}
          cacheLoading={cacheLoading}
          aiLoading={aiLoading}
          aiOpen={aiOpen}
          setAiOpen={setAiOpen}
          aiPref={aiPref}
          setAiPref={setAiPref}
          pulseOpacity={pulseOpacity}
          pulseScale={pulseScale}
          generateMealPlan={generateMealPlan}
          confirmPlan={confirmPlan}
          existingMeals={[]}
          weekRange={weekOf()}
          onClose={() => { setShowInspirationPage(false); setPendingOptions(null); setSelected({}); setCacheLoading(false); }}
          colors={colors}
          isDark={isDark}
        />
      </FullPageOverlay>

    </View>
  );
}
