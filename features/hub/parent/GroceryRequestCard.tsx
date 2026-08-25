import { View, Text, Pressable } from 'react-native';
import { ShoppingCart, Sparkles, Check, X } from 'lucide-react-native';
import { TYPO } from '@/constants/theme';
import { CollapsibleCard } from '../hubComponents';
import { GROCERY_PREFIX, SUPPLIES_PREFIX, decodeGroceryRequest } from '../KidModals';
import type { FamilyMember } from '@/store/familyStore';

// Money-green — "item approved / added" accent, distinct from brand teal
// used elsewhere in the hub. Not colors.success (which IS brand teal in
// this app) — kept as one local constant.
const MONEY_GREEN = '#10B981';

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
  const allItems = req.items ?? [];
  const pendingItems = allItems.filter((it: any) => it.status === 'pending');
  console.log(`[UserAction] FILTER screen=Hub role=parent member=${active.id} list=GroceryRequestCard.pendingItems on "${req.detail}" (id=${req.id}) totalSource=${allItems.length} afterFilter=${pendingItems.length} [features/hub/parent/GroceryRequestCard.tsx:27]`);
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
                  {item.store ? <Text style={{ fontSize: TYPO.label, color: colors.textTertiary }}>🏪 {item.store}</Text> : null}
                </View>
                {item.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.id} tapped "Add" on item "${item.name}" of request "${req.detail}" (id=${req.id}) → approveItemsAndSync [features/hub/parent/GroceryRequestCard.tsx:88]`); approveItemsAndSync(req.id, [item.id], isSupplies); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: accent + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Check size={11} color={accent} />
                      <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>Add</Text>
                    </Pressable>
                    <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.id} tapped "Reject" on item "${item.name}" of request "${req.detail}" (id=${req.id}) → rejectItems [features/hub/parent/GroceryRequestCard.tsx:93]`); rejectItems(req.id, [item.id], active.id); }}
                      style={{ backgroundColor: `${colors.danger}20`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <X size={11} color={colors.danger} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: item.status === 'approved' ? `${MONEY_GREEN}20` : `${colors.danger}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    {item.status === 'approved' ? <Check size={10} color={MONEY_GREEN} /> : <X size={10} color={colors.danger} />}
                    <Text style={{ fontSize: TYPO.micro, fontWeight: '800', color: item.status === 'approved' ? MONEY_GREEN : colors.danger }}>
                      {item.status === 'approved' ? 'Added' : 'No'}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          {pendingItems.length > 1 && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.id} tapped "Add All" on "${req.detail}" (id=${req.id}) count=${pendingItems.length} → approveItemsAndSync [features/hub/parent/GroceryRequestCard.tsx:111]`); approveItemsAndSync(req.id, pendingItems.map((i: any) => i.id), isSupplies); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: accent + '15', borderWidth: 1, borderColor: accent + '40', paddingVertical: 8, borderRadius: 10 }}>
                <Check size={12} color={accent} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: accent }}>Add All</Text>
              </Pressable>
              <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.id} tapped "Reject All" on "${req.detail}" (id=${req.id}) count=${pendingItems.length} → rejectItems [features/hub/parent/GroceryRequestCard.tsx:116]`); rejectItems(req.id, pendingItems.map((i: any) => i.id), active.id); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: `${colors.danger}15`, borderWidth: 1, borderColor: `${colors.danger}30`, paddingVertical: 8, borderRadius: 10 }}>
                <X size={12} color={colors.danger} />
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.danger }}>Reject All</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.id} tapped "Approve" on "${req.detail}" (id=${req.id}) → approveRequest [features/hub/parent/GroceryRequestCard.tsx:126]`); approveRequest(req.id, active.id); }}
            style={{ flex: 1, backgroundColor: accent, borderRadius: 10,
              paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Check size={14} color="#fff" />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: '#fff' }}>Approve</Text>
          </Pressable>
          <Pressable onPress={() => { console.log(`[UserAction] screen=Hub role=parent member=${active.id} tapped "Decline" on "${req.detail}" (id=${req.id}) → declineRequest [features/hub/parent/GroceryRequestCard.tsx:132]`); declineRequest(req.id, active.id); }}
            style={{ flex: 1, backgroundColor: `${colors.danger}15`, borderWidth: 1,
              borderColor: `${colors.danger}40`, borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <X size={14} color={colors.danger} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: colors.danger }}>Decline</Text>
          </Pressable>
        </View>
      )}
    </CollapsibleCard>
  );
}
