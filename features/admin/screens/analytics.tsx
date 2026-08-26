// Admin analytics screen — platform-wide aggregate counts, backed by
// admin_get_platform_stats() (security-definer RPC, is_app_admin()-gated,
// see 20260925092000_admin_advanced_controls.sql). Aggregates only, no
// per-family or per-member rows surface here — that's the Families screen.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO, RADIUS } from '@/constants/theme';
import { showAlert } from '@/components/AppAlert';
import { getPlatformStats, type PlatformStats } from '@/lib/db/admin';

function StatCard({
  icon, label, value, accent, colors,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; accent: string; colors: any }) {
  return (
    <View style={{
      flex: 1, minWidth: '45%', backgroundColor: colors.card, borderRadius: RADIUS.lg,
      borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10,
    }}>
      <View style={{
        width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
        backgroundColor: accent + '22',
      }}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={{ fontSize: TYPO.title, fontWeight: '800', color: colors.textPrimary }}>{value.toLocaleString()}</Text>
      <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Section({ title, colors, children }: { title: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{
        fontSize: TYPO.label, fontWeight: '800', color: colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
      }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {children}
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      setStats(await getPlatformStats());
    } catch (e: any) {
      showAlert("Couldn't load analytics", e?.message ?? 'Something went wrong.');
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <Section title="Households" colors={colors}>
          <StatCard icon="home-outline" label="Families" value={stats.totalFamilies} accent={colors.primary} colors={colors} />
          <StatCard icon="people-outline" label="Members" value={stats.totalMembers} accent={colors.primary} colors={colors} />
          <StatCard icon="person-outline" label="Parents" value={stats.totalParents} accent={colors.parent} colors={colors} />
          <StatCard icon="happy-outline" label="Kids" value={stats.totalKids} accent={colors.kid} colors={colors} />
          <StatCard icon="person-add-outline" label="Solo families" value={stats.singleMemberFamilies} accent={colors.accent} colors={colors} />
        </Section>

        <Section title="Quests" colors={colors}>
          <StatCard icon="checkmark-circle-outline" label="Total chores" value={stats.totalChores} accent={colors.kid} colors={colors} />
          <StatCard icon="ribbon-outline" label="Completed" value={stats.choresCompleted} accent={colors.kid} colors={colors} />
        </Section>

        <Section title="Schedule & Chat" colors={colors}>
          <StatCard icon="calendar-outline" label="Events" value={stats.totalEvents} accent={colors.accent} colors={colors} />
          <StatCard icon="chatbubble-outline" label="Chat messages" value={stats.totalChatMessages} accent={colors.accent} colors={colors} />
        </Section>

        <Section title="Kid Requests" colors={colors}>
          <StatCard icon="hand-left-outline" label="Total" value={stats.totalKidRequests} accent={colors.parent} colors={colors} />
          <StatCard icon="hourglass-outline" label="Pending" value={stats.kidRequestsPending} accent={colors.danger} colors={colors} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
