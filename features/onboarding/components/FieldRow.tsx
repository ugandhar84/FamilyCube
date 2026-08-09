import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

export const FieldRow = React.memo(function FieldRow({ label, colors, children, top }: {
  label: string; colors: any; children: React.ReactNode; top?: boolean;
}) {
  return (
    <View style={[fr.wrap, top && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Text style={[fr.lbl, { color: colors.textSecondary ?? colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
});

const fr = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 12 },
  lbl:  { fontSize: TYPO.body, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 },
});
