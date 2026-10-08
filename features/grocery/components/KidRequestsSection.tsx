import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { GroceryItem, useGroceryStore } from '@/store/groceryStore';

// ─── Kid Requests — Figma coral card with Accept / Decline ───────────────────

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
  priceMap: Record<string, { price: number | null; unit: string | null; source: 'kroger' | 'receipt' | 'estimate' | 'unrecognized' | 'unknown' }>;
  setDetailItem: (item: GroceryItem | null) => void;
  handleBuyItem: (item: GroceryItem) => void;
  setEditingItem: (item: GroceryItem | undefined) => void;
  setShowAddItem: (v: boolean) => void;
  removeItem: (id: string) => void;
  members: any[];
  colors: any; isDark: boolean;
}) {
  const addItem = useGroceryStore(s => s.addItem);

  if (kidGroceryGroups.length === 0) return null;

  const P = colors.primary;

  return (
    <View style={{ gap: 10, marginBottom: 8 }}>
      {kidGroceryGroups.map(({ kid, items: kidItems }) =>
        kidItems.filter(i => !i.isBought).map(item => {
          const priceInfo = priceMap[item.name];
          const priceStr = priceInfo?.price != null
            ? `$${priceInfo.price.toFixed(2)} estimate`
            : item.estimatedPrice != null
              ? `$${item.estimatedPrice.toFixed(2)} estimate`
              : null;

          return (
            // Figma: coral salmon card per pending kid request
            <View key={item.id} style={{
              backgroundColor: colors.primaryLight,
              borderRadius: 16, padding: 16, gap: 12,
            }}>
              {/* "Leo requested · needs your decision" pill */}
              <View style={{ alignSelf: 'flex-start', backgroundColor: P + '20', borderRadius: 100,
                paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: P }}>
                  {kid.name.split(' ')[0]} requested · needs your decision
                </Text>
              </View>

              {/* Item name + subtitle */}
              <View style={{ gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                  {[priceStr, 'not approved or in shopping run'].filter(Boolean).join(' · ')}
                </Text>
              </View>

              {/* Accept / Decline buttons */}
              {!isKid && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      // Accept: move from kid request to shared approved list
                      Alert.alert(
                        'Accept request?',
                        `Add "${item.name}" to the shared list?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Accept', onPress: () => removeItem(item.id) },
                        ],
                      );
                    }}
                    style={({ pressed }) => ({
                      flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
                      backgroundColor: pressed ? P + 'CC' : P,
                    })}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        'Decline request?',
                        `"${item.name}" will be moved to request history.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Decline', style: 'destructive', onPress: () => removeItem(item.id) },
                        ],
                      );
                    }}
                    style={({ pressed }) => ({
                      flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
                      backgroundColor: pressed ? colors.surface : '#FFFFFF',
                      borderWidth: 1, borderColor: colors.border,
                    })}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Decline</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}
