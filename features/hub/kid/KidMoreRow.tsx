import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { PiggyBank, Gift, ClipboardList, Calendar, Trophy, PartyPopper } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';

// Rewards pink — deliberately distinct from BRAND's brand pink (#F04E98) for
// the "Rewards" tile; kept as one local constant instead of a bare hex.
const REWARDS_PINK = '#EC4899';

// Row wraps to two lines of 3 (rather than 6-in-a-row, which got cramped)
// once Leaderboard/Cheer Squad joined Piggy Bank/Rewards/My Requests/Full
// Calendar as entries here — both used to be their own always-visible
// blocks; now they're one tap away from this row instead of permanently
// occupying scroll space.
export function KidMoreRow({ onPiggyBank, onHistory, onLeaderboard, onCheerSquad, cheerBadge }: {
  onPiggyBank: () => void; onHistory: () => void;
  onLeaderboard: () => void; onCheerSquad: () => void;
  /** Count badge on the Cheer Squad tile — sibling wins still waiting on a cheer. */
  cheerBadge?: number;
}) {
  const tiles: { Icon: typeof PiggyBank; label: string; color: string; bg: string; onPress: () => void; badge?: number }[] = [
    { Icon: PiggyBank,     label: 'Piggy Bank',    color: BRAND.amber,  bg: BRAND.amber + '15',  onPress: onPiggyBank },
    { Icon: Gift,          label: 'Rewards',       color: REWARDS_PINK, bg: `${REWARDS_PINK}15`, onPress: () => router.push('/(tabs)/store' as any) },
    { Icon: Trophy,        label: 'Leaderboard',   color: BRAND.purple, bg: BRAND.purple + '12', onPress: onLeaderboard },
    { Icon: PartyPopper,   label: 'Cheer Squad',   color: '#10B981',    bg: '#10B98115',          onPress: onCheerSquad, badge: cheerBadge },
    { Icon: ClipboardList, label: 'My Requests',   color: BRAND.purple, bg: BRAND.purple + '12', onPress: onHistory },
    { Icon: Calendar,      label: 'Full Calendar', color: BRAND.teal,   bg: BRAND.teal + '12',   onPress: () => router.push('/(tabs)/calendar') },
  ];

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {tiles.map(({ Icon, label, color, bg, onPress, badge }) => (
        <Pressable key={label} onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "${label}" on "KidMoreRow" [features/hub/kid/KidMoreRow.tsx]`); onPress(); }}
          style={{ flexBasis: '31%', flexGrow: 1, borderRadius: 16, paddingVertical: 15, alignItems: 'center', gap: 6,
            backgroundColor: bg, borderWidth: 1, borderColor: color + '30' }}>
          <View>
            <Icon size={22} color={color} />
            {!!badge && badge > 0 && (
              <View style={{ position: 'absolute', top: -6, right: -10, backgroundColor: color, borderRadius: 9,
                minWidth: 16, height: 16, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' }}>
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
