import { View, Text } from 'react-native';
import { HandHeart, Heart, Compass, Gamepad2, Images, ArrowUpRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { GEMINI } from '@/constants/geminiRhythm';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { KidSectionHeader } from '../kid/KidSectionHeader';
import { GP } from './seniorTheme';

export type SeniorGroup = 'help' | 'kids' | 'sponsor' | 'games';

/**
 * SeniorActionGrid — the grandparent Hub's "Quick actions": four pastel tiles in the same 2x2 shape as the kid and parent Hubs. Each
 * tile opens its own area below the grid (one open at a time), so the Hub stays short instead of showing every card at once.
 */
export function SeniorActionGrid({ open, onToggle, helpCount, kidsCount, sponsorCount, colors, isDark }: {
  open: SeniorGroup | null; onToggle: (g: SeniorGroup) => void;
  helpCount: number; kidsCount: number; sponsorCount: number;
  colors: any; isDark: boolean;
}) {
  const tiles: { key: SeniorGroup; Icon: typeof HandHeart; title: string; subtitle: string; count: number; bg: string; fg: string }[] = [
    { key: 'help',    Icon: HandHeart, title: 'Lend a hand',     subtitle: 'Rides and errands you can help with', count: helpCount,    bg: colors.amberLight, fg: colors.amber },
    { key: 'kids',    Icon: Heart,     title: 'My grandkids',    subtitle: 'Cheer them on, send a bonus',          count: kidsCount,    bg: colors.pinkLight,  fg: colors.pink },
    { key: 'sponsor', Icon: Compass,   title: 'Sponsor a quest', subtitle: 'Set a challenge and a reward',        count: sponsorCount, bg: colors.tealLight,  fg: colors.teal },
    { key: 'games',   Icon: Gamepad2,  title: 'Family games',    subtitle: 'Play together',                        count: 0,            bg: colors.primaryLight, fg: colors.primary },
  ];
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
      <KidSectionHeader label="QUICK ACTIONS" accent={colors.pink} colors={colors} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map(t => {
          const on = open === t.key;
          return (
            <AnimatedPressable key={t.key} onPress={() => onToggle(t.key)} accessibilityRole="button" accessibilityLabel={t.title}
              style={{ flexBasis: '47%', flexGrow: 1, minHeight: 124, borderRadius: 22, padding: 16, backgroundColor: t.bg, justifyContent: 'space-between',
                borderWidth: on ? 2 : 1, borderColor: on ? t.fg : (isDark ? colors.border : GEMINI.border), ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <t.Icon size={28} color={t.fg} strokeWidth={2} />
                {t.count > 0 ? (
                  <View style={{ minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: t.fg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textInverse }}>{t.count}</Text>
                  </View>
                ) : <ArrowUpRight size={16} color={colors.textTertiary} />}
              </View>
              <View>
                <Text style={{ fontSize: GP.body, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }} numberOfLines={1}>{t.title}</Text>
                <Text style={{ fontSize: GP.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 3 }} numberOfLines={2}>{t.subtitle}</Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
      {/* Memories: the grandparent's tab bar now matches every other role, so photos and stories live here. */}
      <AnimatedPressable onPress={() => router.push('/(tabs)/memories' as any)} accessibilityRole="button" accessibilityLabel="Memories"
        style={{ marginTop: 10, minHeight: 72, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
          backgroundColor: colors.pinkLight, borderWidth: 1, borderColor: isDark ? colors.border : GEMINI.border, ...(isDark ? GEMINI.cardShadowDark : GEMINI.cardShadow) }}>
        <Images size={28} color={colors.pink} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: GP.body, fontWeight: '800', color: isDark ? colors.textPrimary : GEMINI.titleColor }}>Memories</Text>
          <Text style={{ fontSize: GP.tiny, color: isDark ? colors.textSecondary : GEMINI.bodyColor, marginTop: 2 }}>Family photos and little stories</Text>
        </View>
        <ArrowUpRight size={16} color={colors.textTertiary} />
      </AnimatedPressable>
    </View>
  );
}
