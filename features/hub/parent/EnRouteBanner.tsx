import { View, Text, Pressable } from 'react-native';
import { Navigation } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';

// Money-green — this banner's whole "go" accent (icon, border, button).
// Not colors.success (which IS brand teal in this app, and would visibly
// change this banner's color) — kept as one local constant.
const MONEY_GREEN = '#10B981';

export function EnRouteBanner({ colors, isDark, onEnRoute }: {
  colors: any; isDark: boolean; onEnRoute: () => void;
}) {
  return (
    <View style={{
      backgroundColor: isDark ? '#0D2B1F' : '#ECFDF5',
      borderRadius: 24, borderWidth: 1, borderColor: isDark ? `${MONEY_GREEN}40` : '#A7F3D0',
      padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? `${MONEY_GREEN}30` : '#D1FAE5', alignItems: 'center', justifyContent: 'center' }}>
        <Navigation size={22} color="#059669" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isDark ? '#34D399' : '#065F46' }}>Start Pickup / Trip</Text>
        <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>Broadcast "En Route" with ETA to family chat</Text>
      </View>
      <Pressable onPress={onEnRoute} style={{ backgroundColor: MONEY_GREEN, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9 }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>En Route</Text>
      </Pressable>
    </View>
  );
}
