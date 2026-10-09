import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Meal } from './types';

const MEAL_SLOTS = [
  { type: 'breakfast', label: 'Breakfast', icon: '🍳' },
  { type: 'lunch',     label: 'Lunch',     icon: '☀️' },
  { type: 'dinner',    label: 'Dinner',    icon: '🌙' },
] as const;

function fmtDayHeading(day: string): string {
  // day is 'Mon', 'Tue' etc. — convert to "Monday · 5 Oct" style
  const DAY_FULL: Record<string, string> = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
    Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  };
  const DAY_IDX: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const today = new Date();
  const todayIdx = today.getDay();
  const targetIdx = DAY_IDX[day] ?? 1;
  const diff = ((targetIdx - (todayIdx === 0 ? 6 : todayIdx - 1) + 7) % 7);
  const d = new Date(today);
  d.setDate(today.getDate() + diff - (todayIdx === 0 ? 6 : todayIdx - 1) + (targetIdx === 0 ? 6 : targetIdx - 1));

  // Simpler: find the date of this day in the current week (Mon=start)
  const monday = new Date(today);
  const mDiff = (today.getDay() + 6) % 7; // days since monday
  monday.setDate(today.getDate() - mDiff);
  const dayOffset = DAY_IDX[day] === 0 ? 6 : (DAY_IDX[day] ?? 1) - 1;
  const date = new Date(monday);
  date.setDate(monday.getDate() + dayOffset);

  const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  return `${DAY_FULL[day] ?? day} · ${dateStr}`;
}

export default function DayCard({ day, meals, onRecipe, onEdit, onDelete, onAdd, colors, isDark }: {
  day: string; meals: Meal[];
  onRecipe: (m: Meal) => void; onEdit?: (m: Meal) => void; onDelete?: (m: Meal) => void; onAdd?: () => void;
  colors: any; isDark: boolean;
}) {
  const todayShort = new Date().toLocaleDateString('en-US', { weekday: 'short' });
  const isToday = todayShort === day;

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
          const isLast = idx === MEAL_SLOTS.length - 1;
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
                  {/* Slot label */}
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                    {label}
                  </Text>

                  {meal ? (
                    <>
                      {/* Meal details */}
                      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }} numberOfLines={1}>
                        {[
                          meal.title,
                          meal.start_time,
                          meal.chef_id ? '·' : null,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                      {/* Action link */}
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
      </View>
    </View>
  );
}
