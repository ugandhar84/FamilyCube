import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Trash2, BookOpen, Plus, Pencil } from 'lucide-react-native';
import { BRAND } from '../shared';
import { Meal, MEAL_TYPE_COLOR } from './types';
import { dc } from './styles';

// ─── Day Meal Card ────────────────────────────────────────────────────────────

export default function DayCard({ day, meals, onRecipe, onEdit, onDelete, onAdd, colors, isDark }: {
  day: string; meals: Meal[];
  onRecipe: (m: Meal) => void; onEdit: (m: Meal) => void; onDelete?: (m: Meal) => void; onAdd: () => void;
  colors: any; isDark: boolean;
}) {
  const isToday = new Date().toLocaleDateString('en-US', { weekday: 'short' }) === day;
  const accentColor = isToday ? BRAND.purple : BRAND.amber;

  return (
    <View style={{ marginTop: 10 }}>
      {/* Day header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: accentColor, letterSpacing: 0.5 }}>{day}</Text>
          {isToday && (
            <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: BRAND.purple + '20' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: BRAND.purple, letterSpacing: 0.5 }}>TODAY</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onAdd} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 2 }}>
          <Plus size={13} color={accentColor} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Meal rows — plain rows with hairline separators, no nested boxes */}
      {meals.length > 0 && (
        <View>
          {meals.map((meal, idx) => {
            const typeColor = MEAL_TYPE_COLOR[meal.type?.toLowerCase()] ?? BRAND.amber;
            return (
              <View key={meal.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 9,
                borderBottomWidth: idx < meals.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: colors.border,
              }}>
                {/* Emoji bubble */}
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: typeColor + '18',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 22 }}>{meal.emoji ?? '🍽️'}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                    {meal.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: typeColor + '22' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: typeColor, textTransform: 'capitalize' }}>
                        {meal.type}
                      </Text>
                    </View>
                    {meal.prep_minutes ? (
                      <Text style={{ fontSize: 10, color: colors.textTertiary }}>⏱ {meal.prep_minutes}m</Text>
                    ) : null}
                    {meal.ai_generated ? (
                      <Text style={{ fontSize: 10, fontWeight: '700', color: BRAND.purple }}>✨ AI</Text>
                    ) : null}
                  </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  <TouchableOpacity onPress={() => onRecipe(meal)} style={dc.iconBtn}>
                    <BookOpen size={14} color={BRAND.purple} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onEdit(meal)} style={dc.iconBtn}>
                    <Pencil size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {onDelete && (
                    <TouchableOpacity onPress={() => onDelete(meal)} style={dc.iconBtn}>
                      <Trash2 size={14} color={BRAND.rose + 'AA'} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
