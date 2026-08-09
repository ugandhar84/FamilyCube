import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

interface InfoRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  ac: string;
  colors: any;
  top?: boolean;
}

export const InfoRow = React.memo(function InfoRow({ icon, label, value, ac, colors, top }: InfoRowProps) {
  return (
    <View style={[ir.row, top && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={[ir.icon, { backgroundColor: `${ac}14` }]}>
        <Ionicons name={icon} size={15} color={ac} />
      </View>
      <Text style={[ir.label, { color: colors.textSecondary ?? colors.textSecondary }]}>{label}</Text>
      <Text style={[ir.value, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
});

export const ir = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11 },
  icon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: TYPO.body, width: 100 },
  value: { flex: 1, fontSize: TYPO.body, fontWeight: '600', textAlign: 'right' },
});
