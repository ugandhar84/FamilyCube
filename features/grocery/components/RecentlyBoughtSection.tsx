import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GroceryItem } from '@/store/groceryStore';

// ─── ✅ Recently Bought ─────────────────────────────────────────────────────

export function RecentlyBoughtSection({
  boughtItems, boughtExpanded, setBoughtExpanded,
  returnMode, setReturnMode, returnIds, setReturnIds,
  isKid, members, colors, isDark,
}: {
  boughtItems: GroceryItem[];
  boughtExpanded: boolean;
  setBoughtExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  returnMode: boolean;
  setReturnMode: React.Dispatch<React.SetStateAction<boolean>>;
  returnIds: Set<string>;
  setReturnIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isKid: boolean;
  members: any[];
  colors: any; isDark: boolean;
}) {
  if (boughtItems.length === 0) return null;

  return (
    <View style={{ marginTop: 4, marginBottom: 8 }}>
      {/* Header row: expand toggle + Return button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => { setBoughtExpanded(e => !e); if (returnMode) { setReturnMode(false); setReturnIds(new Set()); } }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, flex: 1 }}>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: colors.success + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15 }}>✅</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>Recently Bought</Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>Last 7 days · {boughtItems.length} items</Text>
          </View>
          <Text style={{ fontSize: 14, color: colors.textTertiary }}>{boughtExpanded ? '▲' : '▼'}</Text>
        </Pressable>
        {boughtExpanded && !isKid && (
          <Pressable onPress={() => { setBoughtExpanded(true); setReturnMode(r => !r); setReturnIds(new Set()); }}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
              backgroundColor: returnMode ? colors.warning + '20' : colors.warningLight,
              borderWidth: 1, borderColor: colors.warning }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warningDark }}>
              {returnMode ? 'Cancel' : '↩️ Return'}
            </Text>
          </Pressable>
        )}
      </View>

      {boughtExpanded && (
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
      )}
      {boughtExpanded && (
        <View>
          {boughtItems.map((item, idx) => {
            const buyer = members.find(m => m.id === item.boughtBy);
            const when  = item.boughtAt ? new Date(item.boughtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
            const isReturning = item.isReturning;
            const isChecked   = returnIds.has(item.id);
            return (
              <Pressable key={item.id}
                onPress={() => {
                  if (!returnMode || isReturning) return;
                  setReturnIds(prev => {
                    const n = new Set(prev);
                    n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                    return n;
                  });
                }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                  borderBottomWidth: idx < boughtItems.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.border,
                  backgroundColor: isChecked ? colors.warningLight : 'transparent' }}>
                {/* Left indicator */}
                {returnMode && !isReturning ? (
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                    borderColor: isChecked ? colors.warning : colors.border,
                    backgroundColor: isChecked ? colors.warning : 'transparent',
                    alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    {isChecked && <Text style={{ fontSize: 13, color: colors.textInverse, fontWeight: '700' }}>✓</Text>}
                  </View>
                ) : (
                  <View style={{ width: 22, height: 22, borderRadius: 11,
                    backgroundColor: isReturning ? colors.warning : colors.success,
                    alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.textInverse }}>{isReturning ? '↩' : '✓'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, textDecorationLine: 'line-through' }}>
                    {item.name}{item.quantity ? ` × ${item.quantity}` : ''}
                  </Text>
                  <Text style={{ fontSize: 11, color: isReturning ? colors.warningDark : colors.textTertiary, marginTop: 2 }}>
                    {isReturning ? '🔄 Return pending' : `${buyer ? buyer.name.split(' ')[0] + ' · ' : ''}${when}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
