import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { PiggyBank, Gift, ClipboardList, Calendar, Trophy, PartyPopper } from 'lucide-react-native';
import { KID } from './kidTheme';

// Row wraps to two lines of 3 (rather than 6-in-a-row, which got cramped)
// once Leaderboard/Cheer Squad joined Piggy Bank/Rewards/My Requests/Full
// Calendar as entries here — both used to be their own always-visible
// blocks; now they're one tap away from this row instead of permanently
// occupying scroll space.
export function KidMoreRow({ onPiggyBank, onHistory, onLeaderboard, onCheerSquad, cheerBadge, colors, isDark }: {
  onPiggyBank: () => void; onHistory: () => void;
  onLeaderboard: () => void; onCheerSquad: () => void;
  /** Count badge on the Cheer Squad tile — sibling wins still waiting on a cheer. */
  cheerBadge?: number;
  colors: any; isDark: boolean;
}) {
  // Same brand tokens as ParentQuickActions — no off-palette hex (was
  // BRAND.amber/purple/teal plus two bare local hex constants for Rewards
  // pink and Cheer Squad green that didn't exist anywhere else in the app).
  const tiles: { Icon: typeof PiggyBank; label: string; color: string; onPress: () => void; badge?: number }[] = [
    { Icon: PiggyBank,     label: 'Piggy Bank',    color: colors.kid,    onPress: onPiggyBank },
    { Icon: Gift,          label: 'Rewards',       color: colors.accent, onPress: () => router.push('/(tabs)/store' as any) },
    { Icon: Trophy,        label: 'Leaderboard',   color: colors.danger, onPress: onLeaderboard },
    { Icon: PartyPopper,   label: 'Cheer Squad',   color: colors.parent, onPress: onCheerSquad, badge: cheerBadge },
    { Icon: ClipboardList, label: 'My Requests',   color: colors.accent, onPress: onHistory },
    { Icon: Calendar,      label: 'Full Calendar', color: colors.parent, onPress: () => router.push('/(tabs)/calendar') },
  ];

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {tiles.map(({ Icon, label, color, onPress, badge }) => (
        <Pressable key={label} onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "${label}" on "KidMoreRow" [features/hub/kid/KidMoreRow.tsx]`); onPress(); }}
          style={{ flexBasis: '31%', flexGrow: 1, borderRadius: 16, paddingVertical: 15, alignItems: 'center', gap: 7,
            backgroundColor: isDark ? color + '22' : color + '1E', borderWidth: 1, borderColor: color + (isDark ? '38' : '2C') }}>
          {/* Solid-tint icon chip with a white icon — matches the Parent
              Hub's quick-action tile treatment instead of a bare icon
              floating directly on the tinted wash. */}
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
            <Icon size={19} color="#fff" />
            {!!badge && badge > 0 && (
              <View style={{ position: 'absolute', top: -6, right: -8, backgroundColor: color, borderRadius: 9,
                minWidth: 16, height: 16, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: colors.card }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>{badge}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: KID.tiny, fontWeight: '800', color, textAlign: 'center' }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
