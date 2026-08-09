import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

const CONCERNS_BY_SPECIES: Record<string, { key: string; emoji: string; label: string }[]> = {
  dog: [
    { key: 'stomach',   emoji: '🤢', label: 'Stomach issues' },
    { key: 'skin',      emoji: '🩹', label: 'Skin & coat' },
    { key: 'anxiety',   emoji: '😰', label: 'Anxiety / stress' },
    { key: 'weight',    emoji: '⚖️', label: 'Weight management' },
    { key: 'dental',    emoji: '🦷', label: 'Dental health' },
    { key: 'joints',    emoji: '🦴', label: 'Joints & mobility' },
    { key: 'ear',       emoji: '👂', label: 'Ear infections' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  cat: [
    { key: 'stomach',   emoji: '🤢', label: 'Stomach issues' },
    { key: 'urinary',   emoji: '💧', label: 'Urinary health' },
    { key: 'anxiety',   emoji: '😰', label: 'Anxiety / stress' },
    { key: 'dental',    emoji: '🦷', label: 'Dental health' },
    { key: 'hairball',  emoji: '🧶', label: 'Hairballs' },
    { key: 'eyes',      emoji: '👁️', label: 'Eye health' },
    { key: 'weight',    emoji: '⚖️', label: 'Weight management' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  rabbit: [
    { key: 'stomach',   emoji: '🤢', label: 'GI stasis' },
    { key: 'teeth',     emoji: '🦷', label: 'Teeth overgrowth' },
    { key: 'skin',      emoji: '🩹', label: 'Skin issues' },
    { key: 'anxiety',   emoji: '😰', label: 'Anxiety / stress' },
    { key: 'weight',    emoji: '⚖️', label: 'Weight management' },
    { key: 'eye',       emoji: '👁️', label: 'Eye infections' },
    { key: 'ears',      emoji: '👂', label: 'Ear mites' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  horse: [
    { key: 'hoof',      emoji: '🐴', label: 'Hoof health' },
    { key: 'colic',     emoji: '🤢', label: 'Colic / digestion' },
    { key: 'lameness',  emoji: '🦵', label: 'Lameness / joints' },
    { key: 'teeth',     emoji: '🦷', label: 'Dental care' },
    { key: 'coat',      emoji: '🩹', label: 'Coat & skin' },
    { key: 'behavior',  emoji: '😰', label: 'Behavior / training' },
    { key: 'weight',    emoji: '⚖️', label: 'Weight management' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  bird: [
    { key: 'respiratory', emoji: '💨', label: 'Respiratory health' },
    { key: 'feather',   emoji: '🧶', label: 'Feather plucking' },
    { key: 'wing',      emoji: '🦅', label: 'Wing & flight health' },
    { key: 'behavior',  emoji: '😰', label: 'Behavior / stress' },
    { key: 'digestion', emoji: '🤢', label: 'Digestion issues' },
    { key: 'beak',      emoji: '🐦', label: 'Beak health' },
    { key: 'eyes',      emoji: '👁️', label: 'Eye health' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  fish: [
    { key: 'water',     emoji: '💧', label: 'Water quality' },
    { key: 'fin',       emoji: '🐠', label: 'Fin rot / damage' },
    { key: 'parasites', emoji: '🦠', label: 'Parasites' },
    { key: 'algae',     emoji: '🌿', label: 'Algae control' },
    { key: 'filter',    emoji: '💨', label: 'Filter maintenance' },
    { key: 'tank',      emoji: '🏠', label: 'Tank setup' },
    { key: 'feeding',   emoji: '🍽️', label: 'Feeding schedule' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  hamster: [
    { key: 'stomach',   emoji: '🤢', label: 'Stomach issues' },
    { key: 'teeth',     emoji: '🦷', label: 'Teeth overgrowth' },
    { key: 'skin',      emoji: '🩹', label: 'Skin & fur' },
    { key: 'eye',       emoji: '👁️', label: 'Eye infections' },
    { key: 'cage',      emoji: '🏠', label: 'Cage setup' },
    { key: 'activity',  emoji: '⚡', label: 'Activity & enrichment' },
    { key: 'weight',    emoji: '⚖️', label: 'Weight issues' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  turtle: [
    { key: 'shell',     emoji: '🐢', label: 'Shell health' },
    { key: 'basking',   emoji: '☀️', label: 'Basking spot setup' },
    { key: 'water',     emoji: '💧', label: 'Water quality' },
    { key: 'feeding',   emoji: '🍽️', label: 'Feeding / nutrition' },
    { key: 'uvb',       emoji: '💡', label: 'UVB lighting' },
    { key: 'parasites', emoji: '🦠', label: 'Parasites' },
    { key: 'temperature', emoji: '🌡️', label: 'Temperature control' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
  other: [
    { key: 'stomach',   emoji: '🤢', label: 'Stomach issues' },
    { key: 'skin',      emoji: '🩹', label: 'Skin & coat' },
    { key: 'anxiety',   emoji: '😰', label: 'Anxiety / stress' },
    { key: 'schedule',  emoji: '🗓️', label: 'Scheduling care' },
    { key: 'weight',    emoji: '⚖️', label: 'Weight management' },
    { key: 'dental',    emoji: '🦷', label: 'Dental health' },
    { key: 'joints',    emoji: '🦴', label: 'Joints & mobility' },
    { key: 'emergency', emoji: '🚨', label: 'Emergency triage' },
  ],
};

export const PetQuizStep = React.memo(function PetQuizStep({
  petName, species = 'dog', accentColor, onFinish, onSkip, btnLabel = 'Continue →',
}: {
  petName: string; species?: string; accentColor: string;
  onFinish: (concerns: string[]) => void;
  onSkip: () => void;
  btnLabel?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const concerns = useMemo(
    () => CONCERNS_BY_SPECIES[species] ?? CONCERNS_BY_SPECIES.other,
    [species]
  );

  const toggle = (key: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 100, paddingTop: 16 }}
      >
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 }}>
            Help us personalise{'\n'}care for {petName || 'your baby'} 🐾
          </Text>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 8, lineHeight: 20 }}>
            Takes 30 seconds · you can always skip
          </Text>
        </View>

        <Text style={[qz.sectionLabel, { color: colors.textSecondary ?? colors.textSecondary }]}>
          ANY HEALTH CONCERNS WE SHOULD KNOW ABOUT?
        </Text>
        <View style={qz.concernGrid}>
          {concerns.map(c => {
            const sel = selected.has(c.key);
            return (
              <TouchableOpacity
                key={c.key}
                style={[qz.concernCard, {
                  backgroundColor: sel ? accentColor + '18' : colors.card,
                  borderColor: sel ? accentColor : colors.border,
                  borderWidth: sel ? 2 : StyleSheet.hairlineWidth,
                }]}
                onPress={() => toggle(c.key)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: TYPO.title }}>{c.emoji}</Text>
                <Text style={[qz.concernLabel, { color: sel ? accentColor : colors.textSecondary }]}>
                  {c.label}
                </Text>
                {sel && (
                  <View style={[qz.checkBadge, { backgroundColor: accentColor }]}>
                    <Ionicons name="checkmark" size={9} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[qz.stickyBottom, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[qz.continueBtn, { backgroundColor: accentColor }]}
          onPress={() => onFinish(Array.from(selected))}
          activeOpacity={0.87}
        >
          <Text style={qz.continueBtnText}>{btnLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkip} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text style={{ fontSize: TYPO.body, color: colors.textSecondary ?? colors.textSecondary }}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const qz = StyleSheet.create({
  sectionLabel:  { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginBottom: 12 },
  concernGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  concernCard:   { width: '47%', borderRadius: 16, padding: 14, gap: 6, position: 'relative' },
  concernLabel:  { fontSize: TYPO.body, fontWeight: '600' },
  checkBadge:    { position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stickyBottom:  { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 10 },
  continueBtn:   { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  continueBtnText: { fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },
});
