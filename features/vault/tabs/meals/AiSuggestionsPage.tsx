import { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { AiDayOptions, Meal } from './types';
import { useFamilyStore } from '@/store/familyStore';
import SwipeBackWrapper from '@/components/SwipeBackWrapper';

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

  // "Preserve existing meals" toggle — on by default, matches Figma checked state
  const [preserveExisting, setPreserveExisting] = useState(true);

  if (!visible || !pendingOptions.length) return null;

  const P = colors.primary;
  const canvas = isDark ? '#0E0C13' : '#FFFFFF';
  const cardBg  = isDark ? colors.card : '#FFFFFF';

  // Flatten all suggestions into a single list
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

  const suggestedChefName = (day: string): string => {
    const idx = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(day);
    const m = members[idx % members.length];
    return m ? (m as any).name?.split(' ')[0] ?? 'Someone' : 'Someone';
  };

  // Existing dinners for the "Preserve existing meals" row
  const existingDinners = existingMeals.filter(m => m.type === 'dinner' || m.type === 'Dinner').slice(0, 2);
  const existingLabel = existingDinners.map(m => {
    const chef = m.chef_id ? members.find(mb => mb.id === m.chef_id)?.name?.split(' ')[0] : null;
    return `${m.day} ${m.start_time ?? ''} ${m.title}${chef ? ` · ${chef} cooks` : ''}`.trim();
  }).join(', ') || 'existing meals stay untouched';

  const selectionSummary = totalSelected === 0
    ? 'No ideas selected yet.'
    : totalSelected === 1 ? 'One idea selected. Chef assignments are suggestions and need confirmation.'
    : `${['Two','Three','Four','Five','Six','Seven'][totalSelected - 2] ?? totalSelected} ideas selected. Chef assignments are suggestions and need confirmation.`;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
      <SwipeBackWrapper onDismiss={onClose}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={{ flex: 1, backgroundColor: canvas }}>

            {/* ── Header — matches Figma exactly ── */}
            <View style={{
              paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: isDark ? colors.border : 'rgba(223,97,60,0.08)',
              backgroundColor: canvas, gap: 6,
            }}>
              {/* FAMILY CUBE / NAME · member role */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
                  FAMILY CUBE / {familyName.toUpperCase()}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.teal }}>
                  {(activeMember as any)?.name} · {(activeMember as any)?.role === 'parent' ? 'Parent / Admin' : 'Member'}
                </Text>
              </View>

              {/* ← Meal week breadcrumb */}
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Meal week</Text>
              </TouchableOpacity>

              {/* Title */}
              <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 34, letterSpacing: -0.5, color: colors.textPrimary }}>
                A little inspiration
              </Text>

              {/* Status pill — below title, matches Figma */}
              <View style={{ flexDirection: 'row', marginTop: 2 }}>
                <View style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.pinkLight }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.pink }}>
                    Optional AI ideas · {totalSelected === 0 ? 'no slots filled' : `${totalSelected} selected`}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 160, gap: 16 }}>

              {/* Subtitle */}
              <Text style={{ fontSize: 15, color: colors.textSecondary, lineHeight: 22 }}>
                {`Fictional suggestion preview for ${weekRange}. Accept only the meals you want; existing meals stay untouched.`}
              </Text>

              {/* Why these ideas? — lavender card */}
              <View style={{ backgroundColor: colors.pinkLight, borderRadius: 16, padding: 18, gap: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
                  Why these ideas?
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 22 }}>
                  {tip ?? "They reuse rice, tomatoes and vegetables on your list, leave space for busy evenings, and vary the week. Check preferences and allergies yourself; these aren't nutrition or medical recommendations."}
                </Text>
              </View>

              {/* Suggested for open slots — white card */}
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
                    Suggested for open slots
                  </Text>
                </View>

                {allSuggestions.map((opt, listIdx) => {
                  const isSelected = (selected[opt.day] ?? [0]).includes(opt.optionIdx);
                  return (
                    <View key={`${opt.day}-${opt.optionIdx}`}>
                      {listIdx > 0 && (
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 16 }} />
                      )}
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 14,
                        paddingHorizontal: 16, paddingVertical: 14,
                        backgroundColor: isSelected ? colors.primaryLight : 'transparent',
                      }}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => toggleSelect(opt.day, opt.optionIdx)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={{
                            width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                            borderColor: isSelected ? P : colors.textTertiary,
                            backgroundColor: isSelected ? P : 'transparent',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                          {isSelected && <Check size={13} color="#fff" strokeWidth={3} />}
                        </TouchableOpacity>

                        <TouchableOpacity style={{ flex: 1 }} onPress={() => onViewMeal({
                          title: opt.mealName, emoji: opt.emoji, day: opt.day,
                          prepMinutes: opt.prepMinutes, ingredients: opt.ingredientsList,
                          prepSteps: opt.prepSteps, dietaryTags: opt.dietaryTags,
                        })}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                            {opt.day} {opt.emoji ? opt.emoji + ' ' : ''}· {opt.mealName}
                          </Text>
                          <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                            {[
                              opt.prepMinutes ? `${opt.prepMinutes} min` : null,
                              `${suggestedChefName(opt.day)} suggested`,
                              opt.ingredientsList[0] ? `uses ${opt.ingredientsList[0].split(' ').slice(-1)[0]}` : null,
                            ].filter(Boolean).join(' · ')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}

                {/* Selection summary */}
                <View style={{ padding: 16, paddingTop: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                    {selectionSummary}
                  </Text>
                </View>
              </View>

              {/* "Edit selected meal ideas" — bordered CTA, matches Figma */}
              <TouchableOpacity
                onPress={() => { /* opens MealFormSheet for first selected */ }}
                disabled={totalSelected === 0}
                style={{
                  borderRadius: 16, paddingVertical: 16, alignItems: 'center',
                  borderWidth: 1.5,
                  borderColor: totalSelected > 0 ? P : colors.border,
                  backgroundColor: cardBg,
                }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: totalSelected > 0 ? P : colors.textTertiary }}>
                  Edit selected meal ideas
                </Text>
              </TouchableOpacity>

              {/* "Preserve existing meals" checkbox row */}
              {existingDinners.length > 0 && (
                <TouchableOpacity
                  onPress={() => setPreserveExisting(p => !p)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    backgroundColor: cardBg, borderRadius: 16,
                    padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
                  }}>
                  <View style={{
                    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                    borderColor: preserveExisting ? P : colors.textTertiary,
                    backgroundColor: preserveExisting ? P : 'transparent',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {preserveExisting && <Check size={13} color="#fff" strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                      Preserve existing meals
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                      {existingLabel}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

            </ScrollView>

            {/* ── Fixed footer — matches Figma ── */}
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              paddingBottom: insets.bottom + 8, paddingTop: 12, paddingHorizontal: 20,
              backgroundColor: canvas,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
              gap: 10,
            }}>
              {/* Primary: "Accept N ideas into selected slots" */}
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
                        : `Accept ${totalSelected} idea${totalSelected > 1 ? 's' : ''} into selected slots`}
                    </Text>}
              </TouchableOpacity>

              {/* Dismiss link */}
              <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: P }}>
                  Dismiss · leave week unchanged
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </Animated.View>
      </SwipeBackWrapper>
    </View>
  );
}
