import { View, Text, Pressable, Alert } from 'react-native';
import { GroceryItem } from '@/store/groceryStore';
import { FlatSectionHeader } from './FlatSectionHeader';
import { ItemCard } from './ItemCard';

// ─── Kids' Requests — grouped by who asked, separate from the store-grouped list ──

export function KidRequestsSection({
  kidGroceryGroups, isKid, selectedIds, setSelectedIds, isSelecting, priceMap,
  setDetailItem, handleBuyItem, setEditingItem, setShowAddItem, removeItem,
  members, colors, isDark,
}: {
  kidGroceryGroups: { kid: any; items: GroceryItem[] }[];
  isKid: boolean;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isSelecting: boolean;
  priceMap: Record<string, { price: number | null; unit: string | null; source: 'kroger' | 'estimate' | 'unknown' }>;
  setDetailItem: (item: GroceryItem | null) => void;
  handleBuyItem: (item: GroceryItem) => void;
  setEditingItem: (item: GroceryItem | undefined) => void;
  setShowAddItem: (v: boolean) => void;
  removeItem: (id: string) => void;
  members: any[];
  colors: any; isDark: boolean;
}) {
  if (kidGroceryGroups.length === 0) return null;
  return (
    <View style={{ marginBottom: 20 }}>
      <FlatSectionHeader emoji="🧒" title="Kids' Requests" accent={colors.amber} colors={colors}
        badge={`${kidGroceryGroups.reduce((n, g) => n + g.items.filter(i => !i.isBought).length, 0)} left`} />
      {kidGroceryGroups.map(({ kid, items: kidItems }) => (
        <View key={kid.id} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 13 }}>{kid.emoji ?? '🧒'}</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.amber, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                {kid.name.split(' ')[0]}'s Requests
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!isKid && (
                <Pressable onPress={() => setSelectedIds(prev => {
                  const n = new Set(prev);
                  kidItems.forEach(i => { if (!i.isBought) n.add(i.id); });
                  return n;
                })}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.amber }}>Select All</Text>
                </Pressable>
              )}
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary }}>
                {kidItems.filter(i => !i.isBought).length} left
              </Text>
            </View>
          </View>
          <View>
            {kidItems.map((item, idx) => (
              <ItemCard
                key={item.id}
                item={item}
                members={members}
                selected={selectedIds.has(item.id)}
                selecting={isSelecting}
                isLast={idx === kidItems.length - 1}
                priceInfo={priceMap[item.name]}
                onPress={() => setDetailItem(item)}
                onBuy={() => handleBuyItem(item)}
                onLongPress={() => setSelectedIds(prev => { const n = new Set(prev); n.add(item.id); return n; })}
                onToggleSelect={() => setSelectedIds(prev => {
                  const n = new Set(prev);
                  n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                  return n;
                })}
                onEdit={() => { setDetailItem(null); setEditingItem(item); setShowAddItem(true); }}
                onDelete={isKid ? undefined : () => Alert.alert('Remove item?', `"${item.name}"`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeItem(item.id) },
                ])}
                colors={colors}
                isDark={isDark}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
