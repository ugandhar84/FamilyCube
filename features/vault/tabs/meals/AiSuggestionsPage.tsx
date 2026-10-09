import { useRef, useEffect, useState, useCallback } from 'react';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { useUIStore } from '@/store/uiStore';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Animated, Easing, Pressable, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, BookMarked } from 'lucide-react-native';
import { AiDayOptions, Meal, categorizeItem } from './types';
import { useFamilyStore } from '@/store/familyStore';
import { useGroceryStore } from '@/store/groceryStore';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';
import RecipeModal from './RecipeModal';
import AiPlannerBanner from './AiPlannerBanner';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/AppToast';
import { useUnsplashMealImage } from '@/lib/hooks/useUnsplashMealImage';

// ─── Per-row sub-component so useUnsplashMealImage can be called per meal ────
type SuggestionOpt = {
  mealName: string; emoji?: string; prepMinutes: number; dietaryTags: string[];
  kidFriendlyRating: number; ingredientsList: string[]; prepSteps?: string[];
  day: string; optionIdx: number;
};

// Color palette per meal type — row bg tint + accent
function mealTypeColors(type: string, colors: any): { bg: string; accent: string; light: string } {
  switch (type) {
    case 'breakfast': return { bg: colors.amberLight,  accent: colors.amber,  light: colors.amberLight };
    case 'lunch':     return { bg: colors.tealLight,   accent: colors.teal,   light: colors.tealLight };
    case 'snack':     return { bg: colors.primaryLight, accent: colors.primary, light: colors.primaryLight };
    case 'dinner':
    default:          return { bg: colors.pinkLight,   accent: colors.pink,   light: colors.pinkLight };
  }
}

function SuggestionRow({
  opt, listIdx, isSelected, mealType, assignedDay, takenTypes, alreadySaved,
  P, colors, isDark,
  onToggle, onOpenRecipe, onSetDay, onSetMealType, onSaveToBook,
}: {
  opt: SuggestionOpt; listIdx: number;
  isSelected: boolean; mealType: string; assignedDay: string;
  takenTypes: Set<string>; alreadySaved: boolean;
  P: string; colors: any; isDark: boolean;
  onToggle: () => void;
  onOpenRecipe: () => void;
  onSetDay: (d: string) => void;
  onSetMealType: (t: MealType) => void;
  onSaveToBook: () => void;
}) {
  const imageUrl = useUnsplashMealImage(opt.mealName);
  const tc = mealTypeColors(mealType, colors);

  return (
    <View>
      {listIdx > 0 && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      )}

      {/* Photo banner — shown when Unsplash returns an image */}
      {imageUrl && (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: 140, resizeMode: 'cover' }}
        />
      )}

      {/* Row body — tinted by meal type when selected */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: isSelected ? tc.bg : 'transparent',
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {/* Checkbox — uses meal-type accent color */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              width: 24, height: 24, borderRadius: 12, borderWidth: 2, marginTop: 1,
              borderColor: isSelected ? tc.accent : colors.textTertiary,
              backgroundColor: isSelected ? tc.accent : 'transparent',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            {isSelected && <Check size={13} color="#fff" strokeWidth={3} />}
          </TouchableOpacity>

          {/* Meal info */}
          <Pressable style={{ flex: 1 }} onPress={onOpenRecipe}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
              {opt.emoji ? opt.emoji + ' ' : ''}{opt.mealName}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
              {[
                opt.prepMinutes ? `${opt.prepMinutes} min` : null,
                opt.dietaryTags?.slice(0, 2).join(' · ') || null,
                opt.kidFriendlyRating >= 4 ? 'Kid-friendly ⭐' : null,
              ].filter(Boolean).join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>
                See full recipe →
              </Text>
              <TouchableOpacity
                onPress={() => !alreadySaved && onSaveToBook()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                  backgroundColor: alreadySaved ? colors.tealLight : colors.amberLight,
                }}>
                <BookMarked size={11}
                  color={alreadySaved ? colors.teal : colors.amber}
                  strokeWidth={2.2} />
                <Text style={{ fontSize: 11, fontWeight: '700',
                  color: alreadySaved ? colors.teal : colors.amber }}>
                  {alreadySaved ? 'Saved' : 'Save recipe'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </View>

        {/* ── Day picker — this week (available) + next week (spill) ── */}
        <View style={{ marginTop: 10, marginLeft: 36 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, marginBottom: 6, letterSpacing: 0.3 }}>
            SCHEDULE FOR
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {DAYS_ORDER.map(d => {
              const thisWeek = dayInfo(d, 0);
              const nextWeek = dayInfo(d, 1);
              const thisKey = d;
              const nextKey = `next-${d}`;
              // Show this-week pill if not past, otherwise next-week pill
              if (!thisWeek.isPast) {
                const isActive = assignedDay === thisKey;
                return (
                  <Pressable key={thisKey} onPress={() => onSetDay(thisKey)}
                    style={({ pressed }) => ({
                      borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
                      backgroundColor: isActive ? colors.teal : colors.tealLight,
                      borderWidth: 1, borderColor: isActive ? colors.teal : colors.teal + '30',
                      opacity: pressed ? 0.75 : 1, alignItems: 'center',
                    })}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? '#fff' : colors.teal }}>{d}</Text>
                    <Text style={{ fontSize: 9, color: isActive ? 'rgba(255,255,255,0.8)' : colors.textTertiary }}>{thisWeek.date}</Text>
                  </Pressable>
                );
              }
              // Past day → show next week's date with a "next" indicator
              const isActive = assignedDay === nextKey;
              return (
                <Pressable key={nextKey} onPress={() => onSetDay(nextKey)}
                  style={({ pressed }) => ({
                    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
                    backgroundColor: isActive ? colors.teal : colors.surface,
                    borderWidth: 1, borderColor: isActive ? colors.teal : colors.border,
                    opacity: pressed ? 0.75 : 1, alignItems: 'center',
                  })}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? '#fff' : colors.textSecondary }}>{d}</Text>
                  <Text style={{ fontSize: 9, color: isActive ? 'rgba(255,255,255,0.8)' : colors.textTertiary }}>{nextWeek.date}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Meal type picker ── */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, marginLeft: 36 }}>
          {MEAL_TYPES.map(t => {
            const active = mealType === t;
            const taken = isSelected && takenTypes.has(t);
            const pill = mealTypeColors(t, colors);
            return (
              <Pressable key={t}
                onPress={() => !taken && onSetMealType(t)}
                style={({ pressed }) => ({
                  borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                  backgroundColor: active ? pill.accent : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? pill.accent : colors.border,
                  opacity: taken ? 0.35 : pressed ? 0.75 : 1,
                })}>
                <Text style={{ fontSize: 11, fontWeight: '700',
                  color: active ? '#fff' : colors.textSecondary }}>
                  {TYPE_LABEL[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const TYPE_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Returns the Date object for a given day abbreviation, with optional week offset
function dayDate(day: string, weekOffset = 0): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mDiff = (today.getDay() + 6) % 7; // days since Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - mDiff + weekOffset * 7);
  const DAY_IDX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const d = new Date(monday);
  d.setDate(monday.getDate() + (DAY_IDX[day] ?? 0));
  return d;
}

// Returns { date: "Oct 8", isPast: boolean } — date shown on the day pill
function dayInfo(day: string, weekOffset = 0): { date: string; isPast: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = dayDate(day, weekOffset);
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    isPast: d < today,
  };
}

// Default day assignment: if AI-suggested day is in the past, spill to next week's same day
function defaultDay(aiDay: string): string {
  if (!dayInfo(aiDay).isPast) return aiDay;
  // Spill to next week — same day name, next week's date
  return `next-${aiDay}`;
}

// Resolve "next-Mon" style keys → { day abbr, weekOffset }
function resolveDay(key: string): { day: string; weekOffset: number } {
  if (key.startsWith('next-')) return { day: key.slice(5), weekOffset: 1 };
  return { day: key, weekOffset: 0 };
}

export default function AiSuggestionsPage({
  visible, pendingOptions, selected, setSelected, tip,
  savingPlan, cacheLoading, aiLoading, aiOpen, setAiOpen,
  aiPref, setAiPref, pulseOpacity, pulseScale, generateMealPlan,
  confirmPlan, existingMeals, weekRange,
  onClose, colors, isDark,
}: {
  visible: boolean;
  pendingOptions: AiDayOptions[];
  selected: Record<string, number[]>;
  setSelected: React.Dispatch<React.SetStateAction<Record<string, number[]>>>;
  tip: string | null;
  savingPlan: boolean;
  cacheLoading: boolean;
  aiLoading: boolean;
  aiOpen: boolean;
  setAiOpen: React.Dispatch<React.SetStateAction<boolean>>;
  aiPref: string;
  setAiPref: (v: string) => void;
  pulseOpacity: Animated.Value;
  pulseScale: Animated.Value;
  generateMealPlan: () => void;
  confirmPlan: (dayOverrides: Record<string, string>, mealTypeOverrides: Record<string, string>) => void;
  existingMeals: Meal[];
  weekRange: string;
  onClose: () => void;
  colors: any; isDark: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const familyName = (members[0] as any)?.familyName ?? 'Family';
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];

  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(60); fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
      ]).start();
      hideTabBar();
      useUIStore.getState().setFullBleedScreenActive(true);
    }
  }, [visible]);

  // Per-row meal type override — defaults to 'dinner'
  const [mealTypes, setMealTypes] = useState<Record<string, MealType>>({});
  // Track which suggestions have been saved to the family recipe book
  const [savedToBook, setSavedToBook] = useState<Set<string>>(new Set());

  const saveToRecipeBook = async (opt: { mealName: string; emoji?: string; ingredientsList: string[]; prepSteps?: string[]; dietaryTags: string[]; prepMinutes: number; day: string; optionIdx: number }) => {
    const rowKey = `${opt.day}-${opt.optionIdx}`;
    const famId = (members[0] as any)?.familyId ?? 'family-1';
    const creatorId = (activeMember as any)?.id ?? '';
    const { error } = await supabase.from('family_recipes').insert({
      id: `recipe-ai-${famId}-${Date.now()}-${opt.optionIdx}`,
      family_id: famId,
      title: opt.mealName,
      emoji: opt.emoji ?? null,
      ingredients: opt.ingredientsList ?? [],
      prep_steps: opt.prepSteps ?? [],
      dietary_tags: opt.dietaryTags ?? [],
      prep_minutes: opt.prepMinutes ?? null,
      ai_refined: true,
      created_by: creatorId,
    });
    if (error) {
      console.error('[saveToRecipeBook] error:', JSON.stringify(error));
      showToast(`Could not save: ${error.message}`);
    } else {
      setSavedToBook(prev => new Set([...prev, rowKey]));
      showToast(`"${opt.mealName}" saved to recipe book`);
    }
  };
  // Per-row day override — defaults to smart pick (not past)
  const [dayOverrides, setDayOverrides] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    pendingOptions.forEach(dayOpt => {
      dayOpt.options.forEach((_, idx) => {
        defaults[`${dayOpt.day}-${idx}`] = defaultDay(dayOpt.day);
      });
    });
    return defaults;
  });

  // Re-init dayOverrides when pendingOptions change
  useEffect(() => {
    const defaults: Record<string, string> = {};
    pendingOptions.forEach(dayOpt => {
      dayOpt.options.forEach((_, idx) => {
        defaults[`${dayOpt.day}-${idx}`] = defaultDay(dayOpt.day);
      });
    });
    setDayOverrides(defaults);
    setMealTypes({});
  }, [pendingOptions]);

  // Recipe detail modal
  const [activeRecipe, setActiveRecipe] = useState<Meal | null>(null);

  if (!visible) return null;

  const hasSuggestions = pendingOptions.length > 0;
  const P = colors.primary;
  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardBg  = isDark ? colors.card : '#FFFFFF';

  const allSuggestions = pendingOptions.flatMap(dayOpt =>
    dayOpt.options.map((opt, idx) => ({ ...opt, day: dayOpt.day, optionIdx: idx }))
  );

  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0);

  const toggleSelect = (day: string, idx: number) => {
    setSelected(prev => {
      const cur = prev[day] ?? [];
      if (cur.includes(idx)) {
        // Deselect — but keep at least 1 if it's the last one selected for this day
        const next = cur.filter(i => i !== idx);
        return { ...prev, [day]: next };
      } else {
        return { ...prev, [day]: [...cur, idx].sort() };
      }
    });
  };

  const getMealType = (day: string, optionIdx: number): MealType =>
    mealTypes[`${day}-${optionIdx}`] ?? 'dinner';

  // Validate no duplicate type on same assigned day
  const setMealType = (day: string, optionIdx: number, type: MealType) => {
    const rowKey = `${day}-${optionIdx}`;
    const assignedDay = dayOverrides[rowKey] ?? day;
    // Check if another selected row on the same assigned day already has this type
    const conflict = allSuggestions.some(s => {
      if (s.day === day && s.optionIdx === optionIdx) return false; // same row
      const otherKey = `${s.day}-${s.optionIdx}`;
      const otherDay = dayOverrides[otherKey] ?? s.day;
      if (otherDay !== assignedDay) return false;
      const isOtherSelected = (selected[s.day] ?? []).includes(s.optionIdx);
      if (!isOtherSelected) return false;
      return getMealType(s.day, s.optionIdx) === type;
    });
    if (conflict) return; // silently ignore — UI shows disabled state
    setMealTypes(prev => ({ ...prev, [rowKey]: type }));
  };

  const setDayForRow = (day: string, optionIdx: number, newDay: string) => {
    const rowKey = `${day}-${optionIdx}`;
    setDayOverrides(prev => ({ ...prev, [rowKey]: newDay }));
    // After changing day, check if the current type conflicts on new day and reset if so
    const currentType = getMealType(day, optionIdx);
    const conflict = allSuggestions.some(s => {
      if (s.day === day && s.optionIdx === optionIdx) return false;
      const otherKey = `${s.day}-${s.optionIdx}`;
      const otherDay = dayOverrides[otherKey] ?? s.day;
      if (otherDay !== newDay) return false;
      const isOtherSelected = (selected[s.day] ?? []).includes(s.optionIdx);
      if (!isOtherSelected) return false;
      return getMealType(s.day, s.optionIdx) === currentType;
    });
    if (conflict) {
      // Reset to first non-conflicting type
      const taken = new Set(
        allSuggestions
          .filter(s => {
            if (s.day === day && s.optionIdx === optionIdx) return false;
            const oKey = `${s.day}-${s.optionIdx}`;
            const oDay = dayOverrides[oKey] ?? s.day;
            return oDay === newDay && (selected[s.day] ?? []).includes(s.optionIdx);
          })
          .map(s => getMealType(s.day, s.optionIdx))
      );
      const fallback = MEAL_TYPES.find(t => !taken.has(t)) ?? 'dinner';
      setMealTypes(prev => ({ ...prev, [rowKey]: fallback }));
    }
  };

  const handleConfirm = () => {
    const mealTypeOverrides: Record<string, string> = {};
    allSuggestions.forEach(s => {
      const rowKey = `${s.day}-${s.optionIdx}`;
      mealTypeOverrides[rowKey] = getMealType(s.day, s.optionIdx);
    });
    confirmPlan(dayOverrides, mealTypeOverrides);
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
      <SwipeBackWrapper onDismiss={onClose}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={{ flex: 1, backgroundColor: canvas }}>

            {/* ── Header ── */}
            <View style={{
              paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
              backgroundColor: canvas, gap: 6,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                  FAMILY CUBE / {familyName.toUpperCase()}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
                  {(activeMember as any)?.name} · {(activeMember as any)?.role === 'parent' ? 'Parent / Admin' : 'Member'}
                </Text>
              </View>

              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Meals</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
                A little inspiration
              </Text>

              <View style={{ flexDirection: 'row', marginTop: 2 }}>
                <View style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.pinkLight }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.pink }}>
                    {hasSuggestions
                      ? `CubeAI · ${totalSelected === 0 ? 'none selected' : `${totalSelected} selected`}`
                      : 'CubeAI · weekly meal ideas'}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>

              {/* ── AI planner banner — always visible so user can re-generate ── */}
              <View style={{
                backgroundColor: cardBg, borderRadius: 20, padding: 20,
                borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
                shadowColor: isDark ? 'transparent' : '#172337',
                shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
              }}>
                <AiPlannerBanner
                  colors={colors} isDark={isDark}
                  aiOpen={aiOpen} setAiOpen={setAiOpen}
                  pulseOpacity={pulseOpacity} pulseScale={pulseScale}
                  aiPref={aiPref} setAiPref={setAiPref}
                  aiLoading={aiLoading} aiError={null}
                  generateMealPlan={generateMealPlan}
                />
              </View>

              {/* ── Generating / cache-loading state ── */}
              {(aiLoading || cacheLoading) && (
                <View style={{ backgroundColor: colors.pinkLight, borderRadius: 20, padding: 28, alignItems: 'center', gap: 12 }}>
                  <ActivityIndicator size="large" color={colors.pink} />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                    {aiLoading ? 'Crafting your week…' : 'Loading your ideas…'}
                  </Text>
                  {aiLoading && (
                    <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 }}>
                      CubeAI is picking meals that match your family's tastes.
                    </Text>
                  )}
                </View>
              )}

              {/* ── Empty state — shown inline when no suggestions exist yet ── */}
              {!aiLoading && !cacheLoading && !hasSuggestions && (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    What you'll get
                  </Text>
                  {[
                    { color: colors.amber,  light: colors.amberLight,  emoji: '📅', title: 'A full week of ideas', body: 'One or more options per day — pick only what you want.' },
                    { color: colors.teal,   light: colors.tealLight,   emoji: '🛒', title: 'Ingredients ready to shop', body: 'Accept a meal and ingredients land in your grocery list.' },
                    { color: colors.pink,   light: colors.pinkLight,   emoji: '📖', title: 'Save to recipe book', body: 'Loved a suggestion? One tap saves it to your family recipes.' },
                    { color: colors.primary, light: colors.primaryLight, emoji: '📆', title: 'You choose the day', body: 'AI suggests — you pick which day each meal actually lands on.' },
                  ].map(item => (
                    <View key={item.title} style={{
                      flexDirection: 'row', gap: 14, alignItems: 'flex-start',
                      backgroundColor: cardBg, borderRadius: 16, padding: 16,
                      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
                    }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: item.light, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{item.title}</Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>{item.body}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Why these ideas? (shown with results) ── */}
              {hasSuggestions && tip && !aiLoading && (
                <View style={{ backgroundColor: colors.pinkLight, borderRadius: 16, padding: 18, gap: 8 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>Why these ideas?</Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 22 }}>{tip}</Text>
                </View>
              )}

              {/* ── Suggested meals ── */}
              {hasSuggestions && !aiLoading && <View style={{
                backgroundColor: cardBg, borderRadius: 16,
                borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
                overflow: 'hidden',
                shadowColor: isDark ? 'transparent' : '#172337',
                shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
              }}>
                <View style={{ padding: 18, paddingBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>
                    Suggested for the week
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 3 }}>
                    Tap a meal to see recipe · pick day and slot below
                  </Text>
                </View>

                {allSuggestions.map((opt, listIdx) => {
                  const rowKey = `${opt.day}-${opt.optionIdx}`;
                  const isSelected = (selected[opt.day] ?? []).includes(opt.optionIdx);
                  const mealType = getMealType(opt.day, opt.optionIdx);
                  const assignedDay = dayOverrides[rowKey] ?? defaultDay(opt.day);

                  const takenTypes = new Set(
                    allSuggestions
                      .filter(s => {
                        if (s.day === opt.day && s.optionIdx === opt.optionIdx) return false;
                        const oKey = `${s.day}-${s.optionIdx}`;
                        const oDay = dayOverrides[oKey] ?? defaultDay(s.day);
                        return oDay === assignedDay && (selected[s.day] ?? []).includes(s.optionIdx);
                      })
                      .map(s => getMealType(s.day, s.optionIdx))
                  );

                  return (
                    <SuggestionRow
                      key={rowKey}
                      opt={opt}
                      listIdx={listIdx}
                      isSelected={isSelected}
                      mealType={mealType}
                      assignedDay={assignedDay}
                      takenTypes={takenTypes}
                      alreadySaved={savedToBook.has(rowKey)}
                      P={P} colors={colors} isDark={isDark}
                      onToggle={() => toggleSelect(opt.day, opt.optionIdx)}
                      onOpenRecipe={() => setActiveRecipe({
                        id: rowKey, family_id: '', week_of: '',
                        day: assignedDay, title: opt.mealName, type: mealType as string,
                        emoji: opt.emoji ?? null, prep_minutes: opt.prepMinutes ?? null,
                        ingredients: opt.ingredientsList ?? [], prep_steps: opt.prepSteps ?? [],
                        dietary_tags: opt.dietaryTags ?? [], chef_id: null,
                        start_time: null, linked_event_id: null, ai_generated: true,
                        kid_friendly_rating: opt.kidFriendlyRating ?? null,
                      } as Meal)}
                      onSetDay={d => setDayForRow(opt.day, opt.optionIdx, d)}
                      onSetMealType={t => setMealType(opt.day, opt.optionIdx, t)}
                      onSaveToBook={() => saveToRecipeBook(opt)}
                    />
                  );
                })}

                <View style={{ padding: 16, paddingTop: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                    {totalSelected === 0
                      ? 'No ideas selected yet — tap the circles to pick meals.'
                      : `${totalSelected} meal${totalSelected > 1 ? 's' : ''} selected. Chef assignments can be set from the week plan.`}
                  </Text>
                </View>
              </View>}

              {/* ── Accept button ── */}
              {hasSuggestions && !aiLoading && (
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={savingPlan || totalSelected === 0}
                  style={{
                    borderRadius: 16, paddingVertical: 17, alignItems: 'center',
                    backgroundColor: totalSelected > 0 ? P : colors.border,
                    flexDirection: 'row', justifyContent: 'center', gap: 8,
                  }}>
                  {savingPlan
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                        {totalSelected === 0
                          ? 'Select ideas above'
                          : `Accept ${totalSelected} idea${totalSelected > 1 ? 's' : ''} into week`}
                      </Text>}
                </TouchableOpacity>
              )}

            </ScrollView>

            {/* Recipe detail — full page, read-only */}
            <RecipeModal
              meal={activeRecipe}
              visible={!!activeRecipe}
              onClose={() => setActiveRecipe(null)}
              onAddToGrocery={async (names) => {
                const { addItem, items: existing, familyId: sfId } = useGroceryStore.getState();
                const famId = (members[0] as any)?.familyId ?? 'family-1';
                const effectiveFamilyId = sfId ?? famId;
                const existingNames = new Set(existing.map((i: any) => i.name.toLowerCase().trim()));
                for (const name of names) {
                  if (!existingNames.has(name.toLowerCase().trim())) {
                    await addItem({ familyId: effectiveFamilyId, name, quantity: '1', category: categorizeItem(name), addedBy: (activeMember as any)?.id ?? '', aiGenerated: true, notes: activeRecipe ? `From ${activeRecipe.title}` : undefined });
                  }
                }
                showToast('Ingredients added to grocery list');
              }}
              senderId={(activeMember as any)?.id ?? ''}
              colors={colors}
              isDark={isDark}
            />

          </View>
        </Animated.View>
      </SwipeBackWrapper>
    </View>
  );
}
