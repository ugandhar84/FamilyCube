import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { TYPO } from '@/constants/theme';
import { BRAND } from '@/components/FamilyCubeLogo';
import type { GroceryItem } from '@/store/groceryStore';

// Sheet body for the "Grocery List" tile — read-only family list + a link
// to the full Grocery tab.
export function TeenGroceryListSection({ items, colors, isDark }: {
  items: GroceryItem[]; colors: any; isDark: boolean;
}) {
  return (
    <View>
      {items.length === 0 ? (
        <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>List is empty — parent will add items</Text>
      ) : (
        items.map((item, i) => (
          <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7,
            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: isDark ? colors.border : '#F1F5F9' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.teal }} />
            <Text style={{ flex: 1, fontSize: TYPO.label, color: colors.textPrimary }}>{item.name}</Text>
            {item.quantity ? <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>{item.quantity}</Text> : null}
          </View>
        ))
      )}
      <Pressable onPress={() => { router.push('/(tabs)/grocery' as any); }}
        style={{ marginTop: 10, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND.teal + '50',
          paddingVertical: 8, alignItems: 'center' }}>
        <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: BRAND.teal }}>Open Full List →</Text>
      </Pressable>
    </View>
  );
}
