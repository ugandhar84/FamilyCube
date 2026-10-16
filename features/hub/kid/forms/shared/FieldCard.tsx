/**
 * FieldCard / FieldCardSection — the Figma "labeled field" rhythm shared by
 * every Ask-Parent form (and features/grocery/components/AddItemSheet.tsx,
 * which originated this pattern — promoted here so every form reuses one
 * definition instead of redeclaring it locally).
 */
import { ReactNode } from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { GEMINI } from '@/constants/geminiRhythm';

export function FieldCard({ label, focused, children, colors, isDark, style }: {
  label: string; focused?: boolean; children: ReactNode; colors: any; isDark: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  return (
    <View style={[{
      backgroundColor: cardBg,
      borderRadius: 14,
      borderWidth: focused ? 2 : 1,
      borderColor: focused ? colors.primary : colors.border,
      padding: 14,
      minHeight: 72,
      gap: 4,
      ...cardShadow,
    }, style]}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? colors.textSecondary : GEMINI.bodyColorLight }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function FieldCardSection({ title, children, colors, isDark }: {
  title: string; children: ReactNode; colors: any; isDark: boolean;
}) {
  const cardBg = isDark ? colors.card : GEMINI.cardBg;
  const cardShadow = isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow;
  return (
    <View style={{
      backgroundColor: cardBg,
      borderRadius: 18,
      padding: 16,
      gap: 12,
      ...cardShadow,
    }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>
        {title}
      </Text>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}
