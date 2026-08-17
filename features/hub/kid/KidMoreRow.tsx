import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { BRAND } from '@/components/FamilyCubeLogo';

export function KidMoreRow({ onPiggyBank, onHistory }: { onPiggyBank: () => void; onHistory: () => void }) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {([
          { icon: '🐷', label: 'Piggy Bank',    color: BRAND.amber,  bg: BRAND.amber + '15',  onPress: onPiggyBank },
          { icon: '🎁', label: 'Rewards',       color: '#EC4899',    bg: '#EC489915',          onPress: () => router.push('/(tabs)/store' as any) },
          { icon: '📋', label: 'My Requests',   color: BRAND.purple, bg: BRAND.purple + '12', onPress: onHistory },
          { icon: '🗓', label: 'Full Calendar', color: BRAND.teal,   bg: BRAND.teal + '12',   onPress: () => router.push('/(tabs)/calendar') },
        ] as const).map(({ icon, label, color, bg, onPress }) => (
          <Pressable key={label} onPress={onPress}
            style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 5,
              backgroundColor: bg, borderWidth: 1, borderColor: color + '30' }}>
            <Text style={{ fontSize: 20 }}>{icon}</Text>
            <Text style={{ fontSize: 9, fontWeight: '800', color, textAlign: 'center' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
