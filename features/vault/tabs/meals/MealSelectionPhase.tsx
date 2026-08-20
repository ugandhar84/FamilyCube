import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Check, X, Timer, Star } from 'lucide-react-native';
import { BRAND } from '../shared';
import { AiDayOptions } from './types';

// ─── Meal Selection Phase (flat) ───────────────────────────────────────────────

export default function MealSelectionPhase({
  colors, isDark, pendingOptions, setPendingOptions, selected, setSelected,
  tip, savingPlan, confirmPlan,
}: {
  colors: any; isDark: boolean;
  pendingOptions: AiDayOptions[];
  setPendingOptions: (v: AiDayOptions[] | null) => void;
  selected: Record<string, number[]>;
  setSelected: React.Dispatch<React.SetStateAction<Record<string, number[]>>>;
  tip: string | null;
  savingPlan: boolean;
  confirmPlan: () => void;
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: BRAND.purple + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={15} color={BRAND.purple} />
        </View>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Pick Your Meals
        </Text>
        <TouchableOpacity onPress={() => { setPendingOptions(null); setSelected({}); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />

      <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: -6 }}>Pick up to 2 meals per day, then confirm</Text>

      {tip && (
        <View style={{ borderRadius: 12, backgroundColor: BRAND.teal + '15', borderWidth: 1, borderColor: BRAND.teal + '30', padding: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? BRAND.teal : '#0F766E', lineHeight: 18 }}>💡 {tip}</Text>
        </View>
      )}

      {pendingOptions.map(dayOpt => (
        <View key={dayOpt.day} style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '900', color: BRAND.amber, letterSpacing: 0.5 }}>{dayOpt.day.toUpperCase()}</Text>
          {dayOpt.options.map((opt, idx) => {
            const daySel = selected[dayOpt.day] ?? [0];
            const isSelected = daySel.includes(idx);
            const toggleSelect = () => {
              setSelected(prev => {
                const cur = prev[dayOpt.day] ?? [0];
                if (cur.includes(idx)) {
                  // deselect — keep at least 1
                  const next = cur.filter(i => i !== idx);
                  return { ...prev, [dayOpt.day]: next.length ? next : cur };
                } else if (cur.length < 2) {
                  return { ...prev, [dayOpt.day]: [...cur, idx].sort() };
                }
                return prev; // already 2 selected, ignore
              });
            };
            return (
              <TouchableOpacity key={idx} activeOpacity={0.8} onPress={toggleSelect}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: isSelected ? 1.5 : 1,
                  borderColor: isSelected ? BRAND.purple : colors.border,
                  backgroundColor: isSelected ? BRAND.purple + '10' : 'transparent', padding: 10 }}>
                {/* Checkbox */}
                <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2,
                  borderColor: isSelected ? BRAND.purple : colors.border,
                  backgroundColor: isSelected ? BRAND.purple : 'transparent',
                  alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                </View>
                <Text style={{ fontSize: 18 }}>{opt.emoji ?? '🍽'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>{opt.mealName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Timer size={10} color={BRAND.amber} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.amber }}>{opt.prepMinutes}m</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 1 }}>
                      {Array.from({ length: opt.kidFriendlyRating }).map((_, si) => (
                        <Star key={si} size={9} fill={BRAND.amber} color={BRAND.amber} />
                      ))}
                    </View>
                    {opt.dietaryTags.slice(0, 2).map(tag => (
                      <View key={tag} style={{ borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: BRAND.teal + '20' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: BRAND.teal }}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <TouchableOpacity onPress={confirmPlan} disabled={savingPlan}
        style={{ borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: BRAND.purple, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {savingPlan
          ? <ActivityIndicator size="small" color="#fff" />
          : <><Check size={16} color="#fff" /><Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Confirm Plan</Text></>}
      </TouchableOpacity>
      </View>
    </View>
  );
}
