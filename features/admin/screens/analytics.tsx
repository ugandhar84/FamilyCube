import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAdminAnalytics, type AdminAnalytics as Analytics, type AnalyticsPeriod as Period } from '@/lib/db/admin';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 days' }, { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' }, { key: 'all', label: 'All time' },
];

function BarRow({ label, value, max, color, sub, labelColor }: { label: string; value: number; max: number; color: string; sub?: string; labelColor?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: labelColor ?? '#1A1025' }}>{label}</Text>
        <Text style={{ fontSize: TYPO.body, fontWeight: '700', color }}>{value.toLocaleString()}{sub ? ` ${sub}` : ''}</Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: color + '22' }}>
        <View style={{ height: 7, borderRadius: 4, backgroundColor: color, width: `${pct}%` }} />
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { colors, isDark } = useTheme();
  const scrollRef  = useRef<ScrollView>(null);
  const loadedOnce = useRef(false);
  const [data, setData]         = useState<Analytics | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod]     = useState<Period>('30d');
  const [showGoTop, setShowGoTop] = useState(false);

  const load = useCallback(async (silent = false, p: Period = period) => {
    if (silent) setRefreshing(true);
    else if (!loadedOnce.current) setLoading(true);
    try {
      const result = await getAdminAnalytics(p);
      setData(result);
    } finally {
      loadedOnce.current = true;
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(false, period); }, [period]);
  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      load(true, period);
    }
  }, [load, period]));

  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><PawBondLoader size={52} isDark={isDark} /></View>;
  if (!data)   return null;

  const SPECIES_EMOJI: Record<string, string> = {
    dog: '🐶', cat: '🐱', rabbit: '🐰', bird: '🐦',
    hamster: '🐹', fish: '🐠', turtle: '🐢', other: '🐾',
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      {/* Period selector */}
      <View style={[{ flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
        {PERIODS.map(p => (
          <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: period === p.key ? colors.primary : 'transparent' }}>
            <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: period === p.key ? colors.primary : sub }}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <ScrollView ref={scrollRef} style={{ flex: 1 }} alwaysBounceVertical={false} overScrollMode="never" contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true, period)} tintColor={colors.primary} colors={[colors.primary]} />}
        onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
        scrollEventThrottle={16}
      >

        {/* User Growth */}
        <Section label="USER GROWTH" sub={sub}>
          <KVRow label="Total registered" value={data.totalUsers.toLocaleString()} colors={colors} />
          <KVRow label="New last 7 days"  value={data.usersLast7.toLocaleString()} colors={colors} accent="#3B82F6" borderTop />
          <KVRow label="New last 30 days" value={data.usersLast30.toLocaleString()} colors={colors} borderTop />
          <KVRow label="Onboarding complete" value={`${Math.round((data.usersOnboarded/Math.max(data.totalUsers,1))*100)}%`} colors={colors} borderTop />
          <KVRow label="AI consent given" value={`${Math.round((data.usersWithConsent/Math.max(data.totalUsers,1))*100)}%`} colors={colors} borderTop />
        </Section>

        {/* Pets */}
        <Section label="PETS" sub={sub}>
          <KVRow label="Total pets"       value={data.totalPets.toLocaleString()} colors={colors} />
          <KVRow label="Active pets"      value={data.activePets.toLocaleString()} colors={colors} accent="#16A34A" borderTop />
          <KVRow label="Avg pets / user"  value={String(data.avgPetsPerUser)} colors={colors} borderTop />
          <View style={[s.barSection, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[s.barTitle, { color: sub }]}>BY SPECIES</Text>
            {data.petsBySpecies.map(({ species, count }) => (
              <BarRow
                key={species}
                label={`${SPECIES_EMOJI[species] ?? '🐾'} ${species.charAt(0).toUpperCase() + species.slice(1)}`}
                value={count}
                max={data.activePets}
                color="#16A34A"
              />
            ))}
          </View>
        </Section>

        {/* Family Sharing */}
        <Section label="FAMILY SHARING" sub={sub}>
          <KVRow label="Total family links"   value={data.totalFamilyLinks.toLocaleString()} colors={colors} />
          <KVRow label="Caretakers"           value={data.caretakers.toLocaleString()} colors={colors} accent="#FF8C55" borderTop />
          <KVRow label="Viewers"              value={data.viewers.toLocaleString()} colors={colors} borderTop />
          <KVRow label="Avg members / pet"    value={String(data.avgFamilyPerPet)} colors={colors} borderTop />
        </Section>

        {/* Daily Care (last 7 days) */}
        <Section label="DAILY CARE — LAST 7 DAYS" sub={sub}>
          <View style={s.barSection}>
            <BarRow label="🍽 Meal logs"    value={data.feedLogsLast7}  max={Math.max(data.feedLogsLast7, data.moodLogsLast7, data.groomLogsLast7, data.walkLogsLast7)} color="#7C5CBF" labelColor={colors.textPrimary} />
            <BarRow label="😊 Mood scans"   value={data.moodLogsLast7}  max={Math.max(data.feedLogsLast7, data.moodLogsLast7, data.groomLogsLast7, data.walkLogsLast7)} color="#E8A320" labelColor={colors.textPrimary} />
            <BarRow label="🛁 Grooming"     value={data.groomLogsLast7} max={Math.max(data.feedLogsLast7, data.moodLogsLast7, data.groomLogsLast7, data.walkLogsLast7)} color="#3B82F6" labelColor={colors.textPrimary} />
            <BarRow label="🦮 Walks"        value={data.walkLogsLast7}  max={Math.max(data.feedLogsLast7, data.moodLogsLast7, data.groomLogsLast7, data.walkLogsLast7)} color="#16A34A" labelColor={colors.textPrimary} />
          </View>
        </Section>

        {/* Social */}
        <Section label="SOCIAL & COMMUNITY" sub={sub}>
          <KVRow label="Total posts"        value={data.totalPosts.toLocaleString()} colors={colors} />
          <KVRow label="Posts last 7 days"  value={data.postsLast7.toLocaleString()} colors={colors} accent="#7C5CBF" borderTop />
          <KVRow label="Total likes given"  value={data.totalLikes.toLocaleString()} colors={colors} borderTop />
          <KVRow label="Playdate requests"  value={data.playdateRequests.toLocaleString()} colors={colors} borderTop />
        </Section>

      </ScrollView>

      {showGoTop && (
        <TouchableOpacity
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

function Section({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={[s.sectionLabel, { color: sub }]}>{label}</Text>
      <View style={[s.card, { backgroundColor: card }]}>{children}</View>
    </View>
  );
}

function KVRow({ label, value, colors, accent, borderTop }: { label: string; value: string; colors: any; accent?: string; borderTop?: boolean }) {
  return (
    <View style={[s.kvRow, borderTop && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Text style={[s.kvLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[s.kvValue, { color: accent ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll:       { padding: 16 },
  sectionLabel: { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginLeft: 2 },
  card:         { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  kvRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  kvLabel:      { fontSize: TYPO.body },
  kvValue:      { fontSize: TYPO.body, fontWeight: '700' },
  barSection:   { padding: 16, paddingBottom: 4 },
  barTitle:     { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.6, marginBottom: 12 },
});
