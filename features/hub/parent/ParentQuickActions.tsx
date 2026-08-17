import { View, Text, Pressable } from 'react-native';
import { Sparkles, PlusCircle, Calendar, ShoppingCart } from 'lucide-react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';

// Money-green — "Quest" quick-action icon accent, distinct from brand teal
// used elsewhere in the hub. Not colors.success (which IS brand teal in
// this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';
// Sky-blue — "Grocery" quick-action icon accent, a distinct hue from the
// brand palette; kept as one local constant instead of a bare hex.
const SKY_BLUE = '#0ea5e9';

export function ParentQuickActions({ colors, isDark, groceryCount, onScanFlyer }: {
  colors: any; isDark: boolean; groceryCount: number; onScanFlyer: () => void;
}) {
  const tile = { flex: 1, borderRadius: 18, paddingVertical: 12, alignItems: 'center' as const, gap: 5 };
  const secondaryTile = {
    ...tile,
    backgroundColor: isDark ? colors.surface : '#F1F5F9',
    borderWidth: 1, borderColor: isDark ? colors.border : '#E2E8F0',
  };
  const labelColor = isDark ? colors.textPrimary : '#334155';

  return (
    <View style={{
      flexDirection: 'row', gap: 8,
      marginHorizontal: 16, marginBottom: 12,
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderRadius: 24, padding: 10,
      borderWidth: 1, borderColor: isDark ? colors.border : '#E8E8F0',
    }}>
      <Pressable onPress={onScanFlyer} style={{ ...tile, backgroundColor: BRAND.purple }}>
        <Sparkles size={18} color="#fff" />
        <Text style={{ fontSize: TYPO.label, fontWeight: '900', color: '#fff' }}>Scan Flyer</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(tabs)/quests')} style={secondaryTile}>
        <PlusCircle size={18} color={MONEY_GREEN} />
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: labelColor }}>Quest</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(tabs)/calendar')} style={secondaryTile}>
        <Calendar size={18} color={BRAND.purple} />
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: labelColor }}>Event</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(tabs)/grocery' as any)} style={secondaryTile}>
        <ShoppingCart size={18} color={SKY_BLUE} />
        <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: labelColor }} numberOfLines={1}>
          {groceryCount > 0 ? `${groceryCount} items` : 'Grocery'}
        </Text>
      </Pressable>
    </View>
  );
}
