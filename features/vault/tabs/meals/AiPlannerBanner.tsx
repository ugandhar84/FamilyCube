import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Animated } from 'react-native';
import { ChefHat, Sparkles, ChevronDown, ChevronUp } from 'lucide-react-native';
import { BRAND } from '../shared';

// ─── CubeAI Planner Banner (flat) ──────────────────────────────────────────────

export default function AiPlannerBanner({
  colors, isDark, aiOpen, setAiOpen, pulseOpacity, pulseScale,
  aiPref, setAiPref, aiLoading, aiError, generateMealPlan,
}: {
  colors: any; isDark: boolean;
  aiOpen: boolean; setAiOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pulseOpacity: Animated.Value; pulseScale: Animated.Value;
  aiPref: string; setAiPref: (v: string) => void;
  aiLoading: boolean; aiError: string | null;
  generateMealPlan: () => void;
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      {/* Header row */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => setAiOpen(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
        <View style={{ width: 28, height: 28 }}>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: BRAND.purple + '18', alignItems: 'center', justifyContent: 'center' }}>
            <ChefHat size={15} color={BRAND.purple} />
          </View>
          <View style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND.emerald, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }} />
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.emerald }} />
          </View>
        </View>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          CubeAI Meal Planner
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple }}>{aiOpen ? 'Collapse' : 'Open'}</Text>
          {aiOpen ? <ChevronUp size={14} color={BRAND.purple} /> : <ChevronDown size={14} color={BRAND.purple} />}
        </View>
      </TouchableOpacity>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />

      <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: aiOpen ? 12 : 0 }}>
        Generate a full week plan with recipes
      </Text>

      {/* Expanded body */}
      {aiOpen && (
        <View style={{ gap: 12 }}>
          {/* Quick chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['Kid-friendly', 'Vegetarian', 'High-protein', 'Under 20 min', 'Healthy', 'Weekend BBQ'].map(chip => (
                <TouchableOpacity key={chip} onPress={() => setAiPref(chip)}
                  style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                    backgroundColor: aiPref === chip ? BRAND.purple + '22' : BRAND.purple + '10',
                    borderWidth: 1, borderColor: aiPref === chip ? BRAND.purple + '70' : BRAND.purple + '25' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND.purple }}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Input + send */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: isDark ? colors.surface : colors.background, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
            <TextInput
              value={aiPref} onChangeText={setAiPref}
              placeholder="e.g. Kid-friendly, high-protein, 30 min max…"
              placeholderTextColor={colors.textTertiary}
              style={{ flex: 1, fontSize: 13, color: colors.textPrimary, minHeight: 22 }}
              multiline onSubmitEditing={generateMealPlan}
            />
            <TouchableOpacity onPress={generateMealPlan} disabled={aiLoading || !aiPref.trim()}
              style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: BRAND.purple, alignItems: 'center', justifyContent: 'center', opacity: aiPref.trim() ? 1 : 0.35 }}>
              {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Sparkles size={15} color="#fff" />}
            </TouchableOpacity>
          </View>

          {aiError && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.danger + '35', backgroundColor: colors.danger + '12', padding: 12 }}>
              <Text style={{ fontSize: 12, color: colors.danger }}>{aiError}</Text>
              <TouchableOpacity onPress={generateMealPlan} style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.danger, textDecorationLine: 'underline' }}>Try again →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
