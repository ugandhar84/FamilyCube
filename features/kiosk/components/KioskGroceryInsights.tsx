/**
 * KioskGroceryInsights — the Runs, History and Insights areas of the kiosk
 * Meals & Groceries page, parent-only, in the pastel card rhythm.
 *   · Runs: Active / Planned / Done trip cards with a progress bar, who shops
 *     and the total; "New run" and tapping a card opens the live run sheet.
 *   · History: receipts by date with store, item count, total and the items
 *     grouped under each (same grocery_receipts data as the phone), plus
 *     "return this item" which creates a chore.
 *   · Insights: month spend, average trip, items bought, spend by category and
 *     by store, what the family buys often, and price source counts.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Plus, Store, Undo2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useQuestStore } from '@/store/choreAdapter';
import type { FamilyMember } from '@/store/familyStore';
import type { GroceryItem, GroceryRun } from '@/store/groceryStore';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { kioskPastels, type KioskColors } from '../kioskPalette';
import { Eyebrow, firstName } from './KioskHomeParts';
import { KioskAvatar } from './KioskAvatar';

interface ReceiptItem { name: string; category?: string | null; quantity?: string | null; total_price?: number | null }
interface Receipt { id: string; store: string | null; receipt_date: string | null; total: number | null; grocery_receipt_items?: ReceiptItem[] }
interface Staple { id: string; name: string; times_bought: number; avg_days_between: number | null; last_bought_at: string | null }

const money = (n: number) => `$${n.toFixed(2)}`;
const dayLabel = (iso?: string | null) => (iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown date');
const planLabel = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'No time set');

function useReceipts(familyId: string, on: boolean) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [staples, setStaples] = useState<Staple[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!on || !familyId) return;
    let alive = true;
    Promise.all([
      supabase.from('grocery_receipts').select('id,store,receipt_date,total,grocery_receipt_items(name,category,quantity,total_price)')
        .eq('family_id', familyId).order('receipt_date', { ascending: false }).limit(40),
      supabase.from('grocery_staples').select('id,name,times_bought,avg_days_between,last_bought_at').eq('family_id', familyId).order('times_bought', { ascending: false }).limit(20),
    ]).then(([r, s]) => { if (alive) { setReceipts((r.data ?? []) as Receipt[]); setStaples((s.data ?? []) as Staple[]); setLoading(false); } });
    return () => { alive = false; };
  }, [familyId, on]);
  return { receipts, staples, loading };
}

export function KioskGroceryInsights({ area, familyId, runs, items, boughtItems, members, k, onOpenRun, onNewRun }: {
  area: 'runs' | 'history' | 'insights'; familyId: string; runs: GroceryRun[]; items: GroceryItem[]; boughtItems: GroceryItem[];
  members: FamilyMember[]; k: KioskColors; onOpenRun: (r: GroceryRun) => void; onNewRun: () => void;
}) {
  const pastels = kioskPastels(k);
  const { receipts, staples, loading } = useReceipts(familyId, area !== 'runs');
  const addQuest = useQuestStore().addQuest;
  const memberOf = (id?: string) => members.find(m => m.id === id);

  const header = (title: string, right?: React.ReactNode) => (
    <View style={s.head}><Text style={[s.h1, { color: k.text }]}>{title}</Text><View style={{ flex: 1 }} />{right}</View>
  );

  /* ───────── Runs ───────── */
  if (area === 'runs') {
    const card = (r: GroceryRun, i: number) => {
      const tone = pastels[i % 4];
      const its = r.runItems?.length ?? 0;
      const done = r.runItems?.filter(x => x.checkedInRun).length ?? 0;
      const pct = its ? Math.round((done / its) * 100) : r.status === 'done' ? 100 : 0;
      const shopper = memberOf(r.shopperId);
      const live = r.status === 'active';
      return (
        <View key={r.id} style={[s.rcard, { backgroundColor: tone.col, borderColor: tone.card }]}>
          <View style={s.rtop}>
            <View style={[s.tile, { backgroundColor: tone.card }]}><Store size={20} color={tone.fg} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.rname, { color: k.text }]} numberOfLines={1}>{r.name}</Text>
              <Text style={[s.meta, { color: k.textMuted }]} numberOfLines={1}>{r.store} · {planLabel(r.plannedAt)}</Text>
            </View>
            <View style={[s.pill, { backgroundColor: k.card }]}><Text style={[s.pillT, { color: live ? k.sage : k.textMuted }]}>{live ? '● Live' : r.status === 'draft' ? 'Planned' : 'Done'}</Text></View>
          </View>
          <View style={[s.bar, { backgroundColor: k.card }]}><View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: k.sage }} /></View>
          <View style={s.rmeta}>
            <View style={[s.pill, { backgroundColor: k.card }]}><Text style={[s.pillT, { color: k.textMuted }]}>{done}/{its} items</Text></View>
            {!!shopper && <View style={[s.pill, s.pillRow, { backgroundColor: k.card }]}><KioskAvatar name={shopper.name} size={20} bgColor={tone.card} k={k} /><Text style={[s.pillT, { color: k.textMuted }]}>{firstName(shopper)} shops</Text></View>}
          </View>
          <Pressable onPress={() => onOpenRun(r)} accessibilityRole="button" style={[s.btn, { backgroundColor: k.primary }]}>
            <Text style={[s.btnT, { color: k.onPrimary }]}>{live ? 'Open live run' : r.status === 'draft' ? 'Review items' : 'View run'}</Text>
          </Pressable>
        </View>
      );
    };
    const grp = (label: string, status: GroceryRun['status'], off: number) => {
      const l = runs.filter(r => r.status === status);
      if (!l.length) return null;
      return (
        <View key={status} style={{ gap: 8 }}>
          <Eyebrow label={`${label} · ${l.length}`} accent={k.sage} k={k} />
          <View style={s.grid}>{l.map((r, i) => card(r, i + off))}</View>
        </View>
      );
    };
    return (
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
        {header('Shopping runs', <Pressable onPress={onNewRun} accessibilityRole="button" style={[s.top, { backgroundColor: k.primary }]}><Plus size={18} color={k.onPrimary} strokeWidth={2.5} /><Text style={[s.btnT, { color: k.onPrimary }]}>New run</Text></Pressable>)}
        {runs.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No trips yet. Start a run to shop from the list.</Text> : [grp('ACTIVE', 'active', 0), grp('PLANNED', 'draft', 1), grp('DONE', 'done', 2)]}
      </ScrollView>
    );
  }

  /* ───────── History ───────── */
  if (area === 'history') {
    const returnItem = (it: ReceiptItem, store: string) => {
      const options = members.filter(m => m.role !== 'senior');
      Alert.alert('Return item', `Who will return "${it.name}" to ${store || 'the store'}?`, [
        ...options.map(m => ({ text: m.name.split(' ')[0], onPress: () => {
          addQuest({ title: `Return ${it.name} to ${store || 'store'}`, description: `Item: ${it.name}${it.quantity ? ` (${it.quantity})` : ''}\nFrom a receipt`, category: 'Shopping', priority: 'medium', status: 'todo',
            assignedToId: m.id, assignedToIds: [m.id], dueDate: undefined, coins: 10, xpReward: 0, recurrence: 'once', isPool: false, isAdultTask: false, photoRequired: false, isDaily: false } as any);
          showToast(`${m.name.split(' ')[0]} will return ${it.name}`);
        } })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    };
    return (
      <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
        {header('Purchase history', <View style={[s.pill, { backgroundColor: k.well }]}><Text style={[s.pillT, { color: k.textMuted }]}>Last {receipts.length || 30} receipts</Text></View>)}
        {loading ? <ActivityIndicator color={k.gold} style={{ marginTop: KIOSK_SPACE.xl }} />
          : receipts.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>No receipts yet. Scan a receipt to track spending and learn your staples.</Text>
          : receipts.map((r, i) => {
            const tone = pastels[i % 4];
            const its = r.grocery_receipt_items ?? [];
            return (
              <View key={r.id} style={[s.hist, { backgroundColor: tone.col, borderColor: tone.card }]}>
                <View style={s.hh}>
                  <Text style={[s.rname, { color: k.text }]}>{dayLabel(r.receipt_date)}</Text>
                  <Text style={[s.meta, { color: k.textMuted, flex: 1 }]} numberOfLines={1}>{r.store ?? 'Unknown store'}</Text>
                  <View style={[s.pill, { backgroundColor: k.card }]}><Text style={[s.pillT, { color: k.textMuted }]}>{its.length} items</Text></View>
                  <View style={[s.pill, { backgroundColor: k.pastelSageCard }]}><Text style={[s.pillT, { color: k.sage }]}>{money(r.total ?? 0)}</Text></View>
                </View>
                {its.map((it, j) => (
                  <View key={j} style={[s.hrow, { backgroundColor: k.card }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.iname, { color: k.text }]} numberOfLines={1}>{it.name}</Text>
                      <Text style={[s.meta, { color: k.textMuted }]}>{[it.quantity, it.category].filter(Boolean).join(' · ') || 'From the receipt'}</Text>
                    </View>
                    <Text style={[s.iname, { color: k.text }]}>{money(it.total_price ?? 0)}</Text>
                    <Pressable onPress={() => returnItem(it, r.store ?? '')} accessibilityRole="button" accessibilityLabel={`Return ${it.name}`} style={[s.ret, { backgroundColor: k.pastelAmberCard }]}><Undo2 size={16} color={k.gold} /></Pressable>
                  </View>
                ))}
              </View>
            );
          })}
      </ScrollView>
    );
  }

  /* ───────── Insights ───────── */
  const now = new Date();
  const month = receipts.filter(r => r.receipt_date && new Date(r.receipt_date).getMonth() === now.getMonth() && new Date(r.receipt_date).getFullYear() === now.getFullYear());
  const spent = month.reduce((n, r) => n + (r.total ?? 0), 0);
  const avg = month.length ? spent / month.length : 0;
  const allItems = receipts.flatMap(r => r.grocery_receipt_items ?? []);
  const byCat: Record<string, number> = {}; const byStore: Record<string, number> = {};
  allItems.forEach(it => { const c = it.category || 'Other'; byCat[c] = (byCat[c] ?? 0) + (it.total_price ?? 0); });
  receipts.forEach(r => { const st = r.store || 'Unknown'; byStore[st] = (byStore[st] ?? 0) + (r.total ?? 0); });
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const priced = [...items, ...boughtItems].filter(i => i.estimatedPrice != null);
  const fromReceipt = priced.filter(i => i.priceSource === 'receipt').length;
  const bars = (rows: [string, number][], offset: number, label: string, accent: string) => {
    const mx = Math.max(...rows.map(r => r[1]), 1);
    return (
      <View style={[s.chart, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
        <Eyebrow label={label} accent={accent} k={k} />
        {rows.length === 0 ? <Text style={[s.meta, { color: k.textMuted }]}>Not enough data yet.</Text> : rows.map(([n, v], i) => (
          <View key={n} style={s.brow}>
            <Text style={[s.bl, { color: k.text }]} numberOfLines={1}>{n}</Text>
            <View style={[s.track, { backgroundColor: k.well }]}><View style={{ width: `${(v / mx) * 100}%`, height: '100%', borderRadius: 7, backgroundColor: pastels[(i + offset) % 4].fg }} /></View>
            <Text style={[s.bv, { color: k.text }]}>{money(v)}</Text>
          </View>
        ))}
      </View>
    );
  };
  const stat = (v: string, l: string, i: number) => (
    <View key={l} style={[s.stat, { backgroundColor: pastels[i].col, borderColor: pastels[i].card }]}><Text style={[s.sv, { color: k.text }]}>{v}</Text><Text style={[s.meta, { color: k.textMuted }]}>{l}</Text></View>
  );
  return (
    <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
      {header('Spending insights', <View style={[s.pill, { backgroundColor: k.well }]}><Text style={[s.pillT, { color: k.textMuted }]}>{now.toLocaleDateString('en-US', { month: 'long' })}</Text></View>)}
      {loading ? <ActivityIndicator color={k.gold} style={{ marginTop: KIOSK_SPACE.xl }} /> : receipts.length === 0 && staples.length === 0
        ? <Text style={[s.empty, { color: k.textMuted }]}>No insights yet. Scan receipts to start tracking what you buy.</Text> : (
        <>
          <View style={s.stats}>
            {stat(money(spent), 'spent this month', 1)}{stat(money(avg), 'average trip', 3)}{stat(String(allItems.length), 'items on receipts', 2)}{stat(String(month.length), 'trips this month', 0)}
          </View>
          <View style={s.two}>{bars(top(byCat), 0, 'BY CATEGORY', k.gold)}{bars(top(byStore), 2, 'BY STORE', k.purple)}</View>
          {bars(receipts.slice(0, 6).map(r => [dayLabel(r.receipt_date), r.total ?? 0] as [string, number]), 1, 'SPENDING BY TRIP', k.sage)}
          {staples.length > 0 && (
            <View style={[s.chart, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
              <Eyebrow label="WHAT WE BUY OFTEN" accent={k.primary} k={k} />
              {staples.slice(0, 8).map(st => {
                const days = st.last_bought_at ? Math.floor((Date.now() - new Date(st.last_bought_at).getTime()) / 86_400_000) : null;
                return (
                  <View key={st.id} style={s.srow}>
                    <Text style={[s.iname, { color: k.text, flex: 1 }]} numberOfLines={1}>{st.name} · {st.times_bought} runs</Text>
                    <Text style={[s.meta, { color: k.textMuted }]}>{[days != null ? `${days}d ago` : '', st.avg_days_between ? `every ${Math.round(st.avg_days_between)} days` : ''].filter(Boolean).join(' · ')}</Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={[s.chart, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
            <Eyebrow label="PRICE SOURCE" accent={k.sage} k={k} />
            <View style={s.stats}>
              <View style={[s.pill, { backgroundColor: k.pastelSageCard }]}><Text style={[s.pillT, { color: k.sage }]}>Receipt · {fromReceipt} items</Text></View>
              <View style={[s.pill, { backgroundColor: k.well }]}><Text style={[s.pillT, { color: k.textMuted }]}>Estimate · {priced.length - fromReceipt} items</Text></View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: KIOSK_SPACE.xl, paddingBottom: 120, gap: KIOSK_SPACE.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: KIOSK_RADIUS.md, paddingHorizontal: 18 },
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  rcard: { flexGrow: 1, flexBasis: 330, borderRadius: 26, borderWidth: 1.5, padding: 16, gap: 10 },
  rtop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rname: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800' },
  meta: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  pill: { borderRadius: 100, paddingHorizontal: 11, paddingVertical: 5 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillT: { fontSize: 12, fontWeight: '800' },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  rmeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { minHeight: 48, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  btnT: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  hist: { borderRadius: 24, borderWidth: 1.5, padding: 14, gap: 8 },
  hh: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hrow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  iname: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  ret: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  stat: { flexGrow: 1, flexBasis: 170, borderRadius: 22, borderWidth: 1.5, padding: 16, gap: 2 },
  sv: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  two: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.md },
  chart: { flexGrow: 1, flexBasis: 360, borderRadius: 24, borderWidth: 1.5, padding: 16, gap: 10 },
  brow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bl: { width: 120, fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  track: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  bv: { width: 76, textAlign: 'right', fontSize: KIOSK_TYPO.label, fontWeight: '800' },
  srow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
