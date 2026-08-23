import { View, Text, Pressable } from 'react-native';
import { MessageCircle, Car } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { KID } from './kidTheme';

export function KidActionRow({ colors, isDark, onAskParent, onNeedRide }: {
  colors: any; isDark: boolean; onAskParent: () => void; onNeedRide: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: 16, flexDirection: 'row', gap: 10, marginBottom: 18 }}>
      <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "Ask Parent" on "KidActionRow" [features/hub/kid/KidActionRow.tsx:11]`); onAskParent(); }}
        style={{ flex: 1, borderRadius: 18, paddingVertical: 18, alignItems: 'center', gap: 7,
          backgroundColor: BRAND.purple, shadowColor: BRAND.purple, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        <MessageCircle size={26} color="#fff" fill="#ffffff30" />
        <Text style={{ fontSize: KID.sub, fontWeight: '900', color: '#fff' }}>Ask Parent</Text>
      </Pressable>
      <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=kid tapped "Need a Ride?" on "KidActionRow" [features/hub/kid/KidActionRow.tsx:17]`); onNeedRide(); }}
        style={{ flex: 1, borderRadius: 18, paddingVertical: 18, alignItems: 'center', gap: 7,
          backgroundColor: isDark ? colors.card : '#fff',
          borderWidth: 2, borderColor: BRAND.teal + '60',
          shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
        <Car size={26} color={BRAND.teal} />
        <Text style={{ fontSize: KID.sub, fontWeight: '900', color: BRAND.teal }}>Need a Ride?</Text>
      </Pressable>
    </View>
  );
}
