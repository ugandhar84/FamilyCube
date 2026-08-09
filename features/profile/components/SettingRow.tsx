import React, { memo } from 'react';
import { TYPO } from '@/constants/theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type SettingRowProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  color?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  borderTop?: boolean;
  colors: any;
};

const SettingRow = memo(function SettingRow({ icon, label, sub, color, right, onPress, borderTop, colors }: SettingRowProps) {
  const c = color ?? colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={onPress ? 0.65 : 1}
      style={[row.wrap, borderTop && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <View style={[row.iconWrap, { backgroundColor: `${c}16` }]}>
        <Ionicons name={icon} size={17} color={c} />
      </View>
      <View style={row.text}>
        <Text style={[row.label, { color: color ?? colors.textPrimary }]}>{label}</Text>
        {sub ? <Text style={[row.sub, { color: colors.textSecondary ?? colors.textSecondary }]}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary ?? colors.textSecondary} /> : null)}
    </TouchableOpacity>
  );
});

export const row = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 13 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text:     { flex: 1 },
  label:    { fontSize: TYPO.subheading, fontWeight: '500' },
  sub:      { fontSize: TYPO.body, marginTop: 1.5 },
});

export default SettingRow;
