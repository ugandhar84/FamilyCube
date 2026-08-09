import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

export const SectionCard = React.memo(function SectionCard({ title, colors, children }: { title: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{
        fontSize: TYPO.body, fontWeight: '700', color: colors.textSecondary ?? colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 4, marginBottom: 8,
      }}>{title}</Text>
      <View style={{
        backgroundColor: colors.card, borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden',
      }}>
        {children}
      </View>
    </View>
  );
});
