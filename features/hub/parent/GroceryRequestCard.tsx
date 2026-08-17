import { View, Text, Pressable } from 'react-native';
import { ShoppingCart, Sparkles, Check, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { GROCERY_PREFIX, SUPPLIES_PREFIX, decodeGroceryRequest } from '../KidModals';
import type { FamilyMember } from '@/store/familyStore';

// Grocery / supplies request — item-level approve/reject when the request
// carries an items[] list, or a plain approve/decline when it doesn't.
export function GroceryRequestCard({
  req, kidName, isGrocery, isSupplies, accent, active, colors, isDark,
  approveItemsAndSync, rejectItems, approveRequest, declineRequest,
}: {
  req: any; kidName: string; isGrocery: boolean; isSupplies: boolean; accent: string;
  active: FamilyMember; colors: any; isDark: boolean;
  approveItemsAndSync: (reqId: string, itemIds: string[], isSupplies: boolean) => void;
  rejectItems: (reqId: string, itemIds: string[], by: string) => void;
  approveRequest: (id: string, by: string) => void;
  declineRequest: (id: string, by: string) => void;
}) {
  const pendingItems = (req.items ?? []).filter((it: any) => it.status === 'pending');
  const hasItems = (req.items ?? []).length > 0;
  const decodedGrocery = !hasItems && req.detail.startsWith(GROCERY_PREFIX) ? decodeGroceryRequest(req.detail) : null;
  const rawDetailText = !hasItems && !decodedGrocery && req.detail && req.detail !== SUPPLIES_PREFIX && req.detail !== GROCERY_PREFIX
    ? req.detail.replace(SUPPLIES_PREFIX, '').trim()
    : null;

  return (
    <CollapsibleCard accent={accent} colors={colors} isDark={isDark}
      defaultExpanded={isGrocery} // Grocery expanded by default, Supplies collapsed
      summary={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
            {isGrocery ? <ShoppingCart size={14} color={accent} /> : <Sparkles size={14} color={accent} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: accent }} numberOfLines={1}>
              {isGrocery ? 'Grocery' : 'Supplies'} — {kidName}
            </Text>
            <Text style={{ fontSize: TYPO.label, color: accent, opacity: 0.8 }}>
              {req.items?.length ?? 0} items · {pendingItems.length} pending
            </Text>
          </View>
          <View style={{ backgroundColor: accent + '30', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: accent }}>Pending</Text>
          </View>
        </View>
      }>
      {decodedGrocery && (
        <View style={{ marginBottom: 10, borderRadius: 12, padding: 12,
          backgroundColor: isDark ? '#1e293b' : '#fff',
          borderLeftWidth: 3, borderLeftColor: accent }}>
          <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>
            {decodedGrocery.name}{decodedGrocery.qty ? ` × ${decodedGrocery.qty}` : ''}
          </Text>
          {decodedGrocery.notes ? (
            <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, marginTop: 2 }}>"{decodedGrocery.notes}"</Text>
          ) : null}
        </View>
      )}
      {rawDetailText && (
        <View style={{ marginBottom: 10, borderRadius: 12, padding: 12,
          backgroundColor: isDark ? '#1e293b' : '#fff',
          borderLeftWidth: 3, borderLeftColor: accent }}>
          <Text style={{ fontSize: TYPO.caption, color: colors.textPrimary }}>
            "{rawDetailText}"
          </Text>
        </View>
      )}

      {(req.items ?? []).length > 0 ? (
        <>
          <View style={{ gap: 6, marginBottom: 8 }}>
            {req.items.map((item: any) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: isDark ? '#1e293b' : '#F8FAFC', borderRadius: 10, padding: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{item.name}</Text>
                  {item.qty ? <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Qty: {item.qty}</Text> : null}
                </View>
                {item.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable onPress={() => approveItemsAndSync(req.id, [item.id], isSupplies)}
                      style={{ backgroundColor: accent + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>✓ Add</Text>
                    </Pressable>
                    <Pressable onPress={() => rejectItems(req.id, [item.id], active.id)}
                      style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>✕</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ backgroundColor: item.status === 'approved' ? '#10B98120' : '#EF444420', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: item.status === 'approved' ? '#10B981' : '#EF4444' }}>
                      {item.status === 'approved' ? '✓ Added' : '✕ No'}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          {pendingItems.length > 1 && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => approveItemsAndSync(req.id, pendingItems.map((i: any) => i.id), isSupplies)}
                style={{ flex: 1, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '40', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>Add All</Text>
              </Pressable>
              <Pressable onPress={() => rejectItems(req.id, pendingItems.map((i: any) => i.id), active.id)}
                style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444430', paddingVertical: 8, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: '#EF4444' }}>Reject All</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => approveRequest(req.id, active.id)}
            style={{ flex: 1, backgroundColor: accent, borderRadius: 10,
              paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Check size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Approve</Text>
          </Pressable>
          <Pressable onPress={() => declineRequest(req.id, active.id)}
            style={{ flex: 1, backgroundColor: '#EF444415', borderWidth: 1,
              borderColor: '#EF444440', borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <X size={14} color="#EF4444" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#EF4444' }}>Decline</Text>
          </Pressable>
        </View>
      )}
    </CollapsibleCard>
  );
}
