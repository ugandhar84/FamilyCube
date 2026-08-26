import { View, Text, Pressable } from 'react-native';
import { Sparkles, ListPlus, ShoppingCart, ChefHat } from 'lucide-react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';

export function ParentQuickActions({ colors, isDark, groceryCount, onScanFlyer, onAddTask }: {
  colors: any; isDark: boolean; groceryCount: number; onScanFlyer: () => void;
  // Opens SmartTaskComposer right over the Hub — same unified "just
  // describe it" entry point the Tasks tab's own FAB uses, replacing the
  // old separate "New Chore" / "Add Event" tiles (a chore vs. an event
  // isn't a distinction most parents think in before they've typed
  // anything — the composer's own local keyword detection sorts that out).
  onAddTask: () => void;
}) {
  // Kinfolk mock: each capsule gets its own soft-tinted background matching
  // the section it deep-links to — not one solid tile + three identical greys.
  const tiles = [
    { key: 'scan', label: 'Scan Flyer', icon: Sparkles, tint: colors.accent, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "Scan Flyer" quick action → onScanFlyer [features/hub/parent/ParentQuickActions.tsx:16]`); onScanFlyer(); } },
    { key: 'task', label: 'Add Task', icon: ListPlus, tint: colors.parent, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "Add Task" quick action → onAddTask [features/hub/parent/ParentQuickActions.tsx:17]`); onAddTask(); } },
    { key: 'grocery', label: groceryCount > 0 ? `${groceryCount} items` : 'Grocery', icon: ShoppingCart, tint: colors.kid, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "Grocery" quick action (count=${groceryCount}) → router.push /(tabs)/grocery [features/hub/parent/ParentQuickActions.tsx:19]`); router.push('/(tabs)/grocery' as any); } },
    // Re-added per explicit direction — was previously pulled from both the
    // Apps grid and this row (see VaultScreen.tsx's FEATURES comment).
    // Links straight to its own route (app/(tabs)/meals.tsx), same pattern
    // as Grocery below, rather than the shared VaultScreen openFeature
    // overlay — a real dedicated page per explicit direction.
    { key: 'meals', label: 'Meals', icon: ChefHat, tint: colors.pink, onPress: () => { console.log(`[UserAction] screen=Hub role=parent tapped "Meals" quick action → router.push /(tabs)/meals [features/hub/parent/ParentQuickActions.tsx:24]`); router.push('/(tabs)/meals' as any); } },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 20 }}>
      {tiles.map(t => {
        const Icon = t.icon;
        return (
          <Pressable key={t.key} onPress={t.onPress} style={{
            flex: 1, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center', gap: 6,
            backgroundColor: isDark ? t.tint + '28' : t.tint + '22',
          }}>
            <Icon size={19} color={t.tint} />
            <Text style={{ fontSize: TYPO.label - 1, fontWeight: '800', color: t.tint }} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
