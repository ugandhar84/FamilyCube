// Admin growth screen — installs/signups over time, onboarding completion,
// and subscriber tier breakdown. Real data only: profiles.created_at
// (signups) and subscriptions.tier (RevenueCat-driven). No MRR — this
// schema stores no pricing data, only tier, so a dollar figure here would
// be fabricated.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { showAlert } from '@/components/AppAlert';
import { getGrowthStats, getWeeklySignups, pctChange, type GrowthStats, type WeeklySignups } from '@/lib/db/admin';

function ChangeBadge({ pct, colors }: { pct: number | null; colors: any }) {
  if (pct === null) {
    return (
      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, backgroundColor: colors.tealLight }}>
        <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: colors.parent }}>New</Text>
      </View>
    );
  }
  const up = pct >= 0;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 2,
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full,
      backgroundColor: up ? colors.tealLight : colors.primaryLight,
    }}>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={10} color={up ? colors.parent : colors.danger} />
      <Text style={{ fontSize: TYPO.micro, fontWeight: '700', color: up ? colors.parent : colors.danger }}>
        {Math.abs(pct)}%
      </Text>
    </View>
  );
}

function GrowthCard({
  label, value, comparePct, sublabel, accent, colors,
}: { label: string; value: number; comparePct: number | null; sublabel: string; accent: string; colors: any }) {
  return (
    <View style={{
      flex: 1, minWidth: '45%', backgroundColor: colors.card, borderRadius: RADIUS.lg,
      borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: TYPO.title, fontWeight: '800', color: colors.textPrimary }}>{value.toLocaleString()}</Text>
        <ChangeBadge pct={comparePct} colors={colors} />
      </View>
      <View>
        <Text style={{ fontSize: TYPO.caption, color: accent, fontWeight: '700' }}>{label}</Text>
        <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 1 }}>{sublabel}</Text>
      </View>
    </View>
  );
}

function WeeklyChart({ weeks, colors }: { weeks: WeeklySignups[]; colors: any }) {
  const max = Math.max(...weeks.map(w => w.signups), 1);
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
      padding: 16, paddingBottom: 12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
        {weeks.map((w, i) => {
          const h = Math.max((w.signups / max) * 100, w.signups > 0 ? 6 : 2);
          const isLast = i === weeks.length - 1;
          return (
            <View key={w.weekStart} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '600' }}>
                {w.signups > 0 ? w.signups : ''}
              </Text>
              <View style={{
                width: '100%', height: `${h}%`, borderRadius: RADIUS.xs,
                backgroundColor: isLast ? colors.primary : colors.primary + '55',
                minHeight: 3,
              }} />
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary, marginTop: 10, textAlign: 'center' }}>
        Weekly signups — last {weeks.length} weeks
      </Text>
    </View>
  );
}

function TierBar({ label, value, total, color, colors }: { label: string; value: number; total: number; color: string; colors: any }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textPrimary }}>{label}</Text>
        <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color }}>{value.toLocaleString()} · {pct}%</Text>
      </View>
      <View style={{ height: 8, borderRadius: RADIUS.xs, backgroundColor: color + '1F' }}>
        <View style={{ height: 8, borderRadius: RADIUS.xs, backgroundColor: color, width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
      </View>
    </View>
  );
}

export default function GrowthScreen() {
  const { colors } = useTheme();
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [weeks, setWeeks] = useState<WeeklySignups[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [s, w] = await Promise.all([getGrowthStats(), getWeeklySignups(12)]);
      setStats(s);
      setWeeks(w);
    } catch (e: any) {
      showAlert("Couldn't load growth data", e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !stats) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const totalSubs = stats.subsFree + stats.subsPro + stats.subsUltimate;
  const paidSubs = stats.subsPro + stats.subsUltimate;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <Text style={{
          fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
        }}>
          Signups
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <GrowthCard
            label="Last 7 days" value={stats.signups7d} sublabel="vs. previous 7 days"
            comparePct={pctChange(stats.signups7d, stats.signupsPrev7d)} accent={colors.primary} colors={colors}
          />
          <GrowthCard
            label="Last 30 days" value={stats.signups30d} sublabel="vs. previous 30 days"
            comparePct={pctChange(stats.signups30d, stats.signupsPrev30d)} accent={colors.primary} colors={colors}
          />
          <GrowthCard
            label="Last 90 days" value={stats.signups90d} sublabel={`${stats.signupsTotal.toLocaleString()} all-time`}
            comparePct={null} accent={colors.accent} colors={colors}
          />
          <GrowthCard
            label="Last 12 months" value={stats.signups365d} sublabel="year over year"
            comparePct={pctChange(stats.signups365d, stats.signupsPrev365d)} accent={colors.accent} colors={colors}
          />
        </View>

        <WeeklyChart weeks={weeks} colors={colors} />

        <Text style={{
          fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10,
        }}>
          Onboarding
        </Text>
        <View style={{
          backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border,
          padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16,
        }}>
          <View style={{
            width: 56, height: 56, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.tealLight,
          }}>
            <Text style={{ fontSize: TYPO.subheading, fontWeight: '800', color: colors.parent }}>{stats.onboardingRatePct}%</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>Onboarding completion</Text>
            <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginTop: 1 }}>
              {stats.onboardedTotal.toLocaleString()} of {stats.signupsTotal.toLocaleString()} signups finished setup
            </Text>
          </View>
        </View>

        <Text style={{
          fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10,
        }}>
          Subscribers
        </Text>
        <View style={{
          backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, padding: 16,
        }}>
          <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, marginBottom: 14 }}>
            {paidSubs.toLocaleString()} paid subscriber{paidSubs === 1 ? '' : 's'} of {totalSubs.toLocaleString()} total
            {totalSubs > 0 ? ` (${Math.round((paidSubs / totalSubs) * 100)}% conversion)` : ''}
          </Text>
          <TierBar label="Free" value={stats.subsFree} total={totalSubs} color={colors.textTertiary} colors={colors} />
          <TierBar label="Pro" value={stats.subsPro} total={totalSubs} color={colors.parent} colors={colors} />
          <TierBar label="Ultimate" value={stats.subsUltimate} total={totalSubs} color={colors.accent} colors={colors} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
