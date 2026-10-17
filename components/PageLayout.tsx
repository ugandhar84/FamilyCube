/**
 * PageBody / Section — the one spacing rhythm for every page (see RHYTHM in constants/theme.ts).
 *   PageBody: scrolling page content with 20px page edges and 24px between sections.
 *   Section:  an optional heading plus its block; components inside are 12px apart.
 * Children never add their own outer margins, so spacing is the same on every screen.
 */
import React from 'react';
import { ScrollView, View, Text, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RHYTHM } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export function PageBody({ children, bottomExtra = 0, contentContainerStyle, ...rest }: ScrollViewProps & { children: React.ReactNode; bottomExtra?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...rest}
      contentContainerStyle={[{ paddingHorizontal: RHYTHM.page, paddingTop: 4, paddingBottom: insets.bottom + 32 + bottomExtra, gap: RHYTHM.section }, contentContainerStyle]}>
      {children}
    </ScrollView>
  );
}

export function Section({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: RHYTHM.item }}>
      {!!title && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: RHYTHM.item }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}
