/**
 * AiSuggestionsScreen — Figma "AI add suggestions" full-page overlay.
 *
 * Shows AI-proposed restock items derived from grocery_staples + recent
 * receipts. Parent/shopper selects, adjusts quantity, then confirms —
 * selected items are batch-added to the shared shopping list.
 *
 * Layout matches Figma exactly:
 *  - ReviewInbox header (← Groceries breadcrumb, 29px title)
 *  - Soft lavender info card "Optional ideas, not additions"
 *  - Suggestion rows: Selected / Skipped / Not selected states
 *  - Summary pill: "X selected · £Y.YY estimate"
 *  - Quantity edit cards for each selected item
 *  - Footer note
 *  - "Dismiss all · leave list unchanged" link card
 *  - "Add X selected items" primary button
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useGroceryStore, GroceryItem } from '@/store/groceryStore';
import { guessCategory } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type SuggestionState = 'selected' | 'skipped' | 'unselected';

interface Suggestion {
  name: string;
  quantity: string;
  estimatedPrice: number | null;
  reason: string;
  state: SuggestionState;
  alreadyOnList: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCheckedTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtPrice(p: number | null) {
  if (p == null) return null;
  return `$${p.toFixed(2)}`;
}

function stateLabel(s: SuggestionState, alreadyOnList: boolean) {
  if (alreadyOnList) return 'Skipped';
  if (s === 'selected') return 'Selected';
  if (s === 'skipped') return 'Skipped';
  return 'Not selected';
}

function stateColor(s: SuggestionState, alreadyOnList: boolean, colors: any) {
  if (alreadyOnList || s === 'skipped') return colors.textTertiary;
  if (s === 'selected') return colors.textPrimary;
  return colors.textSecondary;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AiSuggestionsScreen({
  visible, onClose, familyId, memberId, existingItems, colors, isDark, onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  familyId: string;
  memberId: string;
  existingItems: GroceryItem[];
  colors: any;
  isDark: boolean;
  onAdded: (count: number) => void;
}) {
  const addItem = useGroceryStore(s => s.addItem);
  const pastItemNames = useGroceryStore(s => s.pastItemNames);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkedTime] = useState(fmtCheckedTime);
  const insets = useSafeAreaInsets();
  const P = colors.primary;

  // Build AI suggestions from last 3 months of purchase history + staples
  useEffect(() => {
    if (!visible || !familyId) return;
    setLoading(true);
    const existingNames = new Set(existingItems.filter(i => !i.isBought).map(i => i.name.toLowerCase()));
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Pull receipt items + staples in parallel
    Promise.all([
      supabase
        .from('grocery_receipt_items')
        .select('name, category, quantity, total_price, grocery_receipts!inner(receipt_date, store)')
        .eq('family_id', familyId)
        .gte('grocery_receipts.receipt_date', since.split('T')[0])
        .limit(60),
      supabase
        .from('grocery_staples')
        .select('name, times_bought, avg_days_between, last_bought_at, avg_unit_price, category')
        .eq('family_id', familyId)
        .order('times_bought', { ascending: false })
        .limit(30),
    ]).then(async ([receiptRes, staplesRes]) => {
      const receiptItems = receiptRes.data ?? [];
      const staples = staplesRes.data ?? [];

      let built: Suggestion[] = [];

      // If we have receipt history, send to AI for smart suggestions
      if (receiptItems.length > 0) {
        // Aggregate: name → { count, lastDate, avgPrice, store }
        const agg: Record<string, { count: number; lastDate: string; prices: number[]; store: string }> = {};
        for (const ri of receiptItems) {
          const key = ri.name.toLowerCase();
          const rec = ri.grocery_receipts as any;
          if (!agg[key]) agg[key] = { count: 0, lastDate: '', prices: [], store: rec?.store ?? '' };
          agg[key].count++;
          if (!agg[key].lastDate || rec?.receipt_date > agg[key].lastDate) {
            agg[key].lastDate = rec?.receipt_date ?? '';
            agg[key].store = rec?.store ?? agg[key].store;
          }
          if (ri.total_price) agg[key].prices.push(Number(ri.total_price));
        }

        // Build summary text for AI prompt
        const summaryLines = Object.entries(agg)
          .sort(([, a], [, b]) => b.count - a.count)
          .slice(0, 20)
          .map(([name, d]) => {
            const avg = d.prices.length ? (d.prices.reduce((s, p) => s + p, 0) / d.prices.length).toFixed(2) : null;
            const lastFmt = d.lastDate ? new Date(d.lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            return `${name} (bought ${d.count}×, last ${lastFmt}${avg ? `, ~$${avg}` : ''})`;
          })
          .join('\n');

        const currentListStr = existingItems.filter(i => !i.isBought).map(i => i.name).join(', ') || 'empty';

        try {
          const { data: aiData } = await supabase.functions.invoke('ask-cube', {
            body: {
              familyId,
              message: `Based on our grocery purchase history from the last 3 months, suggest what we should add to our shopping list now.\n\nPurchase history:\n${summaryLines}\n\nCurrently on list: ${currentListStr}\n\nReturn a JSON array of up to 12 suggestions. Each object: { "name": string, "quantity": string, "estimatedPrice": number|null, "reason": string, "recommend": boolean }. "recommend":true means you strongly suggest adding it now. Reason should be 1 sentence referencing the purchase history. Only suggest items NOT already on the list.`,
              systemContext: 'grocery-suggestions',
              responseFormat: 'json',
            },
          });

          // Parse AI response
          let aiSuggestions: any[] = [];
          try {
            const raw = typeof aiData?.reply === 'string' ? aiData.reply : JSON.stringify(aiData?.reply ?? '[]');
            const match = raw.match(/\[[\s\S]*\]/);
            if (match) aiSuggestions = JSON.parse(match[0]);
          } catch { /* fall through to staples */ }

          if (aiSuggestions.length > 0) {
            built = aiSuggestions.map((s: any) => ({
              name: s.name ?? '',
              quantity: s.quantity ?? '1',
              estimatedPrice: s.estimatedPrice ?? null,
              reason: s.reason ?? '',
              state: (existingNames.has((s.name ?? '').toLowerCase()) ? 'skipped' : (s.recommend ? 'selected' : 'unselected')) as SuggestionState,
              alreadyOnList: existingNames.has((s.name ?? '').toLowerCase()),
            })).filter(s => s.name);
          }
        } catch { /* fall through */ }
      }

      // Fallback / supplement with staples if AI returned nothing
      if (built.length === 0 && staples.length > 0) {
        built = staples.map(s => {
          const alreadyOnList = existingNames.has(s.name.toLowerCase());
          const daysSince = s.last_bought_at
            ? Math.floor((Date.now() - new Date(s.last_bought_at).getTime()) / 86_400_000)
            : null;
          const interval = s.avg_days_between ? Math.round(s.avg_days_between) : null;
          const isDue = daysSince != null && interval != null && daysSince >= interval * 0.8;
          const lastFmt = s.last_bought_at
            ? new Date(s.last_bought_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : null;
          const reason = alreadyOnList
            ? 'Already on shared list. No duplicate will be added.'
            : lastFmt && interval
              ? `Bought every ${interval} days · last ${lastFmt}.`
              : lastFmt
                ? `Bought ${s.times_bought}× · last ${lastFmt}.`
                : `Bought ${s.times_bought} time${s.times_bought !== 1 ? 's' : ''}.`;
          return {
            name: s.name, quantity: '1',
            estimatedPrice: s.avg_unit_price ?? null,
            reason, alreadyOnList,
            state: (alreadyOnList ? 'skipped' : isDue ? 'selected' : 'unselected') as SuggestionState,
          };
        });
      }

      // Last fallback: pastItemNames from Zustand store
      if (built.length === 0 && pastItemNames.length > 0) {
        built = pastItemNames.slice(0, 12).map(name => ({
          name, quantity: '1', estimatedPrice: null,
          reason: 'From your previous shopping history.',
          alreadyOnList: existingNames.has(name.toLowerCase()),
          state: (existingNames.has(name.toLowerCase()) ? 'skipped' : 'unselected') as SuggestionState,
        }));
      }

      setSuggestions(built);
      const initQty: Record<string, string> = {};
      built.forEach(s => { initQty[s.name] = '1'; });
      setQuantities(initQty);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [visible, familyId]);

  const selected = useMemo(
    () => suggestions.filter(s => s.state === 'selected' && !s.alreadyOnList),
    [suggestions]
  );

  const estimateTotal = useMemo(
    () => selected.reduce((sum, s) => {
      const qty = parseInt(quantities[s.name] ?? '1') || 1;
      return sum + (s.estimatedPrice ?? 0) * qty;
    }, 0),
    [selected, quantities]
  );

  const toggle = (name: string) => {
    setSuggestions(prev => prev.map(s => {
      if (s.name !== name || s.alreadyOnList) return s;
      if (s.state === 'selected') return { ...s, state: 'unselected' };
      if (s.state === 'unselected' || s.state === 'skipped') return { ...s, state: 'selected' };
      return s;
    }));
  };

  const handleAdd = async () => {
    if (!selected.length || saving) return;
    setSaving(true);
    for (const s of selected) {
      const qty = quantities[s.name]?.trim() || '1';
      await addItem({
        familyId, name: s.name,
        quantity: qty !== '1' ? qty : undefined,
        addedBy: memberId,
        aiGenerated: true,
      });
    }
    setSaving(false);
    onAdded(selected.length);
    onClose();
  };

  if (!visible) return null;

  const cardBg    = colors.card;
  const cardBdr   = colors.border;
  const surfaceBg = colors.surface;

  return (
    <View style={{ flex: 1, backgroundColor: cardBg }}>

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        backgroundColor: cardBg, gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: colors.textSecondary }}>
          GROCERIES
        </Text>
        <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: P }}>← Groceries</Text>
        </Pressable>
        <Text style={{ fontSize: 29, fontWeight: '700', lineHeight: 41, letterSpacing: -0.5, color: colors.textPrimary }}>
          AI add suggestions
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={P} size="large" />
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
            Checking your last 30 days of purchases…
          </Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 48 }}>

          {/* Lavender info card */}
          <View style={{ backgroundColor: colors.pinkLight, borderRadius: 22, padding: 20, gap: 6 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
              Optional ideas, not additions
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary, lineHeight: 20 }}>
              Based on your prior confirmed purchases and family-reported stock.
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textTertiary, marginTop: 2 }}>
              Checked {checkedTime}
            </Text>
          </View>

          {suggestions.length > 0 ? (
            <>
              {/* Suggestion rows — card with hairline dividers */}
              <View style={{ backgroundColor: cardBg, borderRadius: 16, borderWidth: 1, borderColor: cardBdr,
                shadowColor: isDark ? 'transparent' : '#172337', shadowOpacity: 0.06,
                shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: isDark ? 0 : 2,
                overflow: 'hidden' }}>
                {suggestions.map((s, idx) => {
                  const isSelected = s.state === 'selected';
                  const isSkipped  = s.alreadyOnList || s.state === 'skipped';
                  const label      = isSkipped ? 'Skipped' : isSelected ? 'Selected' : 'Not selected';
                  return (
                    <Pressable key={s.name}
                      onPress={() => !s.alreadyOnList && toggle(s.name)}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16,
                        backgroundColor: pressed && !s.alreadyOnList
                          ? colors.pinkLight
                          : isSelected ? colors.pinkLight + '66' : cardBg,
                        borderTopWidth: idx > 0 ? StyleSheet.hairlineWidth : 0,
                        borderTopColor: cardBdr,
                      })}>
                      {/* State dot */}
                      <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5,
                        backgroundColor: isSkipped ? cardBdr : isSelected ? colors.pink : 'transparent',
                        borderWidth: isSelected || isSkipped ? 0 : 1.5,
                        borderColor: colors.textTertiary }} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 15, fontWeight: '700',
                            color: isSkipped ? colors.textTertiary : colors.textPrimary,
                            textDecorationLine: isSkipped ? 'line-through' : 'none' }}>
                            {s.name}
                          </Text>
                          <View style={{ borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2,
                            backgroundColor: isSkipped ? surfaceBg : isSelected ? colors.pink + '22' : colors.amberLight }}>
                            <Text style={{ fontSize: 11, fontWeight: '700',
                              color: isSkipped ? colors.textTertiary : isSelected ? colors.pink : colors.amber }}>
                              {label}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                          {s.reason}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Summary line */}
              {selected.length > 0 && (
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>
                  {selected.length} selected{estimateTotal > 0 ? ` · $${estimateTotal.toFixed(2)} estimate` : ''}
                </Text>
              )}

              {/* Quantity stepper cards */}
              {selected.map(s => {
                const qty    = quantities[s.name] ?? '1';
                const qtyNum = parseInt(qty) || 1;
                return (
                  <View key={`qty-${s.name}`} style={{ backgroundColor: cardBg, borderRadius: 14,
                    borderWidth: 1, borderColor: cardBdr, padding: 16, gap: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
                      {s.name} quantity · editable
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Pressable onPress={() => setQuantities(p => ({ ...p, [s.name]: String(Math.max(1, qtyNum - 1)) }))}
                        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: surfaceBg,
                          alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 22, fontWeight: '500', color: colors.textPrimary }}>−</Text>
                      </Pressable>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>
                          {qty} × {s.quantity && s.quantity !== '1' ? s.quantity : '1 unit'}
                          {s.estimatedPrice != null ? `  ·  $${(s.estimatedPrice * qtyNum).toFixed(2)}` : ''}
                        </Text>
                      </View>
                      <Pressable onPress={() => setQuantities(p => ({ ...p, [s.name]: String(qtyNum + 1) }))}
                        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: surfaceBg,
                          alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 22, fontWeight: '500', color: colors.textPrimary }}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              {/* Footer note */}
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
                Add selected once → shared list becomes {existingItems.filter(i => !i.isBought).length + selected.length} approved
                items. No change until you confirm. Restock uses the same duplicate check, never silently adds.
              </Text>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🛒</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>No suggestions yet</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, textAlign: 'center',
                marginTop: 6, paddingHorizontal: 32, lineHeight: 19 }}>
                Scan a receipt to build your purchase history — AI suggestions appear here automatically.
              </Text>
            </View>
          )}

          {/* Dismiss link card */}
          <Pressable onPress={onClose}
            style={{ backgroundColor: cardBg, borderRadius: 14, borderWidth: 1, borderColor: cardBdr,
              padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: P }}>
              Dismiss all · leave list unchanged
            </Text>
          </Pressable>

          {/* Add button */}
          {selected.length > 0 && (
            <Pressable onPress={handleAdd} disabled={saving}
              style={{ borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                backgroundColor: saving ? surfaceBg : P,
                flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {saving
                ? <ActivityIndicator color={colors.textPrimary} size="small" />
                : <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textInverse ?? '#FFFFFF' }}>
                    Add {selected.length} selected item{selected.length !== 1 ? 's' : ''}
                  </Text>}
            </Pressable>
          )}

        </ScrollView>
      )}
    </View>
  );
}
