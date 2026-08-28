import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Modal,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { X } from 'lucide-react-native';
import { MEAL_TYPES, MEAL_EMOJIS, DIETARY_OPTIONS, MEAL_TYPE_COLOR } from './types';
import { em } from './styles';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// ─── Add Meal Sheet ─────────────────────────────────────────────────────────

export default function AddMealSheet({
  colors, isDark,
  addDay, addTitle, setAddTitle, addType, setAddType, addEmoji, setAddEmoji,
  addChefId, setAddChefId, addPrepMins, setAddPrepMins,
  addDietTags, setAddDietTags, addIngredients, setAddIngredients,
  addPrepSteps, setAddPrepSteps, addShowEmoji, setAddShowEmoji,
  members, resetAddForm, addManualMeal,
}: {
  colors: any; isDark: boolean;
  addDay: string | null;
  addTitle: string; setAddTitle: (v: string) => void;
  addType: string; setAddType: (v: string) => void;
  addEmoji: string; setAddEmoji: (v: string) => void;
  addChefId: string; setAddChefId: (v: string) => void;
  addPrepMins: string; setAddPrepMins: (v: string) => void;
  addDietTags: string[]; setAddDietTags: React.Dispatch<React.SetStateAction<string[]>>;
  addIngredients: string; setAddIngredients: (v: string) => void;
  addPrepSteps: string; setAddPrepSteps: (v: string) => void;
  addShowEmoji: boolean; setAddShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  members: any[];
  resetAddForm: () => void;
  addManualMeal: () => void;
}) {
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  return (
    <Modal visible={!!addDay} transparent animationType="slide" onRequestClose={resetAddForm}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={resetAddForm} />
          <View style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
            paddingHorizontal: 20, paddingTop: 12, maxHeight: keyboardAwareMaxHeight ?? '90%',
            backgroundColor: isDark ? colors.card : '#FAFAFA' }}>

            {/* Drag handle */}
            <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border,
              alignSelf: 'center', marginBottom: 14 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity onPress={() => setAddShowEmoji(v => !v)}
                  style={{ width: 46, height: 46, borderRadius: 14,
                    backgroundColor: (MEAL_TYPE_COLOR[addType] ?? colors.amber) + '20',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: (MEAL_TYPE_COLOR[addType] ?? colors.amber) + '40' }}>
                  <Text style={{ fontSize: 26 }}>{addEmoji}</Text>
                </TouchableOpacity>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: colors.textPrimary }}>
                    Add Meal — {addDay}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700',
                    color: MEAL_TYPE_COLOR[addType] ?? colors.amber,
                    textTransform: 'capitalize', marginTop: 1 }}>
                    {addType} · tap emoji to change
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={resetAddForm}
                style={{ padding: 8, borderRadius: 20, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable body */}
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}>

              {/* Emoji picker */}
              {addShowEmoji && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderRadius: 16,
                  backgroundColor: isDark ? colors.surface : '#F0EEFF',
                  borderWidth: 1, borderColor: colors.accent + '30', marginBottom: 12 }}>
                  {MEAL_EMOJIS.map(e => (
                    <TouchableOpacity key={e} onPress={() => { setAddEmoji(e); setAddShowEmoji(false); }}
                      style={{ width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: addEmoji === e ? colors.accent + '25' : 'transparent' }}>
                      <Text style={{ fontSize: 24 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Meal name */}
              <Text style={em.label}>Meal Name</Text>
              <TextInput value={addTitle} onChangeText={setAddTitle}
                placeholder="e.g. Grilled Chicken & Veggies"
                placeholderTextColor={colors.textTertiary} autoFocus
                style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, fontWeight: '600',
                  marginBottom: 10, backgroundColor: isDark ? colors.surface : colors.background,
                  borderColor: colors.border, color: colors.textPrimary }} />

              {/* Meal type */}
              <Text style={em.label}>Meal Type</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {MEAL_TYPES.map(t => {
                  const tc = MEAL_TYPE_COLOR[t.toLowerCase()] ?? colors.amber;
                  const sel = addType === t.toLowerCase();
                  return (
                    <TouchableOpacity key={t} onPress={() => setAddType(t.toLowerCase())}
                      style={{ flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 9,
                        alignItems: 'center', gap: 2,
                        backgroundColor: sel ? tc + '18' : 'transparent',
                        borderColor: sel ? tc : colors.border }}>
                      <Text style={{ fontSize: 14 }}>
                        {t === 'Breakfast' ? '🌅' : t === 'Lunch' ? '☀️' : t === 'Dinner' ? '🌙' : '🍎'}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: sel ? tc : colors.textSecondary }}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Chef + prep time */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={em.label}>Who's Cooking</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => setAddChefId('')}
                        style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                          backgroundColor: !addChefId ? colors.teal + '20' : 'transparent',
                          borderColor: !addChefId ? colors.teal : colors.border }}>
                        <Text style={{ fontSize: 12, fontWeight: '800',
                          color: !addChefId ? colors.teal : colors.textSecondary }}>Anyone</Text>
                      </TouchableOpacity>
                      {members.map(m => {
                        const sel = addChefId === m.id;
                        const initials = (m.name as string).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                        const hue = (m.name as string).charCodeAt(0) % 360;
                        const avatarBg = `hsl(${hue},60%,55%)`;
                        return (
                          <TouchableOpacity key={m.id} onPress={() => setAddChefId(m.id)}
                            style={{ alignItems: 'center', gap: 3 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18,
                              backgroundColor: avatarBg,
                              borderWidth: 2.5, borderColor: sel ? colors.teal : 'transparent',
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{initials}</Text>
                            </View>
                            <Text style={{ fontSize: 9, fontWeight: '700',
                              color: sel ? colors.teal : colors.textTertiary }}>
                              {(m.name as string).split(' ')[0]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={em.label}>Prep Time</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 9,
                    backgroundColor: isDark ? colors.surface : colors.background,
                    borderColor: colors.border, marginBottom: 10 }}>
                    <TextInput value={addPrepMins} onChangeText={setAddPrepMins} placeholder="30"
                      placeholderTextColor={colors.textTertiary} keyboardType="numeric"
                      style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary }} />
                    <Text style={{ fontSize: 11, color: colors.textTertiary, fontWeight: '700' }}>min</Text>
                  </View>
                </View>
              </View>

              {/* Dietary tags */}
              <Text style={em.label}>Dietary Tags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                {DIETARY_OPTIONS.map(tag => {
                  const sel = addDietTags.includes(tag);
                  return (
                    <TouchableOpacity key={tag}
                      onPress={() => setAddDietTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5,
                        backgroundColor: sel ? colors.teal + '22' : 'transparent',
                        borderColor: sel ? colors.teal : colors.border }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: sel ? colors.teal : colors.textSecondary }}>{tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Ingredients */}
              <Text style={em.label}>Ingredients (one per line)</Text>
              <TextInput value={addIngredients} onChangeText={setAddIngredients}
                placeholder={'chicken breast\nquinoa\nlemon\nolive oil'}
                placeholderTextColor={colors.textTertiary} multiline numberOfLines={4}
                style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
                  marginBottom: 10, height: 100, textAlignVertical: 'top',
                  backgroundColor: isDark ? colors.surface : colors.background,
                  borderColor: colors.border, color: colors.textPrimary }} />

              {/* Steps */}
              <Text style={em.label}>Steps (one per line)</Text>
              <TextInput value={addPrepSteps} onChangeText={setAddPrepSteps}
                placeholder={'Season chicken\nBoil quinoa 15 min\nGrill 6 min each side'}
                placeholderTextColor={colors.textTertiary} multiline numberOfLines={5}
                style={{ borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13,
                  marginBottom: 10, height: 120, textAlignVertical: 'top',
                  backgroundColor: isDark ? colors.surface : colors.background,
                  borderColor: colors.border, color: colors.textPrimary }} />

            </ScrollView>

            {/* Footer */}
            <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 16,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={resetAddForm}
                style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 14,
                  alignItems: 'center', borderColor: colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addManualMeal} disabled={!addTitle.trim()}
                style={{ flex: 2, borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: colors.accent, opacity: addTitle.trim() ? 1 : 0.4 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Add Meal</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
