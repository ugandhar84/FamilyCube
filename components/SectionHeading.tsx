import { View, Text } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import type { PageAccent } from '@/components/PageHeading';

/**
 * Section heading in the Hub's rhythm (see FamilyPulseCard / NextUpCard /
 * TodayActionGrid): a 2px accent bar, a 10px bold uppercase overline with
 * 0.9 tracking, and an optional light 20px heading underneath.
 */
export function SectionHeading({
  overline, title, accent = 'primary', marginTop = 26, marginBottom = 11, marginHorizontal = 20,
}: {
  overline: string;
  title?: string;
  accent?: PageAccent;
  marginTop?: number;
  marginBottom?: number;
  marginHorizontal?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginHorizontal, marginTop, marginBottom }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <View style={{ height: 2, borderRadius: 1, backgroundColor: colors[accent], marginBottom: 6, opacity: 0.6 }} />
        <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' }}>{overline}</Text>
      </View>
      {!!title && (
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '400', letterSpacing: -0.5, marginTop: 4 }}>{title}</Text>
      )}
    </View>
  );
}
