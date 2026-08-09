import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

interface Props {
  items: { id: string; petName: string; petEmoji: string; emoji: string; label: string }[];
  colors: any;
}

export default function TomorrowPreview({ items, colors }: Props) {
  if (items.length === 0) return null;
  return (
    <View style={[s.section, { paddingTop: 4 }]}>
      <View style={[s.tomorrowCard, { backgroundColor: colors.card ?? colors.background, borderColor: colors.border ?? colors.textSecondary + '30' }]}>
        <Text style={[s.sectionLabel, { color: colors.textSecondary, marginBottom: 8 }]}>📅 Tomorrow</Text>
        {items.map(item => (
          <View key={item.id} style={s.tomorrowRow}>
            <Text style={s.tomorrowEmoji}>{item.petEmoji} {item.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.tomorrowPet, { color: colors.textSecondary }]}>{item.petName}</Text>
              <Text style={[s.tomorrowLabel, { color: colors.textPrimary }]}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section:       { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  sectionLabel:  { fontSize: TYPO.label, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  tomorrowCard:  { borderRadius: 14, borderWidth: 1, padding: 14 },
  tomorrowRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  tomorrowEmoji: { fontSize: TYPO.heading, width: 40, textAlign: 'center' },
  tomorrowPet:   { fontSize: TYPO.label, fontWeight: '600' },
  tomorrowLabel: { fontSize: TYPO.caption, fontWeight: '500' },
});
