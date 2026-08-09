import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

import { GROOM_TYPES_BY_SPECIES, GROOM_TYPES_DEFAULT, GROOM_PRESETS, GROOM_DEFAULTS } from '@/lib/groomTypes';
import { TYPO } from '@/constants/theme';


export const GroomScheduleStep = React.memo(function GroomScheduleStep({
  petName, species, accentColor, onFinish, onSkip,
}: {
  petName: string; species: string; accentColor: string;
  onFinish: (schedule: Record<string, number>) => void;
  onSkip: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const types = GROOM_TYPES_BY_SPECIES[species] ?? GROOM_TYPES_DEFAULT;

  const [schedule, setSchedule] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const t of types) init[t.key] = GROOM_DEFAULTS[t.key] ?? 14;
    return init;
  });

  const [customModal, setCustomModal] = useState<{ key: string; value: string } | null>(null);

  const pick = (key: string, days: number) =>
    setSchedule(prev => ({ ...prev, [key]: days }));

  const saveCustom = () => {
    if (customModal) {
      const days = parseInt(customModal.value, 10);
      if (days > 0) {
        pick(customModal.key, days);
      }
      setCustomModal(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16 }}>

        <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 6 }}>
          Set {petName || 'their'} care schedule 📅
        </Text>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 }}>
          We use these to send you timely reminders so you never miss a grooming session.
        </Text>

        <View style={[gs.callout, { backgroundColor: accentColor + '14', borderColor: accentColor + '40' }]}>
          <Text style={{ fontSize: TYPO.heading }}>🔔</Text>
          <View style={{ flex: 1 }}>
            <Text style={[gs.calloutTitle, { color: accentColor }]}>Why this matters</Text>
            <Text style={[gs.calloutBody, { color: colors.textSecondary }]}>
              Regular grooming prevents skin issues, infections, and discomfort.
              Your schedule powers the smart reminders on the Today dashboard.
            </Text>
          </View>
        </View>

        {types.map((t, idx) => {
          const presets = GROOM_PRESETS[t.key] ?? GROOM_PRESETS.bath;
          const current = schedule[t.key];
          return (
            <View
              key={t.key}
              style={[gs.typeCard, { backgroundColor: colors.card, borderColor: colors.border }, idx > 0 && { marginTop: 10 }]}>
              <View style={gs.typeHeader}>
                <Text style={{ fontSize: TYPO.title }}>{t.emoji}</Text>
                <Text style={[gs.typeLabel, { color: colors.textPrimary }]}>{t.label}</Text>
                <Text style={[gs.typeFreq, { color: accentColor }]}>
                  every {current === 1 ? 'day' : `${current}d`}
                </Text>
              </View>
              <View style={gs.presetRow}>
                {presets.map(p => {
                  const sel = current === p.days;
                  return (
                    <TouchableOpacity
                      key={p.days}
                      onPress={() => pick(t.key, p.days)}
                      activeOpacity={0.75}
                      style={[gs.presetChip, {
                        backgroundColor: sel ? accentColor : colors.inputBg,
                        borderColor: sel ? accentColor : colors.border,
                        borderWidth: sel ? 1.5 : StyleSheet.hairlineWidth,
                      }]}>
                      <Text style={[gs.presetLabel, { color: sel ? '#fff' : colors.textSecondary, fontWeight: sel ? '700' : '500' }]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {!presets.some(p => p.days === current) && (
                  <TouchableOpacity
                    onPress={() => setCustomModal({ key: t.key, value: String(current) })}
                    activeOpacity={0.75}
                    style={[gs.presetChip, {
                      backgroundColor: accentColor,
                      borderColor: accentColor,
                      borderWidth: 1.5,
                    }]}>
                    <Text style={[gs.presetLabel, { color: '#fff', fontWeight: '700' }]}>
                      Every {current === 1 ? 'day' : `${current}d`}
                    </Text>
                  </TouchableOpacity>
                )}
                {presets.some(p => p.days === current) && (
                  <TouchableOpacity
                    onPress={() => setCustomModal({ key: t.key, value: String(current) })}
                    activeOpacity={0.75}
                    style={[gs.presetChip, {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.border,
                      borderWidth: StyleSheet.hairlineWidth,
                    }]}>
                    <Text style={[gs.presetLabel, { color: colors.textSecondary, fontWeight: '500' }]}>
                      Custom
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        <Text style={[gs.footerNote, { color: colors.textSecondary }]}>
          You can always adjust these in the Care settings later.
        </Text>
      </ScrollView>

      <Modal visible={!!customModal} transparent animationType="none" onRequestClose={() => setCustomModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: '100%' }}>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 }}>
              Custom schedule
            </Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 16 }}>
              Enter how many days between grooming sessions:
            </Text>
            <TextInput
              placeholder="e.g., 5"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              value={customModal?.value ?? ''}
              onChangeText={(text) => customModal && setCustomModal({ ...customModal, value: text })}
              style={{ fontSize: TYPO.subheading, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.textPrimary, marginBottom: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setCustomModal(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveCustom}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: accentColor, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: colors.background }}>
        <TouchableOpacity
          style={[gs.continueBtn, { backgroundColor: accentColor }]}
          onPress={() => { console.log('[GroomScheduleStep] Save tapped, schedule:', JSON.stringify(schedule)); onFinish(schedule); }}
          activeOpacity={0.87}>
          <Text style={gs.continueBtnText}>Save my schedule →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const gs = StyleSheet.create({
  callout:      { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20, alignItems: 'flex-start' },
  calloutTitle: { fontSize: TYPO.body, fontWeight: '700', marginBottom: 3 },
  calloutBody:  { fontSize: TYPO.caption, lineHeight: 18 },
  typeCard:     { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  typeHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  typeLabel:    { fontSize: TYPO.body, fontWeight: '700', flex: 1 },
  typeFreq:     { fontSize: TYPO.caption, fontWeight: '600' },
  presetRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  presetLabel:  { fontSize: TYPO.caption },
  footerNote:   { fontSize: TYPO.caption, textAlign: 'center', marginTop: 18, lineHeight: 17 },
  continueBtn:  { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  continueBtnText: { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },
});
