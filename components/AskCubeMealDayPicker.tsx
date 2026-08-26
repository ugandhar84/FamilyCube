/**
 * AskCubeMealDayPicker — confirms which date/meal slot a proposed meal goes
 * into before it's actually written to the weekly plan. The AI's guess
 * (from "tonight"/"Tuesday dinner" etc) is preselected as the nearest
 * matching upcoming date, but the user picks explicitly — including any
 * future date via the native calendar picker, not just the current week.
 */
import { useState, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { localDateStr } from '@/lib/dates';

// MealsTab.tsx keys its day grouping/rendering off 3-letter abbreviations
// (its own DAYS constant), NOT full weekday names.
const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // Date.getDay() order
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

// The AI's guessed day may arrive as a full name ("Wednesday") or already
// abbreviated ("Wed") — resolve either to the NEXT real calendar date that
// falls on that weekday (today counts if it matches), so "Wednesday" always
// preselects a concrete, addable date instead of an ambiguous label.
function resolveInitialDate(day?: string): Date {
  if (!day) return new Date();
  const target = DAY_ABBRS.findIndex(d => d.toLowerCase() === day.slice(0, 3).toLowerCase());
  if (target === -1) return new Date();
  const d = new Date();
  const diff = (target - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function weekOfMonday(d: Date): string {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // Mon=0..Sun=6 offset back to Monday
  return localDateStr(monday);
}

export default function AskCubeMealDayPicker({
  visible, initialDay, initialMealType, existingMealTitle, onCancel, onConfirm,
}: {
  visible: boolean;
  initialDay?: string;
  initialMealType?: string;
  // Title of whatever's already planned for the chosen date/type slot, if
  // anything — drives the replace-confirmation step. Receives the resolved
  // week_of + day abbreviation so the caller can look up the right week.
  existingMealTitle?: (weekOf: string, day: string, mealType: string) => string | null;
  onCancel: () => void;
  onConfirm: (weekOf: string, day: string, mealType: string, date: Date) => void;
}) {
  const { colors } = useTheme();
  const accent = colors.danger;

  const [date, setDate] = useState(() => resolveInitialDate(initialDay));
  const [mealType, setMealType] = useState(initialMealType ?? 'Dinner');
  const [showCalendar, setShowCalendar] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDate(resolveInitialDate(initialDay));
      setMealType(initialMealType ?? 'Dinner');
      setShowCalendar(false);
      setConfirmingReplace(null);
    }
  }, [visible, initialDay, initialMealType]);

  const dayAbbr = DAY_ABBRS[date.getDay()];
  const weekOf = weekOfMonday(date);

  // Pre-warm the existing-meals cache for whichever week is currently
  // selected, so the replace-confirmation check in attemptConfirm has data
  // ready by the time the user taps Confirm rather than racing a fresh load.
  useEffect(() => {
    if (visible) existingMealTitle?.(weekOf, dayAbbr, mealType);
  }, [visible, weekOf, dayAbbr, mealType]);
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const attemptConfirm = () => {
    const existing = existingMealTitle?.(weekOf, dayAbbr, mealType);
    if (existing) { setConfirmingReplace(existing); return; }
    onConfirm(weekOf, dayAbbr, mealType, date);
  };

  // Was a second nested <Modal> rendered inside AskCubeChat's own outer
  // Modal — on iOS, RN's Modal presents its own native view controller, and
  // stacking a second one inside an already-presented Modal is unreliable:
  // it can silently fail to appear depending on timing (right after the
  // parent modal's presentation animation, or triggered in the same render
  // pass), which is exactly "sometimes shows, sometimes doesn't" rather
  // than a deterministic bug in when it's triggered. This is already
  // structured as a full-screen absolute overlay, so a plain View (gated
  // on `visible`) positioned within the SAME outer Modal is both correct
  // and reliable — no native modal-stacking involved.
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onCancel} />
        <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 18, gap: 14 }}>
          {confirmingReplace ? (
            <>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>Replace existing meal?</Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, lineHeight: 19 }}>
                {dateLabel} {mealType.toLowerCase()} already has <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{confirmingReplace}</Text> planned.
                Adding this will replace it.
              </Text>
              <Pressable onPress={() => onConfirm(weekOf, dayAbbr, mealType, date)}
                style={{ marginTop: 4, borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: colors.danger }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Replace It</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmingReplace(null)} style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Back</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>Add to which day?</Text>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Date</Text>
                <Pressable onPress={() => setShowCalendar(v => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10,
                    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface,
                    borderWidth: 1, borderColor: showCalendar ? accent : colors.border }}>
                  <Calendar size={16} color={accent} />
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{dateLabel}</Text>
                </Pressable>
                {showCalendar && (
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="spinner"
                    minimumDate={new Date()}
                    onChange={(_, selected) => { if (selected) setDate(selected); }}
                    textColor={colors.textPrimary}
                    style={{ height: 170, width: '100%' }}
                  />
                )}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Meal</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {MEAL_TYPES.map(mt => {
                    const selected = mt === mealType;
                    return (
                      <Pressable key={mt} onPress={() => setMealType(mt)}
                        style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                          backgroundColor: selected ? accent : colors.surface,
                          borderWidth: 1, borderColor: selected ? accent : colors.border }}>
                        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: selected ? '#fff' : colors.textSecondary }}>{mt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable onPress={attemptConfirm}
                style={{ marginTop: 4, borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: accent }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#fff' }}>Confirm & Add</Text>
              </Pressable>
              <Pressable onPress={onCancel} style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
