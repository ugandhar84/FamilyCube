// Admin AI usage screen — "how many AI calls each user is making per
// service" / "total per day week month year stats"
// [live-requested]. Visibility only, no rate-limiting
// [live-confirmed: "nothing like that we just need to see what is going
// on who uses what ai calls a lot"]. Backed by admin_get_ai_usage_*()
// RPCs (20260950000000_ai_usage_log.sql), which return zero rows for a
// non-admin caller.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import {
  getAiUsageSummary, getAiUsageByUser, getAiUsageTrend,
  type AiUsageSummaryRow, type AiUsageByUserRow, type AiUsageTrendPoint, type AiUsageTrendBucket,
} from '@/lib/db/admin';
import { showAlert } from '@/components/AppAlert';

const SERVICE_LABEL: Record<string, string> = {
  ask_cube: 'Ask Fam', family_ai: 'Family AI', flyer_parse: 'Flyer Scan',
  parse_prescription: 'Prescription Scan', grocery_receipt_parse: 'Receipt Scan',
  analyze_medical_record: 'Medical Record Scan', analyze_appointment_recording: 'Appointment Recording',
  grocery_ai_suggest: 'Grocery Suggestions', moderate_message: 'Chat Moderation',
};

const RANGE_OPTIONS: { label: string; days: number; bucket: AiUsageTrendBucket }[] = [
  { label: 'Day', days: 1, bucket: 'hour' },
  { label: 'Week', days: 7, bucket: 'day' },
  { label: 'Month', days: 30, bucket: 'day' },
  { label: 'Year', days: 365, bucket: 'month' },
];

// 30s auto-refresh rather than a live postgres_changes subscription — AI
// usage rows can be high-volume writes (especially moderate_message on
// every chat send), and this is an admin-only, aggregate-level view, not
// something that needs to propagate to end users instantly the way
// feature flags do. See the admin-console plan's own reasoning on this.
const REFRESH_MS = 30_000;

export default function AiUsageScreen() {
  const { colors } = useTheme();
  const [rangeIdx, setRangeIdx] = useState(1); // default: Week
  const [summary, setSummary] = useState<AiUsageSummaryRow[] | null>(null);
  const [byUser, setByUser] = useState<AiUsageByUserRow[] | null>(null);
  const [trend, setTrend] = useState<AiUsageTrendPoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  const range = RANGE_OPTIONS[rangeIdx];

  const load = useCallback(async () => {
    try {
      const [s, u, t] = await Promise.all([
        getAiUsageSummary(range.days),
        getAiUsageByUser(range.days, 25),
        getAiUsageTrend(range.bucket, range.days),
      ]);
      setSummary(s); setByUser(u); setTrend(t);
    } catch (e: any) {
      showAlert("Couldn't load AI usage", e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [range.days, range.bucket]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const totalCalls = (summary ?? []).reduce((sum, r) => sum + r.callCount, 0);
  const totalTokens = (summary ?? []).reduce((sum, r) => sum + r.totalTokens, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* Range toggle */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {RANGE_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt.label}
              onPress={() => setRangeIdx(i)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: RADIUS.md,
                backgroundColor: i === rangeIdx ? colors.primary : colors.card,
                borderWidth: 1, borderColor: i === rangeIdx ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: TYPO.caption, fontWeight: '800', color: i === rangeIdx ? '#fff' : colors.textSecondary }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && summary === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            {/* Top-level totals */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>Total Calls</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, marginTop: 4 }}>{totalCalls.toLocaleString()}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }}>Total Tokens</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary, marginTop: 4 }}>{totalTokens.toLocaleString()}</Text>
              </View>
            </View>

            {/* Trend (simple bar list — no charting lib in this app) */}
            {trend && trend.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Calls over time
                </Text>
                {(() => {
                  const max = Math.max(...trend.map(t => t.callCount), 1);
                  return trend.map(point => (
                    <View key={point.bucketStart} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={{ width: 70, fontSize: TYPO.caption, color: colors.textTertiary }}>
                        {new Date(point.bucketStart).toLocaleDateString(undefined, range.bucket === 'hour' ? { hour: 'numeric' } : { month: 'short', day: 'numeric' })}
                      </Text>
                      <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.surface, overflow: 'hidden' }}>
                        <View style={{ width: `${(point.callCount / max) * 100}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 7 }} />
                      </View>
                      <Text style={{ width: 34, fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary, textAlign: 'right' }}>
                        {point.callCount}
                      </Text>
                    </View>
                  ));
                })()}
              </View>
            )}

            {/* Per-service breakdown */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                By service
              </Text>
              {(summary ?? []).length === 0 ? (
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No AI calls in this range.</Text>
              ) : (summary ?? []).map(row => (
                <View key={row.service} style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADIUS.md,
                  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 6,
                }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                    {SERVICE_LABEL[row.service] ?? row.service}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{row.callCount.toLocaleString()} calls</Text>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{row.totalTokens.toLocaleString()} tokens</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Heaviest users */}
            <View>
              <Text style={{ fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                Heaviest users
              </Text>
              {(byUser ?? []).length === 0 ? (
                <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>No AI calls in this range.</Text>
              ) : (byUser ?? []).map(row => (
                <View key={row.memberId} style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADIUS.md,
                  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 6,
                }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                    {row.memberName ?? row.memberId}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: colors.textPrimary }}>{row.callCount.toLocaleString()} calls</Text>
                    <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary }}>{row.totalTokens.toLocaleString()} tokens</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
