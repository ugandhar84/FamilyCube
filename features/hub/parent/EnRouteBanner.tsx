import { View, Text, Pressable } from 'react-native';
import { Navigation } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';

export function EnRouteBanner({ colors, isDark, onEnRoute }: {
  colors: any; isDark: boolean; onEnRoute: () => void;
}) {
  return (
    <View style={{
      backgroundColor: isDark ? '#0D2B1F' : '#ECFDF5',
      borderRadius: 24, borderWidth: 1, borderColor: isDark ? '#10B98140' : '#A7F3D0',
      padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? '#10B98130' : '#D1FAE5', alignItems: 'center', justifyContent: 'center' }}>
        <Navigation size={22} color="#059669" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? '#34D399' : '#065F46' }}>Start Pickup / Trip</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Broadcast "En Route" with ETA to family chat</Text>
      </View>
      <Pressable onPress={onEnRoute} style={{ backgroundColor: '#10B981', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>En Route</Text>
      </Pressable>
    </View>
  );
}
