import { View, Text, Pressable } from 'react-native';
import { BRAND } from '@/components/FamilyCubeLogo';

export function KidActionRow({ colors, isDark, onAskParent, onNeedRide }: {
  colors: any; isDark: boolean; onAskParent: () => void; onNeedRide: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, flexDirection: 'row', gap: 10, marginBottom: 16 }}>
      <Pressable onPress={onAskParent}
        style={{ flex: 1, borderRadius: 18, paddingVertical: 18, alignItems: 'center', gap: 6,
          backgroundColor: BRAND.purple, shadowColor: BRAND.purple, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        <Text style={{ fontSize: 28 }}>💬</Text>
        <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Ask Parent</Text>
      </Pressable>
      <Pressable onPress={onNeedRide}
        style={{ flex: 1, borderRadius: 18, paddingVertical: 18, alignItems: 'center', gap: 6,
          backgroundColor: isDark ? colors.card : '#fff',
          borderWidth: 2, borderColor: BRAND.teal + '60',
          shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
        <Text style={{ fontSize: 28 }}>🚗</Text>
        <Text style={{ fontSize: 13, fontWeight: '900', color: BRAND.teal }}>Need a Ride?</Text>
      </Pressable>
    </View>
  );
}
