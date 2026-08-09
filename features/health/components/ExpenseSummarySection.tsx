import React, { memo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { EXPENSE_CATEGORY_CONFIG, type ExpenseCategory, type PetExpense } from '@/lib/db/expenses';
import { DonutChart, DS, type DonutSeg } from '@/features/health/components/DonutChart';
import { s } from './expensesStyles';
import { BAR_H, type TrendMonth } from './expensesUtils';
import { TYPO } from '@/constants/theme';

interface Pet { id: string; name: string; [key: string]: any; }

interface Props {
  monthTotal: number;
  pctVsPrev: number | null;
  dailyAvg: number;
  donutSegments: DonutSeg[];
  biggestExpense: PetExpense | null;
  colors: any;
  accent: string;
  selectedCategory: ExpenseCategory | null;
  setSelectedCategory: (cat: ExpenseCategory | null) => void;
  trendMonths: TrendMonth[];
  trendMax: number;
  monthlyAvg: number;
  petTotals: Record<string, number> | null;
  petForEntry: (pid: string) => Pet | undefined;
  monthOverallTotal: number;
}

const ExpenseSummarySection = memo(function ExpenseSummarySection({
  monthTotal, pctVsPrev, dailyAvg, donutSegments, biggestExpense,
  colors, accent, selectedCategory, setSelectedCategory,
  trendMonths, trendMax, monthlyAvg, petTotals, petForEntry, monthOverallTotal,
}: Props) {
  const cfg = EXPENSE_CATEGORY_CONFIG;

  return (
    <>
      {/* ── INSIGHT STRIP ── */}
      {monthTotal > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4, gap: 10 }}>
          {pctVsPrev !== null && (
            <View style={[s.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ fontSize: TYPO.title }}>{pctVsPrev > 0 ? '📈' : '📉'}</Text>
              <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: pctVsPrev > 15 ? colors.danger : pctVsPrev < -5 ? colors.success : colors.textPrimary }}>
                {pctVsPrev > 0 ? '+' : ''}{pctVsPrev.toFixed(0)}%
              </Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>vs last month</Text>
            </View>
          )}
          <View style={[s.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: TYPO.title }}>📆</Text>
            <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary }}>${dailyAvg.toFixed(1)}</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>per day</Text>
          </View>
          {donutSegments.length > 0 && (
            <View style={[s.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ fontSize: TYPO.title }}>{cfg[donutSegments[0].key as ExpenseCategory].emoji}</Text>
              <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: cfg[donutSegments[0].key as ExpenseCategory].color }}>
                {(donutSegments[0].pct * 100).toFixed(0)}%
              </Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>
                {cfg[donutSegments[0].key as ExpenseCategory].label}
              </Text>
            </View>
          )}
          {biggestExpense && (
            <View style={[s.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={{ fontSize: TYPO.title }}>💸</Text>
              <Text style={{ fontSize: TYPO.title, fontWeight: '900', color: colors.textPrimary }}>
                ${Number(biggestExpense.amount).toFixed(0)}
              </Text>
              <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, fontWeight: '600' }}>
                {cfg[biggestExpense.category].label}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── DONUT BREAKDOWN ── */}
      {monthTotal > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>SPENDING BREAKDOWN</Text>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            {selectedCategory && (
              <TouchableOpacity
                onPress={() => setSelectedCategory(null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 }}>
                <Text style={{ fontSize: TYPO.body }}>{cfg[selectedCategory].emoji}</Text>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: cfg[selectedCategory].color, flex: 1 }}>
                  {cfg[selectedCategory].label}
                </Text>
                <View style={{ backgroundColor: colors.border, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>Clear ✕</Text>
                </View>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', padding: 14, gap: 10, alignItems: 'center' }}>
              <DonutChart
                segments={donutSegments}
                selectedKey={selectedCategory}
                total={monthTotal}
                trackColor={colors.border}
                textColors={{ primary: colors.textPrimary, secondary: colors.textSecondary }}
              />
              <ScrollView style={{ flex: 1, maxHeight: DS }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {donutSegments.map(seg => {
                  const c = cfg[seg.key as ExpenseCategory];
                  const isSel = selectedCategory === seg.key;
                  return (
                    <TouchableOpacity
                      key={seg.key}
                      onPress={() => setSelectedCategory(isSel ? null : seg.key as ExpenseCategory)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10, marginBottom: 2,
                        backgroundColor: isSel ? c.color + '18' : 'transparent',
                      }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color, opacity: selectedCategory && !isSel ? 0.3 : 1 }} />
                      <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '600', color: isSel ? c.color : colors.textSecondary, opacity: selectedCategory && !isSel ? 0.45 : 1 }} numberOfLines={1}>
                        {c.label}
                      </Text>
                      <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: isSel ? c.color : colors.textPrimary, opacity: selectedCategory && !isSel ? 0.45 : 1 }}>
                        ${seg.amount.toFixed(0)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>
      )}

      {/* ── 6-MONTH TREND ── */}
      {trendMonths.some(m => m.total > 0) && (
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={[s.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>6-MONTH TREND</Text>
            {monthlyAvg > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 14, height: 1.5, backgroundColor: accent + '90' }} />
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary, fontWeight: '600' }}>avg ${monthlyAvg.toFixed(0)}</Text>
              </View>
            )}
          </View>
          <View style={[s.card, { backgroundColor: colors.card, padding: 16 }]}>
            <View style={{ position: 'relative' }}>
              {monthlyAvg > 0 && trendMax > 0 && (
                <View style={{
                  position: 'absolute', left: 0, right: 0,
                  top: BAR_H - (monthlyAvg / trendMax) * BAR_H,
                  height: 1.5, backgroundColor: accent + '55', zIndex: 2,
                }} />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_H, gap: 6 }}>
                {trendMonths.map((m, i) => {
                  const barH = trendMax > 0 ? Math.max((m.total / trendMax) * BAR_H, m.total > 0 ? 6 : 0) : 0;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', height: BAR_H, justifyContent: 'flex-end' }}>
                      {barH > 0 && (
                        <View style={{ width: '100%', height: barH, borderRadius: 6,
                          backgroundColor: m.isCurrent ? accent : accent + '40' }} />
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {trendMonths.map((m, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 1 }}>
                    {m.total > 0 && (
                      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: m.isCurrent ? accent : colors.textTertiary }}>
                        ${m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}k` : m.total.toFixed(0)}
                      </Text>
                    )}
                    <Text style={{ fontSize: TYPO.label, fontWeight: m.isCurrent ? '700' : '500', color: m.isCurrent ? accent : colors.textSecondary }}>
                      {m.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── BY PET ── */}
      {petTotals && (
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>BY PET</Text>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            {Object.entries(petTotals).sort((a, b) => b[1] - a[1]).map(([pid, total], i) => {
              const p = petForEntry(pid); if (!p) return null;
              const pa = p.accent_color ?? accent;
              const pct = monthOverallTotal > 0 ? (total / monthOverallTotal) * 100 : 0;
              return (
                <View key={pid} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <Text style={{ fontSize: TYPO.title }}>{p.emoji ?? '🐾'}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{p.name}</Text>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: pa }}>${total.toFixed(2)}</Text>
                    </View>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: pa + '22' }}>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: pa, width: `${pct}%` as any }} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </>
  );
});

export default ExpenseSummarySection;
