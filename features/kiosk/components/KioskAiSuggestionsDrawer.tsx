/**
 * KioskAiSuggestionsDrawer — the phone's "AI add suggestions" and "Smart
 * restock" in one right-side drawer. Same data and rules as the phone:
 *   · 'ai'      — recent receipts + staples go to ask-cube, which returns up to
 *                 12 suggestions with a reason; falls back to staples, then to
 *                 past item names. Items already on the list are skipped.
 *   · 'restock' — staples (auto_suggest) that are overdue by their usual
 *                 buying interval.
 * Tap a row to select it; "Add N to list" adds them (AI ones flagged aiGenerated).
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Sparkles, Repeat, Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useGroceryStore, type GroceryItem } from '@/store/groceryStore';
import { showToast } from '@/components/AppToast';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS } from '../kioskTheme';
import { useKioskColors, kioskPastels } from '../kioskPalette';
import { KioskFormDrawer } from './KioskFormDrawer';

interface Sug { name: string; quantity: string; price: number | null; reason: string; on: boolean; dupe: boolean; category?: string }

export function KioskAiSuggestionsDrawer({ visible, mode, onClose, familyId, memberId, existingItems }: {
  visible: boolean; mode: 'ai' | 'restock'; onClose: () => void; familyId: string; memberId: string; existingItems: GroceryItem[];
}) {
  const { k } = useKioskColors();
  const pastels = kioskPastels(k);
  const addItem = useGroceryStore(s => s.addItem);
  const pastItemNames = useGroceryStore(s => s.pastItemNames);
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !familyId) return;
    let alive = true;
    setLoading(true); setSugs([]);
    const have = new Set(existingItems.filter(i => !i.isBought).map(i => i.name.toLowerCase()));
    const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    (async () => {
      let built: Sug[] = [];
      try {
        if (mode === 'restock') {
          const { data } = await supabase.from('grocery_staples').select('id,name,category,avg_days_between,last_bought_at,times_bought')
            .eq('family_id', familyId).eq('auto_suggest', true).order('times_bought', { ascending: false }).limit(20);
          built = (data ?? []).filter((s: any) => s.last_bought_at && s.avg_days_between && daysSince(s.last_bought_at) >= s.avg_days_between)
            .map((s: any) => ({
              name: s.name, quantity: '1', price: null, category: s.category, dupe: have.has(s.name.toLowerCase()),
              on: !have.has(s.name.toLowerCase()),
              reason: `Bought every ${Math.round(s.avg_days_between)} days · last ${daysSince(s.last_bought_at)} days ago.`,
            }));
        } else {
          const since = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
          const [rec, stp] = await Promise.all([
            supabase.from('grocery_receipt_items').select('name, category, quantity, total_price, grocery_receipts!inner(receipt_date, store)')
              .eq('family_id', familyId).gte('grocery_receipts.receipt_date', since).limit(60),
            supabase.from('grocery_staples').select('name, times_bought, avg_days_between, last_bought_at, avg_unit_price, category')
              .eq('family_id', familyId).order('times_bought', { ascending: false }).limit(30),
          ]);
          const receiptItems = rec.data ?? []; const staples = stp.data ?? [];
          if (receiptItems.length > 0) {
            const agg: Record<string, { count: number; lastDate: string; prices: number[] }> = {};
            for (const ri of receiptItems as any[]) {
              const key = ri.name.toLowerCase(); const r = ri.grocery_receipts;
              agg[key] = agg[key] ?? { count: 0, lastDate: '', prices: [] };
              agg[key].count++;
              if (!agg[key].lastDate || r?.receipt_date > agg[key].lastDate) agg[key].lastDate = r?.receipt_date ?? '';
              if (ri.total_price) agg[key].prices.push(Number(ri.total_price));
            }
            const summary = Object.entries(agg).sort(([, a], [, b]) => b.count - a.count).slice(0, 20).map(([n, d]) => {
              const avg = d.prices.length ? (d.prices.reduce((a, b) => a + b, 0) / d.prices.length).toFixed(2) : null;
              const last = d.lastDate ? new Date(d.lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
              return `${n} (bought ${d.count}×, last ${last}${avg ? `, ~$${avg}` : ''})`;
            }).join('\n');
            try {
              const { data: ai } = await supabase.functions.invoke('ask-cube', { body: {
                familyId,
                message: `Based on our grocery purchase history from the last 3 months, suggest what we should add to our shopping list now.\n\nPurchase history:\n${summary}\n\nCurrently on list: ${existingItems.filter(i => !i.isBought).map(i => i.name).join(', ') || 'empty'}\n\nReturn a JSON array of up to 12 suggestions. Each object: { "name": string, "quantity": string, "estimatedPrice": number|null, "reason": string, "recommend": boolean }. "recommend":true means you strongly suggest adding it now. Reason should be 1 sentence referencing the purchase history. Only suggest items NOT already on the list.`,
                systemContext: 'grocery-suggestions', responseFormat: 'json',
              } });
              const raw = typeof ai?.reply === 'string' ? ai.reply : JSON.stringify(ai?.reply ?? '[]');
              const m = raw.match(/\[[\s\S]*\]/);
              const arr: any[] = m ? JSON.parse(m[0]) : [];
              built = arr.filter(s => s?.name).map(s => {
                const dupe = have.has(String(s.name).toLowerCase());
                return { name: s.name, quantity: s.quantity ?? '1', price: s.estimatedPrice ?? null, reason: s.reason ?? '', dupe, on: !dupe && !!s.recommend };
              });
            } catch { /* fall through to staples */ }
          }
          if (built.length === 0 && staples.length > 0) {
            built = (staples as any[]).map(s => {
              const dupe = have.has(s.name.toLowerCase());
              const since = s.last_bought_at ? daysSince(s.last_bought_at) : null;
              const interval = s.avg_days_between ? Math.round(s.avg_days_between) : null;
              const due = since != null && interval != null && since >= interval * 0.8;
              return { name: s.name, quantity: '1', price: s.avg_unit_price ?? null, category: s.category, dupe, on: !dupe && due,
                reason: dupe ? 'Already on the shared list.' : interval && since != null ? `Bought every ${interval} days · last ${since} days ago.` : `Bought ${s.times_bought}× before.` };
            });
          }
          if (built.length === 0 && pastItemNames.length > 0) {
            built = pastItemNames.slice(0, 12).map(n => ({ name: n, quantity: '1', price: null, reason: 'From your previous shopping history.', dupe: have.has(n.toLowerCase()), on: false }));
          }
        }
      } catch { /* empty state below */ }
      if (alive) { setSugs(built); setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, familyId]);

  const picked = useMemo(() => sugs.filter(x => x.on && !x.dupe), [sugs]);
  const total = picked.reduce((n, x) => n + (x.price ?? 0), 0);
  const toggle = (name: string) => setSugs(p => p.map(x => (x.name === name && !x.dupe ? { ...x, on: !x.on } : x)));
  const add = async () => {
    if (!picked.length || saving) return;
    setSaving(true);
    for (const x of picked) {
      await addItem({ familyId, name: x.name, quantity: x.quantity && x.quantity !== '1' ? x.quantity : undefined, category: x.category, addedBy: memberId, aiGenerated: mode === 'ai' } as any);
    }
    setSaving(false);
    showToast(`${picked.length} added to the list`);
    onClose();
  };

  const isAi = mode === 'ai';
  return (
    <KioskFormDrawer visible={visible} variant="drawer" title={isAi ? 'AI add suggestions' : 'Smart restock'}
      subtitle={isAi ? 'From your staples and recent receipts' : 'Things you usually buy by now'}
      accent={isAi ? k.purple : k.gold} Icon={isAi ? Sparkles : Repeat} k={k} onClose={onClose}
      submitLabel={`Add ${picked.length} to list`} onSubmit={add} canSubmit={picked.length > 0} submitting={saving}
      footerNote={total > 0 ? `Estimated total $${total.toFixed(2)}` : undefined}>
      <View style={{ gap: KIOSK_SPACE.sm, paddingBottom: KIOSK_SPACE.xl }}>
        {loading ? <ActivityIndicator color={k.gold} style={{ marginVertical: KIOSK_SPACE.xl }} />
          : sugs.length === 0 ? <Text style={[s.empty, { color: k.textMuted }]}>{isAi ? 'No suggestions yet. Scan a receipt to teach it what you buy.' : 'Nothing is due for a restock.'}</Text>
          : sugs.map((x, i) => {
            const tone = pastels[i % 4];
            return (
              <Pressable key={x.name} onPress={() => toggle(x.name)} accessibilityRole="button" accessibilityState={{ selected: x.on, disabled: x.dupe }}
                style={[s.row, { backgroundColor: tone.col, borderColor: x.on ? k.primary : tone.card, opacity: x.dupe ? 0.55 : 1 }]}>
                <View style={[s.ck, { backgroundColor: x.on ? k.primary : k.card }]}>{x.on && <Check size={18} color={k.onPrimary} strokeWidth={3} />}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.name, { color: k.text }]} numberOfLines={1}>{x.name}</Text>
                  <Text style={[s.reason, { color: k.textMuted }]}>{x.dupe ? 'Already on the list. No duplicate will be added.' : x.reason}</Text>
                </View>
                <View style={[s.pill, { backgroundColor: k.card }]}><Text style={[s.pillT, { color: k.textMuted }]}>{x.price != null ? `$${x.price.toFixed(2)}` : x.quantity}</Text></View>
              </Pressable>
            );
          })}
      </View>
    </KioskFormDrawer>
  );
}

const s = StyleSheet.create({
  empty: { fontSize: KIOSK_TYPO.body, fontWeight: '700', textAlign: 'center', paddingVertical: KIOSK_SPACE.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: KIOSK_RADIUS.lg, borderWidth: 2, padding: 12 },
  ck: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  reason: { fontSize: KIOSK_TYPO.label, fontWeight: '600', marginTop: 2 },
  pill: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  pillT: { fontSize: 12, fontWeight: '800' },
});
