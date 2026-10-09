import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import type { Meal, AiDayOptions } from './types';
import type { FamilyMember } from '@/store/familyStore';

const MEAL_SLOTS = [
  { type: 'breakfast', label: 'Breakfast', icon: '🍳' },
  { type: 'lunch',     label: 'Lunch',     icon: '☀️' },
  { type: 'dinner',    label: 'Dinner',    icon: '🌙' },
] as const;

function fmtDayHeading(day: string): string {
  const DAY_FULL: Record<string, string> = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
    Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  };
  const DAY_IDX: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const today = new Date();
  const monday = new Date(today);
  const mDiff = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - mDiff);
  const dayOffset = DAY_IDX[day] === 0 ? 6 : (DAY_IDX[day] ?? 1) - 1;
  const date = new Date(monday);
  date.setDate(monday.getDate() + dayOffset);
  const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  return `${DAY_FULL[day] ?? day} · ${dateStr}`;
}

function MemberAvatar({ member, size = 26, colors }: { member: FamilyMember; size?: number; colors: any }) {
  const name = (member as any).name as string ?? '?';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const hue = name.charCodeAt(0) % 360;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: `hsl(${hue},60%,55%)`,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: colors.teal + '60' }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: '900', color: '#fff' }}>{initials}</Text>
    </View>
  );
}

export default function DayCard({ day, meals, members, aiOptions, aiSelected, onAiToggle, onRecipe, onEdit, onDelete, onAdd, onChefSwap, colors, isDark }: {
  day: string; meals: Meal[];
  members?: FamilyMember[];
  aiOptions?: AiDayOptions;
  aiSelected?: number[];
  onAiToggle?: (day: string, idx: number) => void;
  onRecipe: (m: Meal) => void;
  onEdit?: (m: Meal) => void;
  onDelete?: (m: Meal) => void;
  onAdd?: () => void;
  onChefSwap?: (mealId: string, newChefId: string | null) => void;
  colors: any; isDark: boolean;
}) {
  const todayShort = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  const isToday = todayShort === day;
  const [chefPickerMealId, setChefPickerMealId] = useState<string | null>(null);

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Day heading */}
      <Text style={{
        fontSize: 20, fontWeight: '700', color: colors.textPrimary,
        marginBottom: 10, marginTop: 4,
      }}>
        {fmtDayHeading(day)}
      </Text>

      {/* White shadow card */}
      <View style={{
        backgroundColor: isToday ? colors.tealLight + 'AA' : colors.card,
        borderRadius: 16, borderWidth: 1,
        borderColor: isToday ? colors.teal + '30' : colors.border,
        overflow: 'hidden',
        shadowColor: isDark ? 'transparent' : '#172337',
        shadowOpacity: isDark ? 0 : 0.06, shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 }, elevation: isDark ? 0 : 2,
      }}>
        {MEAL_SLOTS.map(({ type, label, icon }, idx) => {
          const meal = meals.find(m => m.type?.toLowerCase() === type);
          const chef = meal?.chef_id ? members?.find(m => m.id === meal.chef_id) : undefined;
          const isPickerOpen = chefPickerMealId === meal?.id;

          return (
            <View key={type}>
              {idx > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
              <Pressable
                onPress={() => meal ? (onEdit ? onEdit(meal) : onRecipe(meal)) : onAdd?.()}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                  padding: 16,
                  backgroundColor: pressed ? colors.surface : 'transparent',
                })}>
                {/* Meal type icon */}
                <View style={{ width: 36, height: 36, borderRadius: 10,
                  backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{meal?.emoji ?? icon}</Text>
                </View>

                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                    {label}
                  </Text>

                  {meal ? (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }} numberOfLines={1}>
                        {meal.title}{meal.start_time ? ` · ${meal.start_time}` : ''}
                      </Text>

                      {/* Chef row — avatar + name + swap button */}
                      {onChefSwap && members && members.length > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          {chef ? (
                            <>
                              <MemberAvatar member={chef} size={22} colors={colors} />
                              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>
                                {(chef as any).name.split(' ')[0]}
                              </Text>
                            </>
                          ) : (
                            <Text style={{ fontSize: 12, color: colors.textTertiary }}>No chef</Text>
                          )}
                          <Pressable
                            onPress={(e) => { e.stopPropagation?.(); setChefPickerMealId(isPickerOpen ? null : meal.id); }}
                            style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
                              {chef ? 'Swap chef' : 'Assign chef'}
                            </Text>
                          </Pressable>
                        </View>
                      )}

                      {/* Inline chef picker */}
                      {isPickerOpen && members && (
                        <View style={{ marginTop: 8, padding: 10, borderRadius: 12,
                          backgroundColor: colors.surface, gap: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5,
                            color: colors.textTertiary, marginBottom: 4 }}>
                            WHO'S COOKING?
                          </Text>
                          {/* No chef option */}
                          <Pressable
                            onPress={(e) => { e.stopPropagation?.(); onChefSwap?.(meal.id, null); setChefPickerMealId(null); }}
                            style={({ pressed }) => ({
                              flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8,
                              borderRadius: 10, backgroundColor: !chef ? colors.tealLight : (pressed ? colors.border : 'transparent'),
                            })}>
                            <View style={{ width: 22, height: 22, borderRadius: 11,
                              backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 12 }}>👨‍👩‍👧</Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>Anyone</Text>
                            {!chef && <Text style={{ fontSize: 11, color: colors.teal, marginLeft: 'auto' }}>✓</Text>}
                          </Pressable>
                          {members.map(m => {
                            const isSelected = meal.chef_id === (m as any).id;
                            return (
                              <Pressable
                                key={(m as any).id}
                                onPress={(e) => { e.stopPropagation?.(); onChefSwap?.(meal.id, (m as any).id); setChefPickerMealId(null); }}
                                style={({ pressed }) => ({
                                  flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8,
                                  borderRadius: 10, backgroundColor: isSelected ? colors.tealLight : (pressed ? colors.border : 'transparent'),
                                })}>
                                <MemberAvatar member={m} size={22} colors={colors} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
                                    {(m as any).name}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                                    {(m as any).role === 'kid' ? 'With help' : (m as any).role}
                                  </Text>
                                </View>
                                {isSelected && <Text style={{ fontSize: 11, color: colors.teal }}>✓</Text>}
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      <Pressable onPress={() => onEdit ? onEdit(meal) : onRecipe(meal)}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal, marginTop: 2 }}>
                          {onEdit ? `Edit ${label.toLowerCase()} →` : `Open recipe →`}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable onPress={onAdd}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal, marginTop: 2 }}>
                        {onAdd ? `Choose ${label.toLowerCase()} →` : `No ${label.toLowerCase()} planned`}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            </View>
          );
        })}

        {/* ── AI Suggestions inline ── */}
        {aiOptions && aiOptions.options.length > 0 && (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
            padding: 14, gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.7, color: colors.accent }}>
              ✦ AI SUGGESTIONS
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
              {aiOptions.options.map((opt, idx) => {
                const isSel = aiSelected?.includes(idx);
                return (
                  <Pressable
                    key={idx}
                    onPress={() => onAiToggle?.(day, idx)}
                    style={({ pressed }) => ({
                      width: 160, borderRadius: 14, padding: 12,
                      backgroundColor: isSel ? colors.accent + '18' : colors.surface,
                      borderWidth: 1.5,
                      borderColor: isSel ? colors.accent : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    })}>
                    <Text style={{ fontSize: 22, marginBottom: 4 }}>{opt.emoji ?? '🍽️'}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, lineHeight: 17 }}
                      numberOfLines={2}>
                      {opt.mealName}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>
                      {opt.prepMinutes} min
                      {opt.kidFriendlyRating >= 4 ? ' · Kid ⭐' : ''}
                    </Text>
                    {isSel && (
                      <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent,
                          alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '900' }}>✓</Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>Selected</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}
