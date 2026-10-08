import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';

// ─── Insights Tab — Figma "Spending insights" layout ─────────────────────────

function fmtShortDay(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

export function InsightsTab({ familyId, colors, isDark }: { familyId: string; colors: any; isDark: boolean }) {
  const [staples, setStaples] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    Promise.all([
      supabase.from('grocery_staples').select('*').eq('family_id', familyId).order('times_bought', { ascending: false }).limit(20),
      supabase.from('grocery_receipts').select('id,store,receipt_date,total').eq('family_id', familyId).order('receipt_date', { ascending: false }).limit(10),
    ]).then(([s, r]) => {
      setStaples(s.data ?? []);
      setReceipts(r.data ?? []);
      setLoading(false);
    });
  }, [familyId]);

  const monthSummary = useMemo(() => {
    const now = new Date();
    const thisMonth = receipts.filter(r => {
      if (!r.receipt_date) return false;
      const d = new Date(r.receipt_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const total = thisMonth.reduce((s, r) => s + (r.total ?? 0), 0);
    const avg = thisMonth.length > 0 ? total / thisMonth.length : 0;
    return { count: thisMonth.length, total, avg };
  }, [receipts]);

  const maxTotal = useMemo(() => Math.max(...receipts.map(r => r.total ?? 0), 1), [receipts]);

  const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

      {/* Figma subtitle */}
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
        Illustrative household data · after receipt confirmation{'\n'}
        {receipts.length > 0
          ? `${new Date(receipts[receipts.length - 1]?.receipt_date ?? '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${new Date(receipts[0]?.receipt_date ?? '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · not measured real spending`
          : 'No data yet'}
      </Text>

      {/* Figma: large amber total card */}
      {monthSummary.count > 0 && (
        <View style={{ backgroundColor: colors.amberLight, borderRadius: 22, padding: 24 }}>
          <Text style={{ fontSize: 32, fontWeight: '900', color: colors.amber, marginBottom: 8 }}>
            ${monthSummary.total.toFixed(2)}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textSecondary }}>
            {monthSummary.count} confirmed run{monthSummary.count !== 1 ? 's' : ''} · ${monthSummary.avg.toFixed(2)} average
          </Text>
        </View>
      )}

      {/* Figma: "Spending by shopping run" white card with horizontal bars */}
      {receipts.length > 0 && (
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
          padding: 20, gap: 14,
          shadowColor: isDark ? 'transparent' : '#172337', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>Spending by shopping run</Text>
          {receipts.slice(0, 6).map((r) => {
            const pct = (r.total ?? 0) / maxTotal;
            return (
              <View key={r.id} style={{ gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>
                  {fmtShortDay(r.receipt_date)} · ${(r.total ?? 0).toFixed(2)}
                </Text>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ height: 10, borderRadius: 5, width: `${pct * 100}%`, backgroundColor: colors.amber }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Figma: "What we buy often" white card */}
      {staples.length > 0 && (
        <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
          padding: 20, gap: 14,
          shadowColor: isDark ? 'transparent' : '#172337', shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>What we buy often</Text>
          {staples.slice(0, 8).map((s, idx) => {
            const days = s.last_bought_at ? daysAgo(s.last_bought_at) : null;
            return (
              <View key={s.id}>
                {idx > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 14 }} />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 }}>
                  {s.name} · {s.times_bought} of {receipts.length} run{receipts.length !== 1 ? 's' : ''}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                  {days != null ? `${days}d ago` : ''}
                  {s.avg_days_between ? ` · usually every ${Math.round(s.avg_days_between)} days` : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Figma: footer disclaimer */}
      <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 }}>
        No trend claims from just {receipts.length} run{receipts.length !== 1 ? 's' : ''}. Check actual stock before restocking; estimated list prices are not included in confirmed spending.
      </Text>

      {/* Figma: "View all purchase records →" link card */}
      <Pressable style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.teal }}>
          View all {receipts.length} purchase record{receipts.length !== 1 ? 's' : ''} →
        </Text>
      </Pressable>

      {staples.length === 0 && receipts.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>No insights yet</Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 }}>
            Scan receipts to start tracking purchase patterns and get restock predictions.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
