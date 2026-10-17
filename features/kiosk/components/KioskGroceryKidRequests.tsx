/**
 * KioskGroceryKidRequests — the parent's "Kid requests" strip on the Shopping
 * list: each pending grocery request from a kid with Accept (adds the items to
 * the list, same as the phone's approve) and Decline. Supplies requests keep
 * their own flow in Chores.
 */
import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useKidRequestStore } from '@/store/kidRequestStore';
import { useGroceryStore } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { KioskAvatar } from './KioskAvatar';
import { Eyebrow, firstName } from './KioskHomeParts';

/** Same marker the phone's supplies requests use to tell them from groceries. */
const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';

export function KioskGroceryKidRequests({ active, members, familyId }: { active: FamilyMember; members: FamilyMember[]; familyId: string }) {
  const { k } = useKioskColors();
  const requests = useKidRequestStore(s => s.requests);
  const approveItems = useKidRequestStore(s => s.approveItems);
  const rejectAllItems = useKidRequestStore(s => s.rejectAllItems);
  const addItem = useGroceryStore(s => s.addItem);

  const pending = useMemo(() => requests.filter(r =>
    r.type === 'delegation' && !r.detail?.startsWith(SUPPLIES_PREFIX) && (r.items ?? []).some(it => it.status === 'pending')), [requests]);
  if (pending.length === 0) return null;

  const accept = async (rid: string) => {
    const r = pending.find(x => x.id === rid); if (!r) return;
    const open = (r.items ?? []).filter(it => it.status === 'pending');
    approveItems(r.id, open.map(it => it.id), active.id);
    for (const it of open) {
      await addItem({ familyId, name: it.name, quantity: it.qty || undefined, category: it.category ?? 'Other', storePreference: it.store, addedBy: r.fromMemberId } as any);
    }
    showToast('Added to the grocery list');
  };

  return (
    <View style={[s.wrap, { backgroundColor: k.pastelPrimary }]}>
      <Eyebrow label="KID REQUESTS" accent={k.terracotta} k={k} right={`${pending.length} waiting`} />
      {pending.map(r => {
        const kid = members.find(m => m.id === r.fromMemberId);
        const open = (r.items ?? []).filter(it => it.status === 'pending');
        return (
          <View key={r.id} style={[s.row, { backgroundColor: k.card }]}>
            <KioskAvatar name={kid?.name ?? 'Kid'} size={32} bgColor={k.pastelPrimaryCard} k={k} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{open.map(it => it.name + (it.qty ? ` · ${it.qty}` : '')).join(', ')}</Text>
              <Text style={[s.meta, { color: k.textMuted }]}>{firstName(kid)} asked</Text>
            </View>
            <Pressable onPress={() => { rejectAllItems(r.id, active.id); showToast('Declined'); }} accessibilityRole="button" style={[s.btn, { backgroundColor: k.well }]}><Text style={[s.btnT, { color: k.text }]}>Decline</Text></Pressable>
            <Pressable onPress={() => accept(r.id)} accessibilityRole="button" style={[s.btn, { backgroundColor: k.primary }]}><Text style={[s.btnT, { color: k.onPrimary }]}>Accept</Text></Pressable>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 22, padding: KIOSK_SPACE.md, gap: KIOSK_SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: 16, padding: 10 },
  name: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  meta: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  btn: { minHeight: 44, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnT: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
});
