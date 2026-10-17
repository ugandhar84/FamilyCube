/**
 * KioskNewRunDrawer — start a shopping run from the kiosk, same call as the
 * phone's CreateRunSheet (groceryStore.createRun): a store, a name, who is
 * shopping and an optional planned start. Items already tagged with that
 * store join the trip automatically; kid requests that are still pending stay out.
 */
import { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Truck } from 'lucide-react-native';
import { useGroceryStore, type GroceryRun } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskFormDrawer, KioskFieldLabel, kioskInputStyle } from './KioskFormDrawer';
import { KioskAvatar } from './KioskAvatar';

const DEFAULT_STORES = ['Costco', 'Walmart', 'Whole Foods', "Trader Joe's", 'Aldi', 'Target', 'Kroger'];

function plannedChoices() {
  const at = (addDays: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, 0, 0, 0); return d; };
  const nextDow = (dow: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7)); d.setHours(h, 0, 0, 0); return d; };
  const fmt = (d: Date, lead: string) => `${lead} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  const a = at(0, 17), b = at(1, 10), c = nextDow(6, 10), e = nextDow(0, 14);
  return [{ label: fmt(a, 'Today'), d: a }, { label: fmt(b, 'Tomorrow'), d: b }, { label: fmt(c, 'Sat'), d: c }, { label: fmt(e, 'Sun'), d: e }];
}

export function KioskNewRunDrawer({ visible, onClose, familyId, active, members, pendingCount, onCreated }: {
  visible: boolean; onClose: () => void; familyId: string; active: FamilyMember; members: FamilyMember[];
  pendingCount: number; onCreated: (r: GroceryRun) => void;
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const createRun = useGroceryStore(s => s.createRun);
  const pastStores = useGroceryStore(s => s.pastStores);
  const pinned = useGroceryStore(s => s.pinnedStores);
  const stores = useMemo(() => [...new Set([...Object.keys(pinned ?? {}), ...pastStores, ...DEFAULT_STORES])].slice(0, 9), [pinned, pastStores]);
  const shoppers = members.filter(m => m.role === 'parent' || m.role === 'teen' || m.role === 'senior');
  const choices = useMemo(plannedChoices, [visible]);
  const [store, setStore] = useState('');
  const [name, setName] = useState('');
  const [shopper, setShopper] = useState(active.id);
  const [plan, setPlan] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!store.trim() || saving) return;
    setSaving(true);
    const run = await createRun({ familyId, name: name.trim() || `${store.trim()} trip`, store: store.trim(), createdBy: active.id, shopperId: shopper, plannedAt: plan != null ? choices[plan].d.toISOString() : undefined });
    setSaving(false);
    if (!run) { showToast('Could not create the run. Try again.'); return; }
    setStore(''); setName(''); setPlan(null);
    showToast(`${run.name} created`);
    onCreated(run);
  };
  const chip = (label: string, on: boolean, press: () => void, i: number, avatar?: FamilyMember) => (
    <Pressable key={label} onPress={press} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, { backgroundColor: on ? k.primary : pastels[i % 4].card }]}>
      {avatar && <KioskAvatar name={avatar.name} size={26} bgColor={k.card} k={k} />}
      <Text style={[s.chipT, { color: on ? k.onPrimary : pastels[i % 4].fg }]}>{label}</Text>
    </Pressable>
  );

  return (
    <KioskFormDrawer visible={visible} variant="drawer" title="New shopping run" subtitle="Pick the store, the shopper and the time" accent={k.sage} Icon={Truck} k={k}
      onClose={onClose} submitLabel="Create run" onSubmit={save} canSubmit={!!store.trim()} submitting={saving}>
      <View style={{ gap: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.xl }}>
        <View style={{ gap: 6 }}>
          <KioskFieldLabel k={k}>STORE</KioskFieldLabel>
          <View style={s.wrap}>{stores.map((st, i) => chip(st, store === st, () => setStore(st), i))}</View>
          <TextInput value={store} onChangeText={setStore} placeholder="Or type a store" placeholderTextColor={k.textFaint} style={[kioskInputStyle(k), { color: k.text }]} />
        </View>
        <View style={{ gap: 6 }}>
          <KioskFieldLabel k={k}>RUN NAME</KioskFieldLabel>
          <TextInput value={name} onChangeText={setName} placeholder="Weekly shop" placeholderTextColor={k.textFaint} style={[kioskInputStyle(k), { color: k.text }]} />
        </View>
        <View style={{ gap: 6 }}>
          <KioskFieldLabel k={k}>WHO IS SHOPPING</KioskFieldLabel>
          <View style={s.wrap}>{shoppers.map((m, i) => chip(m.name.split(' ')[0], shopper === m.id, () => setShopper(m.id), i + 1, m))}</View>
        </View>
        <View style={{ gap: 6 }}>
          <KioskFieldLabel k={k}>PLANNED FOR</KioskFieldLabel>
          <View style={s.wrap}>
            {choices.map((c, i) => chip(c.label, plan === i, () => setPlan(plan === i ? null : i), i + 2))}
          </View>
        </View>
        {pendingCount > 0 && <Text style={[s.note, { color: k.textMuted }]}>{pendingCount} kid request{pendingCount === 1 ? '' : 's'} still waiting stay out of the run.</Text>}
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 100, paddingHorizontal: 16 },
  chipT: { fontSize: KIOSK_TYPO.caption, fontWeight: '800' },
  note: { fontSize: KIOSK_TYPO.label, fontWeight: '700', borderRadius: KIOSK_RADIUS.md },
});
