/**
 * HubFullWidthActionCard — shared chrome for the Kid Hub's full-width
 * quick-action cards (Ask Parent, Ride), copied from RidesStatusCard's
 * card look on the Parent Hub: GEMINI-token card, icon chip + title/
 * subtitle row, optional pill badge on the right. Ride is kept decoupled
 * from Ask Parent — each gets its own full-width card using this same
 * chrome, rather than sharing one card or living inside the Ask Parent
 * pill picker.
 */
import type { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { GEMINI } from '@/constants/geminiRhythm';

export function HubFullWidthActionCard({
  colors, isDark, Icon, iconBg, iconColor, title, subtitle, badgeLabel, badgeBg, badgeColor, onPress, children,
}: {
  colors: any; isDark: boolean;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconBg: string; iconColor: string;
  title: string; subtitle: string;
  badgeLabel?: string; badgeBg?: string; badgeColor?: string;
  onPress: () => void;
  // Optional extra row below the title/subtitle/badge row — e.g.
  // RideStatusCard's date·time·driver metadata line for a confirmed ride.
  children?: ReactNode;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        marginHorizontal: 16, marginTop: 14,
        backgroundColor: isDark ? colors.card : GEMINI.cardBg,
        borderRadius: 16, padding: 16, gap: 10,
        borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border,
        ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 11,
          backgroundColor: iconBg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={iconColor} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: (isDark ? colors.textPrimary : GEMINI.titleColor) }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: (isDark ? colors.textSecondary : GEMINI.bodyColor), marginTop: 1 }}>
            {subtitle}
          </Text>
        </View>
        {badgeLabel && (
          <View style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100,
            backgroundColor: badgeBg,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: badgeColor }}>
              {badgeLabel}
            </Text>
          </View>
        )}
        <ChevronRight size={18} color={colors.textTertiary} strokeWidth={2.2} />
      </View>
      {children}
    </AnimatedPressable>
  );
}
