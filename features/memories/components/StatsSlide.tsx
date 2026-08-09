import React from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { YIRData, FILL, YEAR } from '@/features/memories/videoShared';
import type { YIRTemplate } from '@/lib/yirTemplates';

interface Props { data: YIRData; pet: any; t: YIRTemplate; }

export const StatsSlide = React.memo(function StatsSlide({ data, pet, t }: Props) {
  const rows = [
    { icon: '📸', value: data.totalPhotos,    label: 'Photos captured' },
    { icon: '😊', value: data.totalMoods,      label: 'Mood check-ins' },
    { icon: '🏆', value: data.totalMilestones, label: 'Milestones hit' },
    ...(data.daysTogetherThisYear > 0
      ? [{ icon: '🐾', value: data.daysTogetherThisYear, label: 'Days together this year' }]
      : []),
  ];
  return (
    <LinearGradient colors={[...t.bg]} style={[FILL, s.slidePad]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text style={s.slideTitle}>{pet?.name ?? 'Your pet'}'s {YEAR}</Text>
      <Text style={[s.slideSub, { color: t.subText }]}>by the numbers</Text>
      <View style={{ gap: 22, marginTop: 32 }}>
        {rows.map((r, i) => (
          <View key={i} style={s.statRow}>
            <Text style={s.statIcon}>{r.icon}</Text>
            <View>
              <Text style={s.statValue}>{r.value > 0 ? r.value : '–'}</Text>
              <Text style={[s.statLabel, { color: t.subText }]}>{r.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
});

export default StatsSlide;

const s = StyleSheet.create({
  slidePad:   { padding: 36, justifyContent: 'center' },
  slideTitle: { fontSize: TYPO.hero, fontWeight: '800', color: '#fff', lineHeight: 36 },
  slideSub:   { fontSize: TYPO.subheading, marginTop: 4 },
  statRow:    { flexDirection: 'row', alignItems: 'center', gap: 18 },
  statIcon:   { fontSize: TYPO.hero, width: 40 },
  statValue:  { fontSize: 36, fontWeight: '800', color: '#fff', lineHeight: 38 },
  statLabel:  { fontSize: TYPO.body, marginTop: 1 },
});
