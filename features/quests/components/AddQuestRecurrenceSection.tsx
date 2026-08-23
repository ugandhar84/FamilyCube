import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Pressable } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { TYPO } from '@/constants/theme';

type RoutineType = 'citizenship' | 'routine' | 'bounty' | 'shopping';
type RoutineFreq = 'daily' | 'weekly' | 'monthly' | 'first_come' | 'once';

// ─── Parent Only / GP Welcome toggles + Repeats picker + Recurring Chore
// setup (routine type, frequency, shopping item list) ──────────────────────
// Extracted verbatim from AddQuestModal — all state/handlers live in the
// parent; this is purely presentational, same split pattern as
// HealthRecordsList / GroceryScreen's extracted sections.
export function AddQuestRecurrenceSection({
  colors, isDark,
  isAdultTask, toggleAdultTask,
  inviteGrandparent, toggleGPInvite,
  routineFreq, setRoutineFreq,
  isRoutine, setIsRoutine,
  routineType, setRoutineType,
  recurrenceDays, setRecurrenceDays,
  recurrenceDayOfMonth, setRecurrenceDayOfMonth,
  setCoins,
  shoppingStore, setShoppingStore,
  shoppingBudget, setShoppingBudget,
  shoppingItemsOpen, setShoppingItemsOpen,
  shoppingLines, updateShoppingLine, removeShoppingLine, addShoppingLine,
  hideAdultToggles,
}: {
  colors: any; isDark: boolean;
  isAdultTask: boolean; toggleAdultTask: (val: boolean) => void;
  inviteGrandparent: boolean; toggleGPInvite: (val: boolean) => void;
  // Scenario 1.5 — a Teen creator doesn't get the "Parent Only" (delegate
  // to another adult) or "Invite Grandparent" (GP-sponsored quest)
  // toggles; both are parent-oriented concepts. isAdultTask/inviteGrandparent
  // stay permanently false for a Teen creator since these are simply never
  // shown for them to turn on.
  hideAdultToggles?: boolean;
  routineFreq: RoutineFreq; setRoutineFreq: React.Dispatch<React.SetStateAction<RoutineFreq>>;
  isRoutine: boolean; setIsRoutine: React.Dispatch<React.SetStateAction<boolean>>;
  routineType: RoutineType; setRoutineType: (v: RoutineType) => void;
  // Which weekdays a Weekly chore recurs on (0=Sun..6=Sat) — same shape and
  // picker UI as EventFormModal's repeatDays, so "Weekly" reads the same way
  // across Schedule and Chores instead of two different recurrence idioms.
  recurrenceDays: number[]; setRecurrenceDays: React.Dispatch<React.SetStateAction<number[]>>;
  // Which day of the month a Monthly chore recurs on (1-28, or 31 as "last
  // day of the month") — undefined means "whatever day it was first
  // approved on", the pre-existing implicit behavior.
  recurrenceDayOfMonth: number | undefined; setRecurrenceDayOfMonth: (v: number | undefined) => void;
  setCoins: (v: string) => void;
  shoppingStore: string; setShoppingStore: (v: string) => void;
  shoppingBudget: string; setShoppingBudget: (v: string) => void;
  shoppingItemsOpen: boolean; setShoppingItemsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shoppingLines: string[]; updateShoppingLine: (i: number, v: string) => void; removeShoppingLine: (i: number) => void; addShoppingLine: () => void;
}) {
  return (
    <>
      {/* Parent Only / GP Welcome — two compact, related switches sitting
          side-by-side instead of two heavy full-width toggle rows.
          Renamed from "Adult Task" / "Invite Grandparent" for clarity.
          Hidden entirely for a Teen creator (Scenario 1.5) — both toggles
          describe delegating to another adult, which isn't a Teen's
          decision to make. */}
      {!hideAdultToggles && <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
            backgroundColor: isAdultTask ? colors.primaryLight : colors.surface,
            borderWidth: 1.5, borderColor: isAdultTask ? colors.primary : colors.border }}
          onPress={() => toggleAdultTask(!isAdultTask)}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isAdultTask ? colors.primary : colors.textPrimary }}>
            👨‍👩 Parent Only
          </Text>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1, textAlign: 'center' }}>
            Hidden from kids
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
            backgroundColor: inviteGrandparent ? colors.amberLight : colors.surface,
            borderWidth: 1.5, borderColor: inviteGrandparent ? colors.amber : colors.border }}
          onPress={() => toggleGPInvite(!inviteGrandparent)}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: inviteGrandparent ? colors.amber : colors.textPrimary }}>
            👴 GP Welcome
          </Text>
          <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1, textAlign: 'center' }}>
            {inviteGrandparent ? 'Can claim it' : 'Let GP claim it'}
          </Text>
        </TouchableOpacity>
      </View>}

      {/* Repeats — a parent-only task can recur too (routineFreq already
          feeds the same recurrence field the kid-chore path uses,
          approveChore already resets ANY chore back to todo on its
          cycle regardless of who it's assigned to — this control was
          simply missing from the UI for the adult-task path).
          No explicit "One-time" chip — that's just the default when
          nothing here is selected, tapping an active chip again
          deselects it back to one-time. */}
      {isAdultTask && (
        <View style={{ marginBottom: 14 }}>
          <Text style={[{ fontSize: TYPO.caption, fontWeight: '700', marginBottom: 5 }, { color: colors.textSecondary }]}>
            Repeats{'  '}
            <Text style={{ fontWeight: '400', color: colors.textTertiary }}>
              {routineFreq === 'once' ? 'one-time' : ''}
            </Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {([
              { key: 'daily',   label: '📅 Daily' },
              { key: 'weekly',  label: '🗓 Weekly' },
              { key: 'monthly', label: '📆 Monthly' },
            ] as const).map(({ key, label }) => (
              <TouchableOpacity key={key}
                onPress={() => setRoutineFreq(f => f === key ? 'once' : key)}
                style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
                  borderColor: routineFreq === key ? colors.primary : colors.border,
                  backgroundColor: routineFreq === key ? colors.primaryLight : 'transparent' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                  color: routineFreq === key ? colors.primary : colors.textSecondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Routine Chore Setup */}
      {!isAdultTask && (
        <View style={{ marginBottom: 14 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
              backgroundColor: isRoutine ? colors.tealLight : colors.surface,
              borderWidth: 1.5, borderColor: isRoutine ? BRAND.teal : colors.border }}
            onPress={() => setIsRoutine(r => !r)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: isRoutine ? BRAND.teal : colors.textPrimary, flex: 1 }}>
              🔄 Recurring Chore
            </Text>
            <View style={{ width: 38, height: 22, borderRadius: 11,
              backgroundColor: isRoutine ? BRAND.teal : (isDark ? '#334155' : '#CBD5E1'),
              justifyContent: 'center', paddingHorizontal: 2 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
                alignSelf: isRoutine ? 'flex-end' : 'flex-start' }} />
            </View>
          </TouchableOpacity>

          {isRoutine && (
            <View style={{ marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0', overflow: 'hidden' }}>
              {/* Chore type row — full width, tappable cards. Each
                  chip's own label already says what it is; the
                  separate "context hint" paragraph that used to sit
                  below this (re-explaining the same 4 options in
                  prose) was redundant and dropped. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {([
                  { key: 'citizenship', emoji: '🌱', label: 'Citizenship', color: '#059669', bg: '#ECFDF5', bgDark: '#0a2018', freq: 'daily' as const },
                  { key: 'routine',     emoji: '⭐', label: 'Routine',     color: BRAND.purple, bg: BRAND.purple + '12', bgDark: BRAND.purple + '20', freq: 'weekly' as const },
                  { key: 'bounty',      emoji: '💎', label: 'Bounty',      color: BRAND.amber, bg: BRAND.amber + '12', bgDark: BRAND.amber + '20', freq: 'first_come' as const },
                  { key: 'shopping',    emoji: '🛍️', label: 'Shopping',    color: BRAND.teal,  bg: BRAND.teal + '12', bgDark: BRAND.teal + '20', freq: 'once' as const },
                ] as const).map(({ key, emoji, label, color, bg, bgDark, freq }, i) => (
                  <TouchableOpacity key={key}
                    onPress={() => { setRoutineType(key); setRoutineFreq(freq); if (key === 'citizenship') setCoins('0'); }}
                    style={{ width: '50%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, gap: 5,
                      borderRightWidth: i % 2 === 0 ? 1 : 0,
                      borderBottomWidth: i < 2 ? 1 : 0,
                      borderRightColor: isDark ? colors.border : '#E2E8F0',
                      borderBottomColor: isDark ? colors.border : '#E2E8F0',
                      backgroundColor: routineType === key ? (isDark ? bgDark : bg) : 'transparent',
                    }}>
                    <Text style={{ fontSize: 15 }}>{emoji}</Text>
                    <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '900', color: routineType === key ? color : colors.textSecondary }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Frequency — locked for citizenship, bounty, shopping */}
              {routineType === 'routine' && (
                <View style={{ padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#F1F5F9' }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {([
                      { key: 'daily',   label: '📅 Daily' },
                      { key: 'weekly',  label: '🗓 Weekly' },
                      { key: 'monthly', label: '📆 Monthly' },
                    ] as const).map(({ key, label }) => (
                      <TouchableOpacity key={key}
                        onPress={() => setRoutineFreq(key)}
                        style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
                          borderColor: routineFreq === key ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                          backgroundColor: routineFreq === key ? BRAND.teal + '18' : 'transparent',
                        }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '800',
                          color: routineFreq === key ? BRAND.teal : colors.textSecondary }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Which days — same S/M/T/W/T/F/S weekday-chip picker as
                      the Schedule tab's own Repeats section (EventFormModal),
                      so weekly recurrence looks and works identically in
                      both places. No selection = every 7 days from whenever
                      it was last approved, same as before this existed. */}
                  {routineFreq === 'weekly' && (
                    <View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        Which days?{'  '}
                        <Text style={{ fontWeight: '400', textTransform: 'none' }}>{recurrenceDays.length === 0 ? 'any day, every 7 days' : ''}</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, dow) => {
                          const active = recurrenceDays.includes(dow);
                          return (
                            <TouchableOpacity key={dow}
                              onPress={() => setRecurrenceDays(days => active ? days.filter(d => d !== dow) : [...days, dow].sort())}
                              style={{ flex: 1, borderRadius: 8, borderWidth: 1.5, paddingVertical: 8, alignItems: 'center',
                                borderColor: active ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                                backgroundColor: active ? BRAND.teal : 'transparent' }}>
                              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: active ? '#fff' : colors.textSecondary }}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Which day of the month — 1-28 plus "Last day" (never a
                      fixed 29/30/31, which silently vanishes or shifts in
                      shorter months). No selection = whatever day-of-month
                      it was first approved on, same as before this existed. */}
                  {routineFreq === 'monthly' && (
                    <View>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        Which day?{'  '}
                        <Text style={{ fontWeight: '400', textTransform: 'none' }}>{!recurrenceDayOfMonth ? 'day it was first approved' : ''}</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(day => {
                          const active = recurrenceDayOfMonth === day;
                          return (
                            <TouchableOpacity key={day}
                              onPress={() => setRecurrenceDayOfMonth(active ? undefined : day)}
                              style={{ width: '12.5%', aspectRatio: 1, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
                                borderColor: active ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                                backgroundColor: active ? BRAND.teal : 'transparent' }}>
                              <Text style={{ fontSize: TYPO.micro + 1, fontWeight: '800', color: active ? '#fff' : colors.textSecondary }}>{day}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          onPress={() => setRecurrenceDayOfMonth(recurrenceDayOfMonth === 31 ? undefined : 31)}
                          style={{ flexGrow: 1, borderRadius: 8, borderWidth: 1.5, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', marginTop: 4,
                            borderColor: recurrenceDayOfMonth === 31 ? BRAND.teal : (isDark ? colors.border : '#E2E8F0'),
                            backgroundColor: recurrenceDayOfMonth === 31 ? BRAND.teal : 'transparent' }}>
                          <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: recurrenceDayOfMonth === 31 ? '#fff' : colors.textSecondary }}>Last day</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Shopping item list */}
              {routineType === 'shopping' && (
                <View style={{ borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#F1F5F9', padding: 12, gap: 10 }}>
                  {/* Store + budget row */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Store</Text>
                      <TextInput
                        value={shoppingStore} onChangeText={setShoppingStore}
                        placeholder="e.g. Walmart"
                        placeholderTextColor={colors.textTertiary}
                        style={{ borderRadius: 10, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0',
                          backgroundColor: isDark ? colors.card : '#fff', padding: 9,
                          fontSize: TYPO.label, color: colors.textPrimary }}
                      />
                    </View>
                    <View style={{ width: 90 }}>
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Budget $</Text>
                      <TextInput
                        value={shoppingBudget} onChangeText={setShoppingBudget}
                        placeholder="optional" keyboardType="decimal-pad"
                        placeholderTextColor={colors.textTertiary}
                        style={{ borderRadius: 10, borderWidth: 1.5, borderColor: isDark ? colors.border : '#E2E8F0',
                          backgroundColor: isDark ? colors.card : '#fff', padding: 9,
                          fontSize: TYPO.label, color: colors.textPrimary, textAlign: 'right' }}
                      />
                    </View>
                  </View>

                  {/* Item list — collapsible */}
                  <Pressable onPress={() => setShoppingItemsOpen(o => !o)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      Shopping List {shoppingLines.filter(Boolean).length > 0 ? `(${shoppingLines.filter(Boolean).length})` : ''}
                    </Text>
                    <Text style={{ fontSize: 13, color: BRAND.teal, fontWeight: '700' }}>
                      {shoppingItemsOpen ? '▲ hide' : '▼ add items'}
                    </Text>
                  </Pressable>

                  {shoppingItemsOpen && (
                    <>
                      {shoppingLines.map((line, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 14, color: BRAND.teal }}>•</Text>
                          <TextInput
                            value={line}
                            onChangeText={v => updateShoppingLine(i, v)}
                            placeholder={`Item ${i + 1}…`}
                            placeholderTextColor={colors.textTertiary}
                            style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#E2E8F0',
                              paddingVertical: 7, fontSize: TYPO.label, color: colors.textPrimary }}
                            returnKeyType="next"
                            onSubmitEditing={addShoppingLine}
                          />
                          {shoppingLines.length > 1 && (
                            <Pressable onPress={() => removeShoppingLine(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={{ fontSize: 16, color: colors.textTertiary }}>✕</Text>
                            </Pressable>
                          )}
                        </View>
                      ))}
                      <Pressable onPress={addShoppingLine}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 14, color: BRAND.teal, fontWeight: '800' }}>+ Add item</Text>
                      </Pressable>
                    </>
                  )}

                  <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>
                    📸 Receipt photo will be required on submission
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </>
  );
}
