import { View, Text, Pressable } from 'react-native';
import { Sparkles, PlusCircle, Calendar, ShoppingCart } from 'lucide-react-native';
import { router } from 'expo-router';
import { BRAND } from '@/components/FamilyCubeLogo';

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
        <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>Scan Flyer</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(tabs)/quests')} style={secondaryTile}>
        <PlusCircle size={18} color="#10B981" />
        <Text style={{ fontSize: 10, fontWeight: '700', color: labelColor }}>Quest</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(tabs)/calendar')} style={secondaryTile}>
        <Calendar size={18} color={BRAND.purple} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: labelColor }}>Event</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/(tabs)/grocery' as any)} style={secondaryTile}>
        <ShoppingCart size={18} color="#0ea5e9" />
        <Text style={{ fontSize: 10, fontWeight: '700', color: labelColor }} numberOfLines={1}>
          {groceryCount > 0 ? `${groceryCount} items` : 'Grocery'}
        </Text>
      </Pressable>
    </View>
  );
}
