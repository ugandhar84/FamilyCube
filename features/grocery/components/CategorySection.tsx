import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GroceryItem } from '@/store/groceryStore';
import { FlatSectionHeader } from './FlatSectionHeader';

// ─── CategorySection ──────────────────────────────────────────────────────────

export function CategorySection({ label, emoji, color, items, isDark, colors, isKid, onBuy, members }: {
  label: string; emoji: string; color: string;
  items: GroceryItem[]; isDark: boolean; colors: any; isKid: boolean;
  onBuy: (item: GroceryItem) => void;
  members: any[];
}) {
  const pending = items.filter(i => !i.isBought).length;
  // Group by store
  const byStore: Record<string, GroceryItem[]> = {};
  for (const item of items) {
    const key = item.storePreference || 'Any store';
    if (!byStore[key]) byStore[key] = [];
    byStore[key].push(item);
  }
  const storeGroups = Object.entries(byStore).sort(([a], [b]) =>
    a === 'Any store' ? 1 : b === 'Any store' ? -1 : a.localeCompare(b)
  );

  return (
    <View style={{ marginBottom: 20 }}>
      <FlatSectionHeader emoji={emoji} title={label} accent={color} colors={colors} badge={`${pending} left`} />

      {storeGroups.map(([store, storeItems]) => (
        <View key={store} style={{ marginBottom: 10 }}>
          {storeGroups.length > 1 && (
            <Text style={{ fontSize: 11, fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: 0.7, opacity: 0.7, marginBottom: 4 }}>
              {store === 'Any store' ? 'Any Store' : store}
            </Text>
          )}
          <View>
            {storeItems.map((item, idx) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center',
                paddingVertical: 10,
                borderBottomWidth: idx < storeItems.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: colors.border,
                opacity: item.isBought ? 0.45 : 1 }}>
                <Pressable onPress={() => !isKid && onBuy(item)}
                  style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2,
                    borderColor: item.isBought ? color : color + '80',
                    backgroundColor: item.isBought ? color : 'transparent',
                    alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  {item.isBought && <Text style={{ fontSize: 12, color: colors.textInverse }}>✓</Text>}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700',
                    color: item.isBought ? colors.textTertiary : colors.textPrimary,
                    textDecorationLine: item.isBought ? 'line-through' : 'none' }}>
                    {item.name}
                    {item.quantity ? <Text style={{ fontWeight: '400', color: colors.textSecondary }}> × {item.quantity}</Text> : null}
                  </Text>
                  {item.addedBy ? (() => {
                    const requester = members.find((m: any) => m.id === item.addedBy);
                    const name = requester?.name?.split(' ')[0] ?? 'Kid';
                    return (
                      <Text style={{ fontSize: 11, fontWeight: '600', color: color, marginTop: 2 }}>
                        👦 {name} asked for this
                      </Text>
                    );
                  })() : null}
                </View>
                {!item.isBought && !isKid && (
                  <Pressable onPress={() => onBuy(item)}
                    style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: color }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textInverse }}>Got it ✓</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
