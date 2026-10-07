import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { ClipboardCheck, ShoppingCart, Car, Sparkles } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';

/**
 * TodayActionGrid — pixel-faithful rebuild of the Figma Make prototype's
 * "QUICK ACTIONS" section (design/Scrollable Content Design/src/App.tsx
 * lines 222-246, src/index.css lines 387-438): a section-title row above a
 * 2x2 grid of pastel tiles. Exact values: grid gap 10, tile min-height 116,
 * padding 15, radius 20; tones lavender/mint/sky/peach (index.css:404-421).
 *
 * Exact 4 actions and copy as the current source (re-verified against the
 * live file, which changed since an earlier pass of this component used
 * "Family chat" — it's now AskFam AI): Add a task / Groceries / Arrange a
 * ride / AskFam AI.
 */
export function TodayActionGrid({
  colors, isDark,
  groceryCount, ridesCount, nextRideLabel,
  onCapture, onRides, onAppreciation,
}: {
  colors: any; isDark: boolean;
  groceryCount: number;
  ridesCount: number;
  nextRideLabel?: string;
  onCapture: () => void;
  onRides?: () => void;
  onAppreciation?: () => void;
}) {
  // Exact Figma background colors from index.css (.lavender/.mint/.sky/.peach)
  const tiles = [
    {
      key: 'capture',
      icon: ClipboardCheck,
      tint: colors.pink,
      bg: colors.pinkLight,
      title: 'Add a task',
      subtitle: 'Capture it quickly',
      onPress: onCapture,
    },
    {
      key: 'groceries',
      icon: ShoppingCart,
      tint: colors.teal,
      bg: colors.tealLight,
      title: 'Groceries',
      subtitle: groceryCount > 0 ? `${groceryCount} item${groceryCount === 1 ? '' : 's'} open` : 'List is clear',
      onPress: () => router.push('/(tabs)/grocery' as any),
    },
    {
      key: 'rides',
      icon: Car,
      tint: colors.sky,
      bg: colors.skyLight,
      title: 'Arrange a ride',
      subtitle: ridesCount > 0 ? `${ridesCount} active today` : (nextRideLabel ?? 'Nothing active'),
      onPress: onRides ?? (() => router.push('/(tabs)/calendar' as any)),
    },
    {
      key: 'askfam',
      icon: Sparkles,
      tint: colors.amber,
      bg: colors.amberLight,
      title: 'Send a cheer',
      subtitle: 'Appreciate someone',
      onPress: onAppreciation ?? (() => router.push('/(tabs)/index' as any)),
    },
  ];

  return (
    <View>
      <View style={{ marginHorizontal: 20, marginTop: 26 }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.primary, marginBottom: 6, opacity: 0.6 }} />
          <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }}>QUICK ACTIONS</Text>
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '400', letterSpacing: -0.5, marginTop: 4 }}>
          Get it done
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 20, marginTop: 11 }}>
        {tiles.map(t => {
          const Icon = t.icon;
          return (
            <AnimatedPressable
              key={t.key}
              onPress={t.onPress}
              style={{
                flexBasis: '47%', flexGrow: 1,
                minHeight: 116,
                borderRadius: 20,
                borderWidth: 1, borderColor: isDark ? colors.border : 'rgba(223,97,60,0.09)',
                padding: 15,
                justifyContent: 'flex-start',
                backgroundColor: t.bg,
              }}
            >
              <Icon size={21} color={t.tint} strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 15 }} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                {t.subtitle}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}
