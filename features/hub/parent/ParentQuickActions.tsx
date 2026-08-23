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
    { key: 'scan', label: 'Scan Flyer', icon: Sparkles, tint: colors.accent, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "Scan Flyer" quick action → onScanFlyer [features/hub/parent/ParentQuickActions.tsx:16]`); onScanFlyer(); } },
    { key: 'quest', label: 'New Chore', icon: ShieldCheck, tint: colors.parent, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "New Chore" quick action → onAddQuest [features/hub/parent/ParentQuickActions.tsx:17]`); onAddQuest(); } },
    { key: 'event', label: 'Add Event', icon: CalendarPlus, tint: colors.kid, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "Add Event" quick action → onAddEvent [features/hub/parent/ParentQuickActions.tsx:18]`); onAddEvent(); } },
    { key: 'grocery', label: groceryCount > 0 ? `${groceryCount} items` : 'Grocery', icon: ShoppingCart, tint: colors.primary, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "Grocery" quick action (count=${groceryCount}) → router.push /(tabs)/grocery [features/hub/parent/ParentQuickActions.tsx:19]`); router.push('/(tabs)/grocery' as any); } },
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
