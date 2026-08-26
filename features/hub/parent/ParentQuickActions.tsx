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
    { key: 'scan', label: 'Scan Flyer', icon: Sparkles, tint: colors.accent, onPress: onScanFlyer },
    { key: 'task', label: 'Add Task', icon: ListPlus, tint: colors.parent, onPress: onAddTask },
    // Label previously swapped between "Grocery" and "N items" depending on
    // cart state — a parent scanning for "the grocery button" by its label
    // saw inconsistent text, unlike every other tile in this row which
    // never changes its label. Keep the label fixed; the count now shows as
    // a small badge on the icon chip instead (see the badge render below).
    { key: 'grocery', label: 'Grocery', icon: ShoppingCart, tint: colors.kid, badge: groceryCount, onPress: () => router.push('/(tabs)/grocery' as any) },
    // Re-added per explicit direction — was previously pulled from both the
    // Apps grid and this row (see VaultScreen.tsx's FEATURES comment).
    // Links straight to its own route (app/(tabs)/meals.tsx), same pattern
    // as Grocery below, rather than the shared VaultScreen openFeature
    // overlay — a real dedicated page per explicit direction.
    // colors.danger (red) previously tinted this tile with no real reason —
    // it isn't a warning/alert action, it just read as one sitting next to
    // three calm tiles. amber reads as "food" without borrowing the app's
    // one alert color.
    { key: 'meals', label: 'Meals', icon: ChefHat, tint: colors.amber, onPress: () => { router.push('/(tabs)/meals' as any); } },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 20 }}>
      {tiles.map(t => {
        const Icon = t.icon;
        return (
          <Pressable key={t.key} onPress={t.onPress} style={{
            flex: 1, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center', gap: 8,
            backgroundColor: isDark ? t.tint + '22' : t.tint + '1E',
            borderWidth: 1, borderColor: isDark ? t.tint + '38' : t.tint + '2C',
          }}>
            {/* Solid-tint icon chip with a white icon — bolder "badge" look
                instead of a thin outline icon floating on the wash. */}
            <View>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: t.tint }}>
                <Icon size={17} color="#fff" strokeWidth={2.4} />
              </View>
              {!!(t as any).badge && (
                <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 17, height: 17, borderRadius: 9,
                  paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.danger, borderWidth: 1.5, borderColor: isDark ? colors.card : '#fff' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{(t as any).badge}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: TYPO.label - 1, fontWeight: '800', color: t.tint }} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
