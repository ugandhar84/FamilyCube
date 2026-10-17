/**
 * KioskGroceryInsights — the parent-only Runs, History and Insights areas of the
 * kiosk Meals & Groceries page, built from the live groceryStore (runs, items).
 *   · runs: draft/active trips; tap one to open its live item list
 *   · history: completed trips and everything bought, newest first
 *   · insights: estimated spend, busiest stores, most-bought items, who shops
 */
import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { FamilyMember } from '@/store/familyStore';
import type { GroceryItem, GroceryRun } from '@/store/groceryStore';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { kioskPastels, type KioskColors } from '../kioskPalette';
import { Eyebrow, firstName } from './KioskHomeParts';

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const money = (n: number) => `$${n.toFixed(2)}`;
const top = (counts: Record<string, number>, n = 5) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);

export function KioskGroceryInsights({ area, runs, items, boughtItems, members, k, onOpenRun }: {
  area: 'runs' | 'history' | 'insights'; runs: GroceryRun[]; items: GroceryItem[]; boughtItems: GroceryItem[];
  members: FamilyMember[]; k: KioskColors; onOpenRun: (r: GroceryRun) => void;
}) {
  const pastels = kioskPastels(k);
  const bought = useMemo(() => {
    const map = new Map<string, GroceryItem>();
    [...items.filter(i => i.isBought), ...boughtItems].forEach(i => map.set(i.id, i));
    return [...map.values()].sort((a, b) => (b.boughtAt ?? '').localeCompare(a.boughtAt ?? ''));
  }, [items, boughtItems]);
  const nameOf = (id?: string) => firstName(members.find(m => m.id === id));

  const Title = ({ t, sub }: { t: string; sub: string }) => (
    <View style={{ gap: 2 }}><Text style={[s.title, { color: k.text }]}>{t}</Text><Text style={[s.sub, { color: k.textMuted }]}>{sub}</Text></View>
  );

  if (area === 'runs') {
    const open = runs.filter(r => r.status !== 'done');
    return (
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
        <Title t="Shopping runs" sub="Trips planned or happening now. Tap one to see its live list." />
        {open.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No trips planned. Start a run from the phone.</Text>
          : open.map((r, i) => {
            const tone = pastels[i % pastels.length];
            const live = r.status === 'active';
            return (
              <Pressable key={r.id} onPress={() => onOpenRun(r)} accessibilityRole="button" accessibilityLabel={`${r.store} run`}
                style={({ pressed }) => [s.row, { backgroundColor: live ? k.pastelSage : tone.col, borderColor: live ? k.pastelSageCard : tone.card }, pressed && { opacity: 0.8 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.rowTitle, { color: k.text }]} numberOfLines={1}>{r.name || r.store}</Text>
                  <Text style={[s.rowMeta, { color: k.textMuted }]} numberOfLines={1}>{[r.store, r.shopperId ? `Shopper ${nameOf(r.shopperId)}` : '', r.plannedAt ? fmtDate(r.plannedAt) : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={[s.pill, { backgroundColor: live ? k.sage : k.well }]}><Text style={[s.pillText, { color: live ? k.onAccent : k.textMuted }]}>{live ? 'Shopping now' : 'Planned'}</Text></View>
              </Pressable>
            );
          })}
      </ScrollView>
    );
  }

  if (area === 'history') {
    const done = runs.filter(r => r.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return (
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
        <Title t="History" sub="Finished trips and everything bought." />
        <Eyebrow label="COMPLETED TRIPS" accent={k.sage} k={k} />
        {done.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No finished trips yet.</Text>
          : done.map(r => (
            <Pressable key={r.id} onPress={() => onOpenRun(r)} accessibilityRole="button" style={[s.row, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
              <View style={{ flex: 1 }}><Text style={[s.rowTitle, { color: k.text }]}>{r.name || r.store}</Text><Text style={[s.rowMeta, { color: k.textMuted }]}>{[r.store, fmtDate(r.completedAt)].filter(Boolean).join(' · ')}</Text></View>
            </Pressable>
          ))}
        <Eyebrow label="BOUGHT" accent={k.gold} k={k} />
        {bought.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>Nothing bought yet.</Text>
          : bought.slice(0, 60).map(i => (
            <View key={i.id} style={[s.row, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
              <View style={{ flex: 1 }}><Text style={[s.rowTitle, { color: k.text }]} numberOfLines={1}>{i.name}{i.quantity ? ` × ${i.quantity}` : ''}</Text>
                <Text style={[s.rowMeta, { color: k.textMuted }]}>{[nameOf(i.boughtBy), fmtDate(i.boughtAt), i.storePreference].filter(Boolean).join(' · ')}</Text></View>
              {i.estimatedPrice != null && <Text style={[s.rowTitle, { color: k.text }]}>{money(i.estimatedPrice)}</Text>}
            </View>
          ))}
      </ScrollView>
    );
  }

  const spent = bought.reduce((n, i) => n + (i.estimatedPrice ?? 0), 0);
  const byStore: Record<string, number> = {}; const byName: Record<string, number> = {}; const byWho: Record<string, number> = {};
  bought.forEach(i => {
    if (i.storePreference) byStore[i.storePreference] = (byStore[i.storePreference] ?? 0) + 1;
    byName[i.name.toLowerCase()] = (byName[i.name.toLowerCase()] ?? 0) + 1;
    if (i.boughtBy) byWho[i.boughtBy] = (byWho[i.boughtBy] ?? 0) + 1;
  });
  const stat = (label: string, value: string, i: number) => (
    <View key={label} style={[s.stat, { backgroundColor: pastels[i].col, borderColor: pastels[i].card }]}>
      <Text style={[s.sLabel, { color: k.textMuted }]}>{label}</Text><Text style={[s.sValue, { color: k.text }]}>{value}</Text>
    </View>
  );
  const board = (label: string, rows: [string, number][], i: number, fmt?: (key: string) => string) => (
    <View key={label} style={[s.board, { backgroundColor: pastels[i].col, borderColor: pastels[i].card }]}>
      <Text style={[s.sLabel, { color: k.textMuted }]}>{label}</Text>
      {rows.length === 0 ? <Text style={[s.rowMeta, { color: k.textMuted }]}>Not enough data yet.</Text>
        : rows.map(([key, n]) => <View key={key} style={s.bRow}><Text style={[s.rowTitle, { color: k.text, flex: 1 }]} numberOfLines={1}>{fmt ? fmt(key) : key}</Text><Text style={[s.rowMeta, { color: k.textMuted }]}>{n}</Text></View>)}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
      <Title t="Insights" sub="What the family buys and where." />
      <View style={s.stats}>
        {stat('ITEMS BOUGHT', String(bought.length), 0)}
        {stat('ESTIMATED SPEND', money(spent), 1)}
        {stat('TRIPS DONE', String(runs.filter(r => r.status === 'done').length), 2)}
        {stat('ON THE LIST', String(items.filter(i => !i.isBought).length), 3)}
      </View>
      <View style={s.stats}>
        {board('MOST-BOUGHT ITEMS', top(byName), 0)}
        {board('BUSIEST STORES', top(byStore), 1)}
        {board('WHO SHOPS', top(byWho), 2, nameOf)}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: KIOSK_SPACE.xl, gap: KIOSK_SPACE.sm, paddingBottom: 120 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  sub: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', paddingVertical: KIOSK_SPACE.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, borderRadius: KIOSK_RADIUS.lg, borderWidth: 1.5, padding: 14 },
  rowTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  rowMeta: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  pill: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  stat: { flexGrow: 1, flexBasis: 160, borderRadius: KIOSK_RADIUS.xl, borderWidth: 1.5, padding: 16, gap: 4 },
  sLabel: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1 },
  sValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  board: { flexGrow: 1, flexBasis: 220, borderRadius: KIOSK_RADIUS.xl, borderWidth: 1.5, padding: 16, gap: 8 },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
