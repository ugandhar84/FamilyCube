import { View, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GroceryItem, useGroceryStore } from '@/store/groceryStore';
import { DEFAULT_GROCERY_STORES } from '@/lib/groceryDefaults';
import { FlatSectionHeader } from './FlatSectionHeader';
import { ItemCard } from './ItemCard';
import { s } from './styles';

// ─── Main store-grouped grocery list (with empty state) ───────────────────────

export function GroceryItemsSection({
  groceryItems, groupedItems, hasSuppliesOrClothing,
  selectedIds, setSelectedIds, isSelecting, priceMap,
  setDetailItem, handleBuyItem, setEditingItem, setShowAddItem, removeItem,
  isKid, members, colors, isDark,
}: {
  groceryItems: GroceryItem[];
  groupedItems: [string, GroceryItem[]][];
  hasSuppliesOrClothing: boolean;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isSelecting: boolean;
  priceMap: Record<string, { price: number | null; unit: string | null; source: 'kroger' | 'estimate' | 'unknown' }>;
  setDetailItem: (item: GroceryItem | null) => void;
  handleBuyItem: (item: GroceryItem) => void;
  setEditingItem: (item: GroceryItem | undefined) => void;
  setShowAddItem: (v: boolean) => void;
  removeItem: (id: string) => void;
  isKid: boolean;
  members: any[];
  colors: any; isDark: boolean;
}) {
  const P = colors.primary;
  const updateItem = useGroceryStore(s => s.updateItem);
  const pastStores = useGroceryStore(s => s.pastStores);

  // Every store currently in play on this list, plus past-run stores and
  // the app defaults — the full pool a "move to store" prompt should offer,
  // not just the handful already grouped here.
  const knownStores = [...new Set([
    ...groupedItems.map(([store]) => store).filter(s => s !== 'Any store'),
    ...pastStores,
    ...DEFAULT_GROCERY_STORES,
  ])];

  const promptMoveStore = (item: GroceryItem) => {
    const others = knownStores.filter(s => s !== item.storePreference);
    Alert.alert(
      'Move to Store',
      `"${item.name}" — pick where it belongs:`,
      [
        ...(item.storePreference ? [{ text: 'Any store (no preference)', onPress: () => updateItem(item.id, { storePreference: undefined }) }] : []),
        ...others.map(store => ({ text: store, onPress: () => updateItem(item.id, { storePreference: store }) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  if (groceryItems.length === 0 && !hasSuppliesOrClothing) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyEmoji}>🛒</Text>
        <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Nothing on the list</Text>
        <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>Tap + to add items or use ✨ AI to suggest.</Text>
      </View>
    );
  }

  if (groceryItems.length === 0) return null;

  return (
    <>
      <FlatSectionHeader emoji="🛒" title="Groceries" accent={colors.success} colors={colors}
        badge={`${groceryItems.filter(i => !i.isBought).length} left`} />
      {groupedItems.map(([store, storeItems]) => (
        <View key={store} style={{ marginBottom: 18 }}>
          {/* Store sub-header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="storefront-outline" size={12} color={P} />
              <Text style={{ fontSize: 11, fontWeight: '800', color: P, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                {store === 'Any store' ? 'Any Store' : store}
              </Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary }}>
              {storeItems.filter(i => !i.isBought).length} left
            </Text>
          </View>
          <View>
            {storeItems.map((item, idx) => (
              <ItemCard
                key={item.id}
                item={item}
                members={members}
                selected={selectedIds.has(item.id)}
                selecting={isSelecting}
                isLast={idx === storeItems.length - 1}
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
                onMoveStore={isKid ? undefined : () => promptMoveStore(item)}
                colors={colors}
                isDark={isDark}
              />
            ))}
          </View>
        </View>
      ))}
    </>
  );
}
