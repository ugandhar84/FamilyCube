import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { PiggyBank, Gift, ClipboardList, Calendar } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';

// Rewards pink — deliberately distinct from BRAND's brand pink (#F04E98) for
// the "Rewards" tile; kept as one local constant instead of a bare hex.
const REWARDS_PINK = '#EC4899';

export function KidMoreRow({ onPiggyBank, onHistory }: { onPiggyBank: () => void; onHistory: () => void }) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {([
          { Icon: PiggyBank,     label: 'Piggy Bank',    color: BRAND.amber,  bg: BRAND.amber + '15',  onPress: onPiggyBank },
          { Icon: Gift,          label: 'Rewards',       color: REWARDS_PINK, bg: `${REWARDS_PINK}15`, onPress: () => router.push('/(tabs)/store' as any) },
          { Icon: ClipboardList, label: 'My Requests',   color: BRAND.purple, bg: BRAND.purple + '12', onPress: onHistory },
          { Icon: Calendar,      label: 'Full Calendar', color: BRAND.teal,   bg: BRAND.teal + '12',   onPress: () => router.push('/(tabs)/calendar') },
        ] as const).map(({ Icon, label, color, bg, onPress }) => (
          <Pressable key={label} onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "${label}" on "KidMoreRow" [features/hub/kid/KidMoreRow.tsx:21]`); onPress(); }}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: 'center', gap: 6,
              backgroundColor: bg, borderWidth: 1, borderColor: color + '30' }}>
            <Icon size={22} color={color} />
            <Text style={{ fontSize: KID.tiny, fontWeight: '800', color, textAlign: 'center' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
