import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

// ─── DECLINE PRESETS ──────────────────────────────────────────────────────────
const DECLINE_PRESETS = [
  'The chore wasn\'t done properly — please redo it',
  'Photo proof is missing or unclear',
  'You didn\'t complete all the steps',
  'Please try again before tonight',
];

// ─── Decline Modal ─────────────────────────────────────────────────────────────
export function DeclineModal({ visible, questTitle, onConfirm, onCancel, colors, isDark }: {
  visible: boolean; questTitle: string;
  onConfirm: (reason: string) => void; onCancel: () => void;
  colors: any; isDark: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom]     = useState('');
  const finalReason = custom.trim() || selected;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={dm.backdrop}>
        <View style={[dm.sheet, { backgroundColor: colors.card }]}>
          <View style={[dm.handle, { backgroundColor: colors.border }]} />
          <Text style={[dm.title, { color: colors.textPrimary }]}>Decline Quest</Text>
          <Text style={[dm.sub, { color: colors.textSecondary }]} numberOfLines={1}>"{questTitle}"</Text>

          <Text style={[dm.label, { color: colors.textSecondary }]}>Select a reason:</Text>
          {DECLINE_PRESETS.map(r => (
            <TouchableOpacity
              key={r}
              style={[dm.preset, { borderColor: selected === r ? '#EF4444' : colors.border, backgroundColor: selected === r ? '#FEE2E230' : 'transparent' }]}
              onPress={() => { setSelected(r); setCustom(''); }}
            >
              <Text style={[dm.presetText, { color: selected === r ? '#EF4444' : colors.textSecondary }]}>{r}</Text>
            </TouchableOpacity>
          ))}

          <Text style={[dm.label, { color: colors.textSecondary, marginTop: 8 }]}>Or write your own:</Text>
          <TextInput
            style={[dm.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Explain to the kid why you're declining..."
            placeholderTextColor={colors.textTertiary}
            value={custom}
            onChangeText={t => { setCustom(t.slice(0, 200)); setSelected(''); }}
            multiline maxLength={200}
          />
          <Text style={[dm.charCount, { color: colors.textTertiary }]}>{custom.length}/200</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[dm.btn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={onCancel}>
              <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: TYPO.caption }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dm.btn, { flex: 2, backgroundColor: finalReason ? '#EF4444' : colors.border }]}
              onPress={() => finalReason && onConfirm(finalReason)}
              disabled={!finalReason}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: TYPO.caption }}>Decline Quest</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const dm = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:       { fontSize: TYPO.subheading, fontWeight: '900', marginBottom: 2 },
  sub:         { fontSize: TYPO.caption, marginBottom: 14 },
  label:       { fontSize: TYPO.caption, fontWeight: '700', marginBottom: 6 },
  preset:      { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 7 },
  presetText:  { fontSize: TYPO.body, fontWeight: '600' },
  input:       { borderWidth: 1.5, borderRadius: 14, padding: 13, fontSize: TYPO.body, minHeight: 64, marginTop: 4 },
  charCount:   { fontSize: TYPO.label, textAlign: 'right', marginTop: 2 },
  btn:         { borderRadius: 14, padding: 13, alignItems: 'center' },
});
