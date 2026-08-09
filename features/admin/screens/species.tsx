import { useState, useCallback, useRef } from 'react';
import { View, Text, Switch, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { getSpeciesEnabled, setSpeciesEnabled, SpeciesEnabledMap } from '@/lib/db/admin';
import { showAlert } from '@/components/AppAlert';
import { TYPO } from '@/constants/theme';

const ALL_SPECIES: { value: string; label: string; emoji: string; note?: string }[] = [
  { value: 'dog',     label: 'Dog',     emoji: '🐶' },
  { value: 'cat',     label: 'Cat',     emoji: '🐱' },
  { value: 'rabbit',  label: 'Rabbit',  emoji: '🐰' },
  { value: 'hamster', label: 'Hamster', emoji: '🐹' },
  { value: 'turtle',  label: 'Turtle',  emoji: '🐢' },
  { value: 'bird',    label: 'Bird',    emoji: '🐦', note: 'Coming soon' },
  { value: 'fish',    label: 'Fish',    emoji: '🐠', note: 'Coming soon' },
  { value: 'other',   label: 'Other',   emoji: '🐾' },
];

export default function SpeciesAdminScreen() {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [showGoTop, setShowGoTop] = useState(false);
  const [map, setMap] = useState<SpeciesEnabledMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    getSpeciesEnabled()
      .then(m => setMap(m))
      .catch(() => showAlert('Error', 'Failed to load species config'))
      .finally(() => setLoading(false));
  }, []));

  async function toggle(species: string, value: boolean) {
    const next = { ...map, [species]: value };
    setMap(next);
    setSaving(true);
    try {
      await setSpeciesEnabled(next);
    } catch {
      setMap(map); // rollback
      showAlert('Error', 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const s = styles(colors);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'Species',
        headerRight: () => saving ? <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 16 }} /> : null,
      }} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.content}
          onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}>
          <Text style={s.hint}>
            Disabled species are hidden from the Add Pet screen. Existing pets of that species are unaffected.
          </Text>

          <View style={s.card}>
            {ALL_SPECIES.map((sp, i) => {
              const enabled = map[sp.value] ?? true;
              const isLast = i === ALL_SPECIES.length - 1;
              return (
                <View key={sp.value}>
                  <View style={s.row}>
                    <View style={s.emojiWrap}>
                      <Text style={s.emoji}>{sp.emoji}</Text>
                    </View>
                    <View style={s.labelWrap}>
                      <Text style={s.label}>{sp.label}</Text>
                      {sp.note && <Text style={s.note}>{sp.note}</Text>}
                    </View>
                    <Switch
                      value={enabled}
                      onValueChange={v => toggle(sp.value, v)}
                      trackColor={{ false: colors.border, true: colors.primary + 'AA' }}
                      thumbColor={enabled ? colors.primary : '#ccc'}
                    />
                  </View>
                  {!isLast && <View style={s.divider} />}
                </View>
              );
            })}
          </View>

          <Text style={s.footer}>
            Changes take effect immediately for new app sessions. Users mid-flow may still see cached species until they restart the app.
          </Text>
        </ScrollView>
      )}
      {showGoTop && (
        <TouchableOpacity
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = (c: any) => StyleSheet.create({
  safe:      { flex: 1, backgroundColor: c.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:   { padding: 16, gap: 12 },
  hint:      { fontSize: TYPO.body, color: c.textSecondary, lineHeight: 18, marginBottom: 4 },
  card:      { backgroundColor: c.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  emojiWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.inputBg, alignItems: 'center', justifyContent: 'center' },
  emoji:     { fontSize: TYPO.heading },
  labelWrap: { flex: 1 },
  label:     { fontSize: TYPO.body, fontWeight: '600', color: c.textPrimary },
  note:      { fontSize: TYPO.body, color: c.textSecondary, marginTop: 1 },
  divider:   { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: 64 },
  footer:    { fontSize: TYPO.body, color: c.textSecondary, lineHeight: 17, marginTop: 4 },
});
