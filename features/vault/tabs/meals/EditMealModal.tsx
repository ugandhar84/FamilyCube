import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Modal, KeyboardAvoidingView, Platform, Keyboard, StyleSheet } from 'react-native';
import { Meal, MEAL_TYPES, MEAL_EMOJIS, DIETARY_OPTIONS, MEAL_TYPE_COLOR } from './types';
import { em } from './styles';
import { useKeyboardAwareMaxHeight } from '@/lib/useKeyboardAwareMaxHeight';

// ─── Edit Meal Modal ──────────────────────────────────────────────────────────

export default function EditMealModal({ meal, visible, onClose, onSave, members, colors, isDark }: {
  meal: Meal | null; visible: boolean; onClose: () => void;
  onSave: (id: string, patch: Partial<Meal>) => Promise<void>;
  members: any[]; colors: any; isDark: boolean;
}) {
  const [title,       setTitle]       = useState('');
  const [emoji,       setEmoji]       = useState('🍽️');
  const [type,        setType]        = useState('dinner');
  const [chefId,      setChefId]      = useState('');
  const [prepMins,    setPrepMins]    = useState('');
  const [kidRating,   setKidRating]   = useState(3);
  const [dietTags,    setDietTags]    = useState<string[]>([]);
  const [ingredients, setIngredients] = useState('');
  const [prepSteps,   setPrepSteps]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [showEmoji,   setShowEmoji]   = useState(false);

  useEffect(() => {
    if (meal) {
      setTitle(meal.title ?? '');
      setEmoji(meal.emoji ?? '🍽️');
      setType(meal.type ?? 'dinner');
      setChefId(meal.chef_id ?? '');
      setPrepMins(meal.prep_minutes ? String(meal.prep_minutes) : '');
      setKidRating(meal.kid_friendly_rating ?? 3);
      setDietTags(meal.dietary_tags ?? []);
      setIngredients((meal.ingredients ?? []).join('\n'));
      setPrepSteps((meal.prep_steps ?? []).join('\n'));
    }
  }, [meal]);

  const toggleTag = (tag: string) =>
    setDietTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleSave = async () => {
    if (!meal || !title.trim()) return;
    setSaving(true);
    await onSave(meal.id, {
      title:               title.trim(),
      emoji,
      type,
      chef_id:             chefId || null,
      prep_minutes:        prepMins ? parseInt(prepMins) : null,
      kid_friendly_rating: kidRating,
      dietary_tags:        dietTags,
      ingredients:         ingredients.split('\n').map(s => s.trim()).filter(Boolean),
      prep_steps:          prepSteps.split('\n').map(s => s.trim()).filter(Boolean),
    });
    setSaving(false);
    onClose();
  };

  if (!meal) return null;

  const inp = {
    borderWidth: 1.5, borderRadius: 14, padding: 11, fontSize: 13, fontWeight: '600' as const,
    marginBottom: 10, backgroundColor: isDark ? colors.surface : colors.background,
    borderColor: colors.border, color: colors.textPrimary,
  };
  const typeColor = MEAL_TYPE_COLOR[type] ?? colors.amber;
  const keyboardAwareMaxHeight = useKeyboardAwareMaxHeight(90);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, overflow: 'hidden',
            maxHeight: keyboardAwareMaxHeight ?? '90%', backgroundColor: colors.card,
            borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 8 }}>

            {/* Drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />

            {/* Fixed header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Edit Meal</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{type} · tap emoji to change</Text>
              </View>
            </View>

            <ScrollView keyboardShouldPersistTaps="always" onScrollBeginDrag={Keyboard.dismiss} showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              {/* Emoji picker button */}
              <TouchableOpacity onPress={() => setShowEmoji(!showEmoji)}
                style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: typeColor + '20',
                  alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: typeColor + '40',
                  marginBottom: 14 }}>
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </TouchableOpacity>

              {/* Emoji picker drawer */}
              {showEmoji && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderRadius: 16,
                  backgroundColor: isDark ? colors.surface : '#F0EEFF',
                  borderWidth: 1, borderColor: colors.accent + '30', marginBottom: 12 }}>
                  {MEAL_EMOJIS.map(e => (
                    <TouchableOpacity key={e} onPress={() => { setEmoji(e); setShowEmoji(false); }}
                      style={{ width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: emoji === e ? colors.accent + '25' : 'transparent' }}>
                      <Text style={{ fontSize: 24 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Meal name */}
              <Text style={em.label}>Meal Name</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Salmon & Quinoa Bowl"
                placeholderTextColor={colors.textTertiary} style={[inp, { color: colors.textPrimary }]} />

              {/* Meal type */}
              <Text style={em.label}>Meal Type</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {MEAL_TYPES.map(t => {
                  const tc = MEAL_TYPE_COLOR[t.toLowerCase()] ?? colors.amber;
                  const sel = type === t.toLowerCase();
                  return (
                    <TouchableOpacity key={t} onPress={() => setType(t.toLowerCase())}
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
                      <TouchableOpacity onPress={() => setChefId('')}
                        style={{ borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7,
                          backgroundColor: !chefId ? colors.teal + '20' : 'transparent',
                          borderColor: !chefId ? colors.teal : colors.border }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: !chefId ? colors.teal : colors.textSecondary }}>Anyone</Text>
                      </TouchableOpacity>
                      {members.map(m => {
                        const sel = chefId === m.id;
                        const initials = (m.name as string).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                        const hue = (m.name as string).charCodeAt(0) % 360;
                        const avatarBg = `hsl(${hue},60%,55%)`;
                        return (
                          <TouchableOpacity key={m.id} onPress={() => setChefId(m.id)}
                            style={{ alignItems: 'center', gap: 3 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18,
                              backgroundColor: avatarBg,
                              borderWidth: 2.5, borderColor: sel ? colors.teal : 'transparent',
                              alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{initials}</Text>
                            </View>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: sel ? colors.teal : colors.textTertiary }}>
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
                    <TextInput value={prepMins} onChangeText={setPrepMins} placeholder="30"
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
                  const sel = dietTags.includes(tag);
                  return (
                    <TouchableOpacity key={tag} onPress={() => toggleTag(tag)}
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
              <TextInput value={ingredients} onChangeText={setIngredients}
                placeholder={'chicken breast\nquinoa\nlemon\nolive oil'}
                placeholderTextColor={colors.textTertiary} multiline numberOfLines={4}
                style={[inp, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]} />

              {/* Prep steps */}
              <Text style={em.label}>Steps (one per line)</Text>
              <TextInput value={prepSteps} onChangeText={setPrepSteps}
                placeholder={'Season and marinate chicken\nCook quinoa 15 min\nGrill chicken 6 min each side'}
                placeholderTextColor={colors.textTertiary} multiline numberOfLines={5}
                style={[inp, { height: 120, textAlignVertical: 'top', paddingTop: 10 }]} />
            </ScrollView>

            {/* Fixed footer */}
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <TouchableOpacity onPress={onClose}
                style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 14,
                  alignItems: 'center', borderColor: colors.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={{ flex: 2, borderRadius: 16, paddingVertical: 14, alignItems: 'center',
                  backgroundColor: colors.accent, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff' }}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
