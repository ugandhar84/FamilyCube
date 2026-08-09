import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { getAdminStats, type AdminStats as Stats } from '@/lib/db/admin';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';


// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtCost(n: number) {
  return n < 0.01 ? '< $0.01' : `$${n.toFixed(2)}`;
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Sparkline mini bar chart (7 bars)
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 }}>
      {data.map((v, i) => (
        <View key={i} style={{
          flex: 1, borderRadius: 3,
          height: Math.max(3, (v / max) * 28),
          backgroundColor: i === data.length - 1 ? color : color + '55',
        }} />
      ))}
    </View>
  );
}

// Funnel step
function FunnelStep({ label, value, total, color, isLast = false }: {
  label: string; value: number; total: number; color: string; isLast?: boolean;
}) {
  const p = pct(value, total);
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[fn.val, { color }]}>{value.toLocaleString()}</Text>
      <Text style={fn.label}>{label}</Text>
      {!isLast && (
        <View style={fn.bar}>
          <View style={[fn.fill, { width: `${p}%`, backgroundColor: color }]} />
        </View>
      )}
      {!isLast && <Text style={[fn.pct, { color }]}>{p}%</Text>}
    </View>
  );
}

// Pulse tile (today's activity)
function PulseTile({ emoji, label, value, color, card, sub }: any) {
  return (
    <View style={[pt.tile, { backgroundColor: card }]}>
      <Text style={pt.emoji}>{emoji}</Text>
      <Text style={[pt.val, { color }]}>{value.toLocaleString()}</Text>
      <Text style={[pt.label, { color: sub }]}>{label}</Text>
    </View>
  );
}

// Management grid card
function NavCard({ icon, label, sub: subtitle, color, badge, onPress, card, subColor, textColor }: any) {
  return (
    <TouchableOpacity style={[nc.card, { backgroundColor: card }]} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={[nc.icon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        {badge > 0 && (
          <View style={nc.badge}>
            <Text style={nc.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[nc.label, { color: textColor }]} numberOfLines={1}>{label}</Text>
      <Text style={[nc.sub, { color: subColor }]} numberOfLines={1}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function speciesEmoji(s: string): string {
  const map: Record<string, string> = { dog: '🐶', cat: '🐱', rabbit: '🐰', bird: '🐦', hamster: '🐹', fish: '🐠', reptile: '🦎' };
  return map[s?.toLowerCase()] ?? '🐾';
}

function timeAgoShort(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const loadedOnce = useRef(false);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showGoTop, setShowGoTop] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else if (!stats) setLoading(true);
    try {
      const s = await getAdminStats();
      setStats(s);
      setLastRefreshed(new Date());
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  // First mount: full load
  useEffect(() => { load(); }, []);

  // Auto-refresh every 60 seconds while screen is mounted
  useEffect(() => {
    const timer = setInterval(() => load(true), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Return from sub-screen: silent refresh (no flicker)
  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) load(true);
    else loadedOnce.current = true;
  }, [load]));

  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const bg   = colors.background;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} edges={['bottom']}>
        <PawBondLoader size={56} isDark={isDark} />
      </SafeAreaView>
    );
  }

  const st = stats!;
  const onboardedPct = pct(st.usersOnboarded,   st.totalUsers);
  const consentPct   = pct(st.usersWithConsent,  st.totalUsers);
  const healthOk     = st.pendingModeration === 0;
  const healthWarn   = st.pendingModeration > 0 && st.pendingModeration < 5;
  const healthBadColor = healthOk ? '#16A34A' : healthWarn ? '#E8A320' : '#E24B4A';
  const healthLabel    = healthOk ? 'All clear' : `${st.pendingModeration} pending`;

  const NAV = [
    { icon: 'bar-chart-outline',     label: 'Analytics',       sub: 'Growth & engagement',       route: '/admin/analytics',         color: '#7C5CBF' },
    { icon: 'people-outline',        label: 'Users',            sub: `${st.totalUsers} total`,    route: '/admin/users',             color: '#3B82F6' },
    { icon: 'paw-outline',           label: 'Pets',             sub: `${st.activePets} active`,   route: '/admin/pets',              color: '#16A34A' },
    { icon: 'gift-outline',          label: 'Recommendations',  sub: 'Picked for pet',            route: '/admin/recommendations',   color: '#E8A320' },
    { icon: 'flag-outline',          label: 'Moderation',       sub: `${st.pendingModeration} pending`, route: '/admin/moderation', color: '#E24B4A', badge: st.pendingModeration },
    { icon: 'notifications-outline', label: 'Push',             sub: 'Broadcast messages',        route: '/admin/push',              color: '#0891B2' },
    { icon: 'trash-outline',         label: 'Media',            sub: 'Cleanup rules',             route: '/admin/media-retention',   color: '#6B7280' },
    { icon: 'cash-outline',          label: 'Costs',            sub: fmtCost(st.aiCostToday) + ' today', route: '/admin/costs',   color: '#E24B4A' },
    { icon: 'toggle-outline',        label: 'Settings',         sub: 'Feature flags',             route: '/admin/settings',          color: '#3C3489' },
    { icon: 'git-network-outline',   label: 'AI Chains',        sub: 'Model fallback config',      route: '/admin/ai-chain',           color: '#8B5CF6' },
    { icon: 'pricetag-outline',      label: 'Pricing',          sub: 'Plans & storage caps',      route: '/admin/pricing',           color: '#059669' },
    { icon: 'ban-outline',           label: 'Blocked Words',    sub: 'Profanity filter',          route: '/admin/blocked-words',     color: '#DC2626' },
    { icon: 'paw-outline',           label: 'Species',          sub: 'Enable / disable species',  route: '/admin/species',           color: '#26C6B0' },
    { icon: 'bug-outline',           label: 'Feedback',         sub: 'Bug reports & feedback',    route: '/admin/feedback',          color: '#0891B2' },
    { icon: 'gift-outline',          label: 'Partner Offers',   sub: 'Coupon catalogue & codes',   route: '/admin/rewards-offers',       color: '#E8A320' },
    { icon: 'cash-outline',          label: 'Coins Config',     sub: 'Earn rates & top earners',   route: '/admin/coins-config',         color: '#C8860A' },
    { icon: 'cloud-upload-outline',  label: 'Bulk Upload',      sub: 'Import offers & codes (CSV)', route: '/admin/rewards-bulk-upload',  color: '#7C5CBF' },
  ] as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Admin Console' }} />
      
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          alwaysBounceVertical={false}
          overScrollMode="never"
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)}
              tintColor={colors.primary} colors={[colors.primary]} />
          }
          onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
          scrollEventThrottle={16}
        >

          {/* ── Health status row ── */}
          <View style={[s.header, { marginBottom: 12 }]}>
            <View>
              <Text style={[s.headerSub, { color: sub }]}>PawBond · {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</Text>
              {lastRefreshed && (
                <Text style={{ fontSize: TYPO.body, color: sub + 'AA', marginTop: 1 }}>
                  Updated {fmtTime(lastRefreshed)}
                </Text>
              )}
            </View>
            <View style={[s.healthPill, { backgroundColor: healthBadColor + '18', borderColor: healthBadColor + '44', borderWidth: 1 }]}>
              <View style={[s.healthDot, { backgroundColor: healthBadColor }]} />
              <Text style={[s.healthText, { color: healthBadColor }]}>{healthLabel}</Text>
            </View>
          </View>

          {/* ── Alert banner ── */}
          {st.pendingModeration > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/admin/moderation')}
              style={[s.alertBanner, { backgroundColor: st.pendingModeration >= 5 ? '#E24B4A18' : '#E8A32018', borderColor: st.pendingModeration >= 5 ? '#E24B4A44' : '#E8A32044' }]}
              activeOpacity={0.8}
            >
              <Ionicons name="warning-outline" size={18} color={st.pendingModeration >= 5 ? '#E24B4A' : '#E8A320'} />
              <Text style={[s.alertText, { color: st.pendingModeration >= 5 ? '#E24B4A' : '#D97706' }]}>
                {st.pendingModeration} {st.pendingModeration === 1 ? 'post needs' : 'posts need'} moderation review
              </Text>
              <Ionicons name="chevron-forward" size={14} color={st.pendingModeration >= 5 ? '#E24B4A' : '#D97706'} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          )}

          {/* ── User growth hero card ── */}
          <View style={[s.heroCard, { backgroundColor: card }]}>
            <View style={s.heroTop}>
              <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                <Text style={[s.heroLabel, { color: sub }]}>TOTAL USERS</Text>
                <Text style={[s.heroVal, { color: colors.textPrimary }]}>{st.totalUsers.toLocaleString()}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={[s.heroBadge, { color: '#7C5CBF' }]}>+{st.newUsersToday} today</Text>
                  <Text style={[s.heroBadge, { color: '#3B82F6' }]}>+{st.newUsersWeek} this week</Text>
                  {st.weeklyGrowthPct > 0 && (
                    <View style={{ backgroundColor: '#16A34A18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#16A34A' }}>↑{st.weeklyGrowthPct}% WoW</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <Text style={[s.heroLabel, { color: sub }]}>7-DAY SIGNUPS</Text>
                <Sparkline data={st.signupTrend} color="#7C5CBF" />
              </View>
            </View>

            {/* Recent signups feed */}
            {st.recentSignups.length > 0 && (
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12, marginTop: 4, marginBottom: 14 }}>
                <Text style={[s.heroLabel, { color: sub, marginBottom: 8 }]}>RECENT JOINS</Text>
                {st.recentSignups.map(u => (
                  <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#7C5CBF22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#7C5CBF' }}>
                        {u.name ? u.name.charAt(0).toUpperCase() : '?'}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: TYPO.body, color: colors.textPrimary, fontWeight: '500' }} numberOfLines={1}>
                      {u.name ?? 'Anonymous'}
                    </Text>
                    <Text style={{ fontSize: TYPO.body, color: sub }}>{timeAgoShort(u.created_at)} ago</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Onboarding funnel */}
            <View style={[s.funnelRow, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[fn.val, { color: '#3B82F6' }]}>{st.totalUsers.toLocaleString()}</Text>
                <Text style={fn.label}>Signed up</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={sub} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[fn.val, { color: '#7C5CBF' }]}>{st.usersOnboarded.toLocaleString()}</Text>
                <Text style={fn.label}>Onboarded</Text>
                <Text style={[fn.pct, { color: '#7C5CBF' }]}>{onboardedPct}%</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={sub} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[fn.val, { color: '#16A34A' }]}>{st.usersWithConsent.toLocaleString()}</Text>
                <Text style={fn.label}>Consented</Text>
                <Text style={[fn.pct, { color: '#16A34A' }]}>{consentPct}%</Text>
              </View>
            </View>
          </View>

          {/* ── Quick Actions ── */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {st.pendingModeration > 0 && (
              <TouchableOpacity onPress={() => router.push('/admin/moderation')}
                style={[qa.btn, { backgroundColor: '#E24B4A12', borderColor: '#E24B4A33' }]}>
                <Ionicons name="flag-outline" size={17} color="#E24B4A" />
                <Text style={[qa.label, { color: '#E24B4A' }]}>Review {st.pendingModeration}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push('/admin/push')}
              style={[qa.btn, { backgroundColor: '#0891B212', borderColor: '#0891B233' }]}>
              <Ionicons name="megaphone-outline" size={17} color="#0891B2" />
              <Text style={[qa.label, { color: '#0891B2' }]}>Push</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/admin/sponsored')}
              style={[qa.btn, { backgroundColor: '#FF8C5512', borderColor: '#FF8C5533' }]}>
              <Ionicons name="star-outline" size={17} color="#FF8C55" />
              <Text style={[qa.label, { color: '#FF8C55' }]}>Sponsors</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/admin/users')}
              style={[qa.btn, { backgroundColor: '#3B82F612', borderColor: '#3B82F633' }]}>
              <Ionicons name="people-outline" size={17} color="#3B82F6" />
              <Text style={[qa.label, { color: '#3B82F6' }]}>Users</Text>
            </TouchableOpacity>
          </View>

          {/* ── Pets + Family hero card ── */}
          <View style={[s.dualCard, { backgroundColor: card }]}>
            <View style={s.dualHalf}>
              <View style={[s.dualIcon, { backgroundColor: '#16A34A18' }]}>
                <Ionicons name="paw" size={18} color="#16A34A" />
              </View>
              <Text style={[s.dualVal, { color: '#16A34A' }]}>{st.activePets.toLocaleString()}</Text>
              <Text style={[s.dualLabel, { color: colors.textPrimary }]}>Active Pets</Text>
              <Text style={[s.dualSub, { color: sub }]}>{st.avgPetsPerUser}× per user · {st.totalPets} total</Text>
              {st.speciesBreakdown.length > 0 && (
                <View style={{ marginTop: 10, gap: 4 }}>
                  {st.speciesBreakdown.map(({ species, count }) => {
                    const maxCount = st.speciesBreakdown[0].count;
                    return (
                      <View key={species} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={{ fontSize: TYPO.body, width: 18 }}>{speciesEmoji(species)}</Text>
                        <View style={{ flex: 1, height: 4, backgroundColor: colors.skeleton ?? '#E5E0F5', borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{ width: `${(count / maxCount) * 100}%`, height: 4, backgroundColor: '#16A34A', borderRadius: 2 }} />
                        </View>
                        <Text style={{ fontSize: TYPO.body, color: sub, width: 22, textAlign: 'right' }}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            <View style={[s.dualDivider, { backgroundColor: colors.border }]} />
            <View style={s.dualHalf}>
              <View style={[s.dualIcon, { backgroundColor: '#FF8C5518' }]}>
                <Ionicons name="people" size={18} color="#FF8C55" />
              </View>
              <Text style={[s.dualVal, { color: '#FF8C55' }]}>{st.totalFamilyLinks.toLocaleString()}</Text>
              <Text style={[s.dualLabel, { color: colors.textPrimary }]}>Family Links</Text>
              <Text style={[s.dualSub, { color: sub }]}>Shared pet care connections</Text>
            </View>
          </View>

          {/* ── Today's pulse ── */}
          <Text style={[s.section, { color: sub }]}>TODAY'S PULSE</Text>
          <View style={s.pulseRow}>
            <PulseTile emoji="😊" label="Mood scans" value={st.moodScansToday} color="#E8A320" card={card} sub={sub} />
            <PulseTile emoji="🍽️"  label="Meals"     value={st.feedLogsToday}  color="#7C5CBF" card={card} sub={sub} />
            <PulseTile emoji="🚶" label="Walks"      value={st.walksToday}     color="#16A34A" card={card} sub={sub} />
            <PulseTile emoji="✂️"  label="Grooming"  value={st.groomToday}     color="#0891B2" card={card} sub={sub} />
          </View>
          <View style={[s.pulseRow, { marginTop: -4 }]}>
            <PulseTile emoji="📸" label="Posts"    value={st.postsToday}   color="#3B82F6" card={card} sub={sub} />
            <PulseTile emoji="🤖" label="AI calls" value={st.aiCallsToday} color="#E24B4A" card={card} sub={sub} />
            <View style={{ flex: 1 }} />
            <View style={{ flex: 1 }} />
          </View>

          {/* ── Engagement card (DAU / WAU) ── */}
          <Text style={[s.section, { color: sub, marginTop: 4 }]}>ENGAGEMENT</Text>
          <View style={[s.heroCard, { backgroundColor: card, padding: 14 }]}>
            <View style={{ flexDirection: 'row', gap: 0 }}>
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.hero, fontWeight: '800', color: '#7C5CBF' }}>{st.dauToday.toLocaleString()}</Text>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: sub, marginTop: 2 }}>DAU today</Text>
                <Text style={{ fontSize: TYPO.body, color: sub + 'AA', marginTop: 1 }}>meal-logged users</Text>
              </View>
              <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.hero, fontWeight: '800', color: '#3B82F6' }}>{st.wauLast7.toLocaleString()}</Text>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: sub, marginTop: 2 }}>WAU (7d)</Text>
                <Text style={{ fontSize: TYPO.body, color: sub + 'AA', marginTop: 1 }}>active last 7 days</Text>
              </View>
              <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ fontSize: TYPO.hero, fontWeight: '800', color: '#16A34A' }}>
                  {st.totalUsers > 0 ? Math.round((st.dauToday / st.totalUsers) * 100) : 0}%
                </Text>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: sub, marginTop: 2 }}>Eng. rate</Text>
                <Text style={{ fontSize: TYPO.body, color: sub + 'AA', marginTop: 1 }}>DAU ÷ total users</Text>
              </View>
            </View>
          </View>

          {/* AI cost today callout */}
          <View style={[s.costBar, { backgroundColor: card }]}>
            <View style={[s.costIcon, { backgroundColor: '#E24B4A18' }]}>
              <Ionicons name="flash" size={16} color="#E24B4A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.costLabel, { color: colors.textPrimary }]}>AI cost today</Text>
              <Text style={[s.costSub, { color: sub }]}>{st.aiCallsToday} calls across Gemini + DeepSeek</Text>
            </View>
            <Text style={[s.costVal, { color: st.aiCostToday > 1 ? '#E24B4A' : '#16A34A' }]}>
              {fmtCost(st.aiCostToday)}
            </Text>
            <TouchableOpacity onPress={() => router.push('/admin/costs')} style={{ padding: 4 }}>
              <Ionicons name="chevron-forward" size={16} color={sub} />
            </TouchableOpacity>
          </View>

          {/* ── Sponsored + Content ── */}
          <View style={s.rowCards}>
            <View style={[s.halfCard, { backgroundColor: card }]}>
              <View style={[s.halfIcon, { backgroundColor: '#FF8C5518' }]}>
                <Ionicons name="megaphone" size={16} color="#FF8C55" />
              </View>
              <Text style={[s.halfVal, { color: '#FF8C55' }]}>{st.activeSponsored}</Text>
              <Text style={[s.halfLabel, { color: colors.textPrimary }]}>Sponsored</Text>
              <Text style={[s.halfSub, { color: sub }]}>Active listings</Text>
              <TouchableOpacity onPress={() => router.push('/admin/sponsored')} style={[s.halfBtn, { borderColor: '#FF8C5544' }]}>
                <Text style={[s.halfBtnText, { color: '#FF8C55' }]}>Manage →</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.halfCard, { backgroundColor: card }]}>
              <View style={[s.halfIcon, { backgroundColor: '#7C5CBF18' }]}>
                <Ionicons name="chatbubbles" size={16} color="#7C5CBF" />
              </View>
              <Text style={[s.halfVal, { color: '#7C5CBF' }]}>{st.totalPosts.toLocaleString()}</Text>
              <Text style={[s.halfLabel, { color: colors.textPrimary }]}>Community</Text>
              <Text style={[s.halfSub, { color: sub }]}>Total posts</Text>
              <TouchableOpacity onPress={() => router.push('/admin/moderation')} style={[s.halfBtn, { borderColor: '#7C5CBF44' }]}>
                <Text style={[s.halfBtnText, { color: '#7C5CBF' }]}>Moderate →</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Management grid ── */}
          <Text style={[s.section, { color: sub, marginTop: 8 }]}>MANAGE</Text>
          <View style={s.navGrid}>
            {NAV.map(item => (
              <NavCard
                key={item.route}
                icon={item.icon}
                label={item.label}
                sub={item.sub}
                color={item.color}
                badge={(item as any).badge ?? 0}
                card={card}
                subColor={sub}
                textColor={colors.textPrimary}
                onPress={() => router.push(item.route as any)}
              />
            ))}
          </View>

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

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll:       { padding: 16, paddingTop: 8 },
  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerTitle:  { fontSize: TYPO.title, fontWeight: '800' },
  headerSub:    { fontSize: TYPO.body, marginTop: 2 },
  healthPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  healthDot:    { width: 6, height: 6, borderRadius: 3 },
  healthText:   { fontSize: TYPO.body, fontWeight: '700' },
  // Alert banner
  alertBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  alertText:    { fontSize: TYPO.body, fontWeight: '600', flex: 1 },
  // Hero card
  heroCard:     { borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, elevation: 3 },
  heroTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  heroLabel:    { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.6 },
  heroVal:      { fontSize: 36, fontWeight: '800', lineHeight: 42, marginTop: 2 },
  heroBadge:    { fontSize: TYPO.body, fontWeight: '700' },
  funnelRow:    { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 4 },
  // Dual card
  dualCard:     { borderRadius: 18, flexDirection: 'row', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10, elevation: 3, overflow: 'hidden' },
  dualHalf:     { flex: 1, padding: 16, gap: 2 },
  dualIcon:     { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  dualVal:      { fontSize: TYPO.hero, fontWeight: '800' },
  dualLabel:    { fontSize: TYPO.body, fontWeight: '700', marginTop: 2 },
  dualSub:      { fontSize: TYPO.body, marginTop: 1 },
  dualDivider:  { width: StyleSheet.hairlineWidth },
  // Section
  section:      { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, marginLeft: 2 },
  // Pulse row
  pulseRow:     { flexDirection: 'row', gap: 10, marginBottom: 12 },
  // Cost bar
  costBar:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  costIcon:     { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  costLabel:    { fontSize: TYPO.body, fontWeight: '700' },
  costSub:      { fontSize: TYPO.body, marginTop: 1 },
  costVal:      { fontSize: TYPO.subheading, fontWeight: '800' },
  // Half cards
  rowCards:     { flexDirection: 'row', gap: 10, marginBottom: 12 },
  halfCard:     { flex: 1, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  halfIcon:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  halfVal:      { fontSize: TYPO.hero, fontWeight: '800' },
  halfLabel:    { fontSize: TYPO.body, fontWeight: '700', marginTop: 2 },
  halfSub:      { fontSize: TYPO.body, marginTop: 1 },
  halfBtn:      { marginTop: 10, borderRadius: 8, borderWidth: 1, paddingVertical: 6, alignItems: 'center' },
  halfBtnText:  { fontSize: TYPO.body, fontWeight: '700' },
  // Nav grid
  navGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});

const qa = StyleSheet.create({
  btn:   { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', gap: 4 },
  label: { fontSize: TYPO.body, fontWeight: '700' },
});

const fn = StyleSheet.create({
  val:   { fontSize: TYPO.heading, fontWeight: '800' },
  label: { fontSize: TYPO.body, fontWeight: '600', color: '#9A8FC0', marginTop: 2, textAlign: 'center' },
  bar:   { height: 3, width: '80%', borderRadius: 2, backgroundColor: '#E5E0F5', marginTop: 5, overflow: 'hidden' },
  fill:  { height: 3, borderRadius: 2 },
  pct:   { fontSize: TYPO.body, fontWeight: '700', marginTop: 2 },
});

const pt = StyleSheet.create({
  tile:  { flex: 1, borderRadius: 14, padding: 11, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  emoji: { fontSize: TYPO.heading, marginBottom: 4 },
  val:   { fontSize: TYPO.heading, fontWeight: '800' },
  label: { fontSize: TYPO.body, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});

const nc = StyleSheet.create({
  card:      { width: '47.8%', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2, gap: 4 },
  icon:      { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  label:     { fontSize: TYPO.body, fontWeight: '700' },
  sub:       { fontSize: TYPO.body },
  badge:     { backgroundColor: '#E24B4A', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: TYPO.body, fontWeight: '800' },
});
