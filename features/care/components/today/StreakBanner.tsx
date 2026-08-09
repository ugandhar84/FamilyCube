import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

interface Props {
  streak: number;
  colors: any;
}

export default function StreakBanner({ streak, colors }: Props) {
  if (streak < 2) return null;
  return (
    <View style={[s.streakBanner, { backgroundColor: colors.primary + '1F', borderColor: colors.primary + '40' }]}>
      <Text style={[s.streakText, { color: colors.primary }]}>🔥 {streak}-day care streak — keep it up!</Text>
    </View>
  );
}

const s = StyleSheet.create({
  streakBanner: { marginHorizontal: 12, marginTop: 6, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  streakText:   { fontSize: TYPO.caption, fontWeight: '700' },
});
