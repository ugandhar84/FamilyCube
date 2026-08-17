import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TYPO } from '@/constants/theme';
import { I } from './icons';

// ─── AI Result Cards — shared primitives ──────────────────────────────────────
export function AiCard({ children, accentColor, isDark, colors, onClose }: any) {
  const bg     = isDark ? colors.surface  : colors.background;
  const border = accentColor + '55';
  const divBg  = accentColor + '22';
  return (
    <View style={{ borderRadius: 20, borderWidth: 1, backgroundColor: bg, borderColor: border, padding: 14, marginHorizontal: 14, marginBottom: 12, gap: 8 }}>
      {children}
    </View>
  );
}

export function AiCardHeader({ icon, title, accentColor, onClose }: any) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: accentColor + '40', paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
        {icon}
        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: accentColor, flex: 1 }}>{title}</Text>
      </View>
      <TouchableOpacity onPress={onClose} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <I.X c={accentColor} size={12} />
        <Text style={{ color: accentColor, fontSize: TYPO.micro + 1 }}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

export function AiSectionDivider({ label, color, icon }: { label: string; color: string; icon?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: color + '40' }} />
      {icon}
      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: color + '40' }} />
    </View>
  );
}

export function AiRow({ isDark, colors, children }: any) {
  return (
    <View style={{ borderRadius: 12, backgroundColor: isDark ? colors.surface : colors.background, borderWidth: 1, borderColor: colors.border, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {children}
    </View>
  );
}
