import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { FlatSectionHeader } from './FlatSectionHeader';

// ─── Insights Tab ─────────────────────────────────────────────────────────────

export function InsightsTab({ familyId, colors, isDark }: { familyId: string; colors: any; isDark: boolean }) {
  const [staples, setStaples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    async function fetch() {
      const { data } = await supabase
        .from('grocery_staples')
        .select('*')
        .eq('family_id', familyId)
        .order('times_bought', { ascending: false })
        .limit(20);
      setStaples(data ?? []);
      setLoading(false);
    }
    fetch();
  }, [familyId]);

  const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

      {/* Header stat */}
      <View style={{ flexDirection: 'row', gap: 20, marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, marginBottom: 4 }}>🔮</Text>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.primary }}>{staples.filter(s => s.auto_suggest).length}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Tracked staples</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, marginBottom: 4 }}>📦</Text>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.success }}>{staples.reduce((s, i) => s + (i.times_bought ?? 0), 0)}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Total purchases tracked</Text>
        </View>
      </View>

      {/* Restock predictions */}
      {staples.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <FlatSectionHeader emoji="📈" title="Purchase Patterns" accent={colors.primary} colors={colors} />
          {staples.map((s, idx) => {
              const days = s.last_bought_at ? daysAgo(s.last_bought_at) : null;
              const overdue = days != null && s.avg_days_between && days >= s.avg_days_between;
              const pct = days && s.avg_days_between ? Math.min(days / s.avg_days_between, 1) : 0;
              return (
                <View key={s.id} style={{ paddingVertical: 10, borderBottomWidth: idx < staples.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{s.name}</Text>
                    {overdue && <View style={{ backgroundColor: colors.warningLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.warningDark }}>RESTOCK</Text>
                    </View>}
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginLeft: 8 }}>Every {Math.round(s.avg_days_between ?? 0)}d</Text>
                  </View>
                  {/* Progress bar */}
                  <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 2, backgroundColor: overdue ? colors.warning : colors.primary }} />
                  </View>
                  {days != null && <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>Last bought {days}d ago · {s.times_bought}x total</Text>}
                </View>
              );
            })}
        </View>
      )}

      {staples.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>No insights yet</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 }}>Scan receipts to start tracking purchase patterns and get restock predictions.</Text>
        </View>
      )}
    </ScrollView>
  );
}
