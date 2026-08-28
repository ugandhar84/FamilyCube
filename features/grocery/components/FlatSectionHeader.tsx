import { ComponentType } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

// ─── FlatSectionHeader ────────────────────────────────────────────────────────
// Local flat header pattern matching Hub's SectionCard: icon chip + uppercase
// title + optional badge pill, divided from content by a single hairline.
// Kept local to Grocery (same approach as MealsTab's FlatSectionHeader)
// rather than a cross-feature shared import.
export function FlatSectionHeader({ Icon, emoji, title, badge, badgeColor, accent, colors, onAction, actionIcon }: {
  Icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; emoji?: string;
  title: string; badge?: string; badgeColor?: string; accent: string; colors: any;
  onAction?: () => void; actionIcon?: React.ReactNode;
}) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          {Icon ? <Icon size={15} color={accent} /> : <Text style={{ fontSize: 15 }}>{emoji}</Text>}
        </View>
        {/* Matches Hub's SectionCard, including its heading-color fix —
            textSecondary read as gray/hard-to-read for what's the
            strongest text on its row (same UI review finding). */}
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
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
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
    </>
  );
}
