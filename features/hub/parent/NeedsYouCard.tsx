import { View, Text } from 'react-native';
import { ClipboardCheck } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { useTheme } from '@/lib/ThemeContext';

export type NeedsYouItem =
  | { kind: 'conflict'; title: string; reason: string }
  | { kind: 'approval'; title: string; reason: string }
  | { kind: 'backlog'; title: string; reason: string };

export function NeedsYouCard({
  item, onReview,
}: {
  item: NeedsYouItem;
  onReview: () => void;
}) {
  const { colors, isDark } = useTheme();

  const ctaLabel =
    item.kind === 'conflict' ? 'Review options' :
    item.kind === 'approval' ? 'Review & approve' :
    'See task';

  return (
    <View style={{
      marginHorizontal: 20, marginTop: 14,
      flexDirection: 'row', flexWrap: 'wrap', gap: 12,
      padding: 18,
      borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.12)',
      borderRadius: 22,
      backgroundColor: colors.amberLight,
    }}>
      <View style={{
        width: 42, height: 42, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)',
      }}>
        <ClipboardCheck size={21} color={colors.amber} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, minWidth: 180 }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.amber, marginBottom: 6, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>NEEDS YOU</Text>
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 5, marginBottom: 2 }} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
          {item.reason}
        </Text>
      </View>
      <AnimatedPressable
        onPress={onReview}
        style={{
          width: '100%', minHeight: 46,
          alignItems: 'center', justifyContent: 'center',
          borderRadius: 14,
          backgroundColor: colors.pink,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
          {ctaLabel}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
