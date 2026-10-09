import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Sparkles, BookOpen, ChefHat } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useFamilyStore } from '@/store/familyStore';
import FullPageOverlay from '@/components/FullPageOverlay';
import MealsWeekPage from './MealsWeekPage';
import FamilyRecipeBookPage from './FamilyRecipeBookPage';
import AiSuggestionsPage from './meals/AiSuggestionsPage';
import AiPlannerBanner from './meals/AiPlannerBanner';
import { supabase } from '@/lib/supabase';
import { type Meal, type AiDayOptions, type AiMealResult, weekOf, detectDays } from './meals/types';

function todayDayAbbr(): string {
  const ABBRS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return ABBRS[new Date().getDay()];
}

function currentWeekOf(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
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
  const [pendingOptions, setPendingOptions] = useState<AiDayOptions[] | null>(null);
  const [selected, setSelected]             = useState<Record<string, number[]>>({});
  const [tip, setTip]                       = useState<string | null>(null);
  const [groceryList, setGroceryList]       = useState<string[]>([]);
  const [savingPlan, setSavingPlan]         = useState(false);

  // Fetch tonight's dinner to show in the hero card
  const [tonightMeal, setTonightMeal] = useState<Meal | null>(null);
  useEffect(() => {
    if (!familyId) return;
    const today = todayDayAbbr();
    const week  = currentWeekOf();
    supabase
      .from('family_meals')
      .select('*')
      .eq('family_id', familyId)
      .eq('week_of', week)
      .eq('day', today)
      .in('type', ['dinner', 'Dinner'])
      .limit(1)
      .then(({ data }) => { if (data?.[0]) setTonightMeal(data[0] as Meal); });
  }, [familyId]);

  // Chef name for tonight's meal
  const chefName = tonightMeal?.chef_id
    ? members.find(m => m.id === tonightMeal.chef_id)?.name?.split(' ')[0] ?? null
    : null;

  useEffect(() => {
    useUIStore.getState().setFullBleedScreenActive(true);
    return () => useUIStore.getState().setFullBleedScreenActive(false);
  }, []);

  useEffect(() => {
    if (showWeekPlan || showRecipes || showInspirationPage) hideTabBar(); else showTabBar();
    return () => showTabBar();
  }, [showWeekPlan, showRecipes, showInspirationPage]);

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
    } catch {
      Alert.alert('CubeAI', 'Couldn\'t generate plan. Check connection and try again.');
      setShowInspirationPage(false);
    }
    setAiLoading(false);
  };

  const confirmPlan = async () => {
    if (!pendingOptions) return;
    setSavingPlan(true);
    const curWeek = weekOf();
    const famId = familyId ?? 'family-1';
    const MEAL_TYPE_LABELS = ['lunch', 'dinner'];
    const upserts = pendingOptions.flatMap((dayOpt: AiDayOptions) => {
      const indices = selected[dayOpt.day] ?? [0];
      return indices.map((idx: number, slot: number) => {
        const m = dayOpt.options[idx];
        return {
          id: `${famId}-${curWeek}-${dayOpt.day}-${slot}-${Date.now()}`,
          family_id: famId, week_of: curWeek, day: dayOpt.day,
          title: m.mealName, type: indices.length > 1 ? (MEAL_TYPE_LABELS[slot] ?? 'dinner') : 'dinner',
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
      Alert.alert('Plan Saved', `${inserted?.length ?? 0} meal${(inserted?.length ?? 0) !== 1 ? 's' : ''} added to your week.`);
      setPendingOptions(null);
      setSelected({});
      setShowInspirationPage(false);
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Something went wrong.');
    } finally {
      setSavingPlan(false);
    }
  };

  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardBg = isDark ? colors.card : '#FFFFFF';

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
    <View style={{ flex: 1, backgroundColor: canvas }}>

      {/* ── ReviewInbox-style header ── */}
      <View style={{
        paddingHorizontal: 20,
        paddingTop: insets.top + 12,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
        backgroundColor: canvas,
        gap: 8,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
            {familyName.toUpperCase()}
          </Text>
          {activeMember && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
              {(activeMember as any).name}
            </Text>
          )}
        </View>

        <View style={{ gap: 4, marginTop: 2 }}>
          <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
            Meals
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
            Plan the week, explore recipes, and keep the list stocked.
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 80 }}
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
                TONIGHT'S DINNER
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, lineHeight: 25 }}
                numberOfLines={2}>
                {tonightMeal?.title ?? 'No dinner planned yet'}
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

      {/* ── A little inspiration — standalone AI suggestions page ── */}
      <FullPageOverlay
        visible={showInspirationPage}
        onDismiss={() => { setShowInspirationPage(false); setPendingOptions(null); setSelected({}); setAiOpen(true); }}
        zIndex={60}
      >
        {pendingOptions ? (
          <AiSuggestionsPage
            visible
            pendingOptions={pendingOptions}
            selected={selected}
            setSelected={setSelected}
            tip={tip}
            savingPlan={savingPlan}
            confirmPlan={confirmPlan}
            existingMeals={[]}
            weekRange={weekOf()}
            onClose={() => { setShowInspirationPage(false); setPendingOptions(null); setSelected({}); setAiOpen(true); }}
            onViewMeal={() => {}}
            colors={colors}
            isDark={isDark}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: isDark ? '#0E0C13' : '#FFFFFF' }}>
            <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16 }}>
              <Pressable onPress={() => { setShowInspirationPage(false); setAiOpen(true); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.primary }}>← Meals</Text>
              </Pressable>
              <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5,
                color: colors.textPrimary, marginTop: 8 }}>
                A little inspiration
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
              <AiPlannerBanner
                colors={colors} isDark={isDark}
                aiOpen={aiOpen} setAiOpen={setAiOpen}
                pulseOpacity={pulseOpacity} pulseScale={pulseScale}
                aiPref={aiPref} setAiPref={setAiPref}
                aiLoading={aiLoading} aiError={null}
                generateMealPlan={generateMealPlan}
              />
              {aiLoading && (
                <View style={{ alignItems: 'center', gap: 12, marginTop: 40 }}>
                  <ActivityIndicator size="large" color={colors.pink} />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>
                    CubeAI is crafting your week…
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </FullPageOverlay>

    </View>
  );
}
