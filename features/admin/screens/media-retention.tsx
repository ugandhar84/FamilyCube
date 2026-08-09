import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, TouchableOpacity, Switch,
  StyleSheet, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

type RetentionRow = {
  id: number;
  category: string;
  label: string;
  description: string | null;
  enabled: boolean;
  retain_days: number;
  table_name: string;
  date_column: string;
  updated_at: string;
};

const PRESETS = [30, 60, 90, 180, 365];

export default function MediaRetentionScreen() {
  const { colors, isDark } = useTheme();
  const [rows, setRows]       = useState<RetentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedOnce = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const [saving, setSaving]   = useState(false);
  const [showGoTop, setShowGoTop] = useState(false);
  const [editing, setEditing] = useState<RetentionRow | null>(null);
  const [draftDays, setDraftDays] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent && !loadedOnce.current) setLoading(true);
    const { data, error } = await supabase
      .from('media_retention_config').select('*').order('id');
    if (error) showAlert('Error', error.message);
    setRows((data as RetentionRow[]) ?? []);
    loadedOnce.current = true;
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) load(true);
  }, [load]));

  const toggleEnabled = async (row: RetentionRow) => {
    const next = !row.enabled;
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, enabled: next } : r));
    const { error } = await supabase
      .from('media_retention_config').update({ enabled: next }).eq('id', row.id);
    if (error) {
      showAlert('Error', error.message);
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, enabled: row.enabled } : r));
    }
  };

  const openEdit = (row: RetentionRow) => {
    setEditing(row);
    setDraftDays(String(row.retain_days));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const days = parseInt(draftDays, 10);
    if (!days || days < 1) { showAlert('Invalid', 'Enter a number ≥ 1'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('media_retention_config').update({ retain_days: days }).eq('id', editing.id);
    setSaving(false);
    if (error) { showAlert('Error', error.message); return; }
    setEditing(null);
    load();
  };

  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const inp  = isDark ? '#2A2242' : '#F4F0FF';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      {loading
        ? <View style={{ alignItems: 'center', paddingTop: 64 }}><PawBondLoader size={52} isDark={isDark} /></View>
        : (
          <ScrollView ref={scrollRef} style={{ flex: 1 }} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={{ padding: 16 }}
            onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={16}>
            <Text style={[s.hint, { color: sub }]}>
              Toggle a category off to skip cleanup entirely. Tap the days to edit the window.
            </Text>

            {rows.map((row, i) => (
              <View key={row.id} style={[s.card, { backgroundColor: card, marginBottom: 12 }]}>
                {/* Header row */}
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: colors.textPrimary }]}>{row.label}</Text>
                    <Text style={[s.cat, { color: sub }]}>{row.category}</Text>
                  </View>
                  <Switch
                    value={row.enabled}
                    onValueChange={() => toggleEnabled(row)}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Details */}
                <View style={[s.cardBody, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.bodyLabel, { color: sub }]}>Retention window</Text>
                    <Text style={[s.bodyValue, { color: row.enabled ? colors.textPrimary : sub }]}>
                      {row.retain_days} days
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.bodyLabel, { color: sub }]}>Table</Text>
                    <Text style={[s.bodyValue, { color: sub }]}>{row.table_name}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openEdit(row)}
                    style={[s.editBtn, { borderColor: colors.primary + '60' }]}
                  >
                    <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                    <Text style={[s.editLabel, { color: colors.primary }]}>Edit</Text>
                  </TouchableOpacity>
                </View>

                {row.description
                  ? <Text style={[s.desc, { color: sub, borderTopColor: colors.border }]}>{row.description}</Text>
                  : null}
              </View>
            ))}
          </ScrollView>
        )
      }

      {/* Edit modal */}
      <Modal visible={!!editing} transparent animationType="none" onRequestClose={() => setEditing(null)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={s.backdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={[s.sheet, { backgroundColor: card }]}>
                <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>
                  {editing?.label}
                </Text>
                <Text style={[s.sheetSub, { color: sub }]}>
                  Retain photos for how many days?
                </Text>

                {/* Preset chips */}
                <View style={s.presets}>
                  {PRESETS.map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setDraftDays(String(p))}
                      style={[
                        s.preset,
                        { borderColor: draftDays === String(p) ? colors.primary : colors.border,
                          backgroundColor: draftDays === String(p) ? colors.primary + '18' : 'transparent' },
                      ]}
                    >
                      <Text style={[s.presetText, { color: draftDays === String(p) ? colors.primary : sub }]}>
                        {p}d
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={[s.input, { backgroundColor: inp, color: colors.textPrimary, borderColor: colors.border }]}
                  value={draftDays}
                  onChangeText={setDraftDays}
                  keyboardType="number-pad"
                  placeholder="Custom days"
                  placeholderTextColor={sub}
                />

                <View style={s.sheetFooter}>
                  <TouchableOpacity onPress={() => setEditing(null)} style={[s.btn, { borderColor: colors.border }]}>
                    <Text style={[s.btnText, { color: sub }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveEdit}
                    disabled={saving}
                    style={[s.btn, s.btnPrimary, { backgroundColor: colors.primary }]}
                  >
                    {saving
                      ? <PawBondLoader size={20} bars={false} isDark={false} />
                      : <Text style={[s.btnText, { color: '#fff' }]}>Save</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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

const s = StyleSheet.create({
  hint:       { fontSize: TYPO.body, lineHeight: 18, marginBottom: 16, marginHorizontal: 2 },
  card:       { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 3 },
  cardHead:   { flexDirection: 'row', alignItems: 'center', padding: 16 },
  label:      { fontSize: TYPO.body, fontWeight: '700' },
  cat:        { fontSize: TYPO.body, marginTop: 2 },
  cardBody:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  bodyLabel:  { fontSize: TYPO.body, fontWeight: '600', letterSpacing: 0.4, marginBottom: 2 },
  bodyValue:  { fontSize: TYPO.body, fontWeight: '600' },
  editBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  editLabel:  { fontSize: TYPO.body, fontWeight: '600' },
  desc:       { fontSize: TYPO.body, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  sheetTitle: { fontSize: TYPO.subheading, fontWeight: '700' },
  sheetSub:   { fontSize: TYPO.body, marginTop: -8 },
  presets:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  preset:     { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  presetText: { fontSize: TYPO.body, fontWeight: '600' },
  input:      { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: TYPO.body },
  sheetFooter:{ flexDirection: 'row', gap: 10 },
  btn:        { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { borderWidth: 0 },
  btnText:    { fontSize: TYPO.body, fontWeight: '700' },
});
