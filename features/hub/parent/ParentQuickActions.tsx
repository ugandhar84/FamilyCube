import { View, Text, Pressable } from 'react-native';
import { Sparkles, ShieldCheck, CalendarPlus, ShoppingCart } from 'lucide-react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';

export function ParentQuickActions({ colors, isDark, groceryCount, onScanFlyer, onAddQuest, onAddEvent }: {
  colors: any; isDark: boolean; groceryCount: number; onScanFlyer: () => void;
  // Open the real creation modal (manual form + voice record) right over
  // the Hub, instead of just navigating to the Quests/Calendar tab and
  // relying on the user to find the add button there themselves.
  onAddQuest: () => void; onAddEvent: () => void;
}) {
  // Kinfolk mock: each capsule gets its own soft-tinted background matching
  // the section it deep-links to — not one solid tile + three identical greys.
  const tiles = [
    { key: 'scan', label: 'Scan Flyer', icon: Sparkles, tint: colors.accent, onPress: onScanFlyer },
    { key: 'quest', label: 'New Chore', icon: ShieldCheck, tint: colors.parent, onPress: onAddQuest },
    { key: 'event', label: 'Add Event', icon: CalendarPlus, tint: colors.kid, onPress: onAddEvent },
    { key: 'grocery', label: groceryCount > 0 ? `${groceryCount} items` : 'Grocery', icon: ShoppingCart, tint: colors.primary, onPress: () => router.push('/(tabs)/grocery' as any) },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 20 }}>
      {tiles.map(t => {
        const Icon = t.icon;
        return (
          <Pressable key={t.key} onPress={t.onPress} style={{
            flex: 1, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 6, alignItems: 'center', gap: 7,
            backgroundColor: isDark ? t.tint + '20' : t.tint + '14',
          }}>
            <Icon size={20} color={t.tint} />
            <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: t.tint }} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
