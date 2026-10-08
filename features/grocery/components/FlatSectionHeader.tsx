import { ComponentType } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

// ─── FlatSectionHeader — Figma plain bold category heading ───────────────────
export function FlatSectionHeader({ Icon, emoji, title, badge, badgeColor, accent, colors, onAction, actionIcon }: {
  Icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; emoji?: string;
  title: string; badge?: string; badgeColor?: string; accent: string; colors: any;
  onAction?: () => void; actionIcon?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 8 }}>
      <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>
        {title}
      </Text>
      {badge ? (
        <View style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: (badgeColor ?? accent) + '20' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: badgeColor ?? accent }}>{badge}</Text>
        </View>
      ) : null}
      {onAction ? (
        <TouchableOpacity onPress={onAction} style={{ padding: 6, borderRadius: 8, backgroundColor: accent + '15' }}>
          {actionIcon}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
