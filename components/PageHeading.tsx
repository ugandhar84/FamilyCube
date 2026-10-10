import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { PAGE } from '@/constants/theme';

export type PageAccent = 'primary' | 'teal' | 'amber' | 'pink' | 'sky';

const ACCENT: Record<PageAccent, { fg: 'primary' | 'teal' | 'amber' | 'pink' | 'sky'; bg: 'primaryLight' | 'tealLight' | 'amberLight' | 'pinkLight' | 'skyLight' }> = {
  primary: { fg: 'primary', bg: 'primaryLight' },
  teal:    { fg: 'teal',    bg: 'tealLight' },
  amber:   { fg: 'amber',   bg: 'amberLight' },
  pink:    { fg: 'pink',    bg: 'pinkLight' },
  sky:     { fg: 'sky',     bg: 'skyLight' },
};

/**
 * Shared page heading — same visual language as the Hub cards and Quick Actions
 * tiles: a short accent bar over an uppercase overline, the standard 29px title,
 * a meaningful one-line subtitle, and a filled pastel icon badge on the right.
 * Safe-area top padding is the caller's job (pass `topInset`).
 */
export function PageHeading({
  eyebrow, title, subtitle, accent = 'primary', Icon, right, topInset = 0, paddingHorizontal = PAGE.contentPadding,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accent?: PageAccent;
  Icon?: LucideIcon;
  right?: ReactNode;
  topInset?: number;
  paddingHorizontal?: number;
}) {
  const { colors } = useTheme();
  const a = ACCENT[accent];
  const fg = colors[a.fg];
  const bg = colors[a.bg];
  return (
    <View style={{ paddingHorizontal, paddingTop: topInset + PAGE.headerPaddingTop, paddingBottom: PAGE.headerPaddingBottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {!!eyebrow && (
            <View style={{ alignSelf: 'flex-start', marginBottom: 6 }}>
              <View style={{ height: 2, borderRadius: 1, backgroundColor: fg, marginBottom: 6, opacity: 0.6 }} />
              <Text numberOfLines={1} style={{ ...PAGE.eyebrow, color: colors.textTertiary, textTransform: 'uppercase' }}>{eyebrow}</Text>
            </View>
          )}
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...PAGE.title, color: colors.textPrimary, lineHeight: 36 }}>{title}</Text>
          {!!subtitle && (
            <Text numberOfLines={2} style={{ ...PAGE.subtitle, color: colors.textSecondary, marginTop: PAGE.headerGap }}>{subtitle}</Text>
          )}
        </View>
        {right}
        {Icon && (
          <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={28} color={fg} strokeWidth={2} />
          </View>
        )}
      </View>
    </View>
  );
}
