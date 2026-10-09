import { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Animated, Easing, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { AiDayOptions, Meal } from './types';
import { useFamilyStore } from '@/store/familyStore';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';
import RecipeModal from './RecipeModal';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const TYPE_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

function dayToDate(day: string): string {
  const today = new Date();
  const mDiff = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mDiff);
  const DAY_IDX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const d = new Date(monday);
  d.setDate(monday.getDate() + (DAY_IDX[day] ?? 0));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AiSuggestionsPage({
  visible, pendingOptions, selected, setSelected, tip,
  savingPlan, confirmPlan, existingMeals, weekRange,
  onClose, onViewMeal, colors, isDark,
}: {
  visible: boolean;
  pendingOptions: AiDayOptions[];
  selected: Record<string, number[]>;
  setSelected: React.Dispatch<React.SetStateAction<Record<string, number[]>>>;
  tip: string | null;
  savingPlan: boolean;
  confirmPlan: () => void;
  existingMeals: Meal[];
  weekRange: string;
  onClose: () => void;
  onViewMeal: (meal: { title: string; emoji?: string; day: string; prepMinutes: number; ingredients: string[]; prepSteps?: string[]; dietaryTags: string[] }) => void;
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
    }
  }, [visible]);

  // Per-suggestion meal type override — defaults to 'dinner'
  const [mealTypes, setMealTypes] = useState<Record<string, MealType>>({});
  // Recipe detail modal
  const [activeRecipe, setActiveRecipe] = useState<Meal | null>(null);

  if (!visible || !pendingOptions.length) return null;

  const P = colors.primary;
  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardBg  = isDark ? colors.card : '#FFFFFF';

  const allSuggestions = pendingOptions.flatMap(dayOpt =>
    dayOpt.options.map((opt, idx) => ({ ...opt, day: dayOpt.day, optionIdx: idx }))
  );

  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0);

  const toggleSelect = (day: string, idx: number) => {
    setSelected(prev => {
      const cur = prev[day] ?? [0];
      if (cur.includes(idx)) {
        const next = cur.filter(i => i !== idx);
        return { ...prev, [day]: next.length ? next : cur };
      } else if (cur.length < 2) {
        return { ...prev, [day]: [...cur, idx].sort() };
      }
      return prev;
    });
  };

  const getMealType = (day: string, optionIdx: number): MealType =>
    mealTypes[`${day}-${optionIdx}`] ?? 'dinner';

  const setMealType = (day: string, optionIdx: number, type: MealType) =>
    setMealTypes(prev => ({ ...prev, [`${day}-${optionIdx}`]: type }));

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
                    Optional AI ideas · {totalSelected === 0 ? 'no slots filled' : `${totalSelected} selected`}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>

              {/* Subtitle */}
              <Text style={{ fontSize: 15, color: colors.textSecondary, lineHeight: 22 }}>
                Accept only the meals you want — pick the day, meal slot, and whether to include it. Existing meals stay untouched.
              </Text>

              {/* Why these ideas? */}
              {tip && (
                <View style={{ backgroundColor: colors.pinkLight, borderRadius: 16, padding: 18, gap: 8 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>Why these ideas?</Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 22 }}>{tip}</Text>
                </View>
              )}

              {/* Suggested meals */}
              <View style={{
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
                    Tap a meal to see recipe · pick its slot below
                  </Text>
                </View>

                {allSuggestions.map((opt, listIdx) => {
                  const rowKey = `${opt.day}-${opt.optionIdx}`;
                  const isSelected = (selected[opt.day] ?? [0]).includes(opt.optionIdx);
                  const mealType = getMealType(opt.day, opt.optionIdx);
                  const dateLabel = dayToDate(opt.day);

                  return (
                    <View key={rowKey}>
                      {listIdx > 0 && (
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 16 }} />
                      )}

                      {/* Main row */}
                      <View style={{
                        paddingHorizontal: 16, paddingVertical: 12,
                        backgroundColor: isSelected ? colors.primaryLight : 'transparent',
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                          {/* Checkbox */}
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => toggleSelect(opt.day, opt.optionIdx)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={{
                              width: 24, height: 24, borderRadius: 12, borderWidth: 2, marginTop: 1,
                              borderColor: isSelected ? P : colors.textTertiary,
                              backgroundColor: isSelected ? P : 'transparent',
                              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                            {isSelected && <Check size={13} color="#fff" strokeWidth={3} />}
                          </TouchableOpacity>

                          {/* Meal info — tap to open full recipe detail */}
                          <Pressable style={{ flex: 1 }}
                            onPress={() => setActiveRecipe({
                              id: rowKey,
                              family_id: '',
                              week_of: '',
                              day: opt.day,
                              title: opt.mealName,
                              type: mealType,
                              emoji: opt.emoji ?? null,
                              prep_minutes: opt.prepMinutes ?? null,
                              ingredients: opt.ingredientsList ?? [],
                              prep_steps: opt.prepSteps ?? [],
                              dietary_tags: opt.dietaryTags ?? [],
                              chef_id: null,
                              start_time: null,
                              linked_event_id: null,
                              ai_generated: true,
                              kid_friendly_rating: opt.kidFriendlyRating ?? null,
                            } as Meal)}>
                            {/* Day + date */}
                            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.4,
                              color: colors.textTertiary, marginBottom: 2 }}>
                              {opt.day.toUpperCase()} · {dateLabel.toUpperCase()}
                            </Text>
                            {/* Title */}
                            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                              {opt.emoji ? opt.emoji + ' ' : ''}{opt.mealName}
                            </Text>
                            {/* Meta */}
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                              {[
                                opt.prepMinutes ? `${opt.prepMinutes} min` : null,
                                opt.dietaryTags?.slice(0, 2).join(' · ') || null,
                                opt.kidFriendlyRating >= 4 ? 'Kid-friendly ⭐' : null,
                              ].filter(Boolean).join(' · ')}
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal, marginTop: 4 }}>
                              See full recipe →
                            </Text>
                          </Pressable>
                        </View>

                        {/* ── Meal type picker ── */}
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, marginLeft: 36 }}>
                          {MEAL_TYPES.map(t => {
                            const active = mealType === t;
                            return (
                              <Pressable key={t} onPress={() => setMealType(opt.day, opt.optionIdx, t)}
                                style={({ pressed }) => ({
                                  borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
                                  backgroundColor: active ? colors.amber : colors.surface,
                                  borderWidth: 1,
                                  borderColor: active ? colors.amber : colors.border,
                                  opacity: pressed ? 0.75 : 1,
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
                })}

                <View style={{ padding: 16, paddingTop: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                    {totalSelected === 0
                      ? 'No ideas selected yet — tap the circles to pick meals.'
                      : `${totalSelected} meal${totalSelected > 1 ? 's' : ''} selected. Chef assignments can be set from the week plan.`}
                  </Text>
                </View>
              </View>

              {/* ── Accept button (scrolls with content) ── */}
              <TouchableOpacity
                onPress={confirmPlan}
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

              {/* Dismiss */}
              <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: P }}>
                  Dismiss · leave week unchanged
                </Text>
              </TouchableOpacity>

            </ScrollView>

            {/* Recipe detail — full page, read-only */}
            <RecipeModal
              meal={activeRecipe}
              visible={!!activeRecipe}
              onClose={() => setActiveRecipe(null)}
              onAddToGrocery={async () => {}}
              senderId={(activeMember as any)?.id ?? ''}
              hideAddToGrocery
              colors={colors}
              isDark={isDark}
            />

          </View>
        </Animated.View>
      </SwipeBackWrapper>
    </View>
  );
}
