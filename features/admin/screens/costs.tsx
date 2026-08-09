import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Modal, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────
type Mode = 'week' | 'custom';

type ApiSummary = {
  api_type: string;
  calls: number;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  errors: number;
};

type UserSummary = {
  user_id: string;
  full_name: string | null;
  calls: number;
  cost_usd: number;
};

type StorageRow = {
  user_id: string;       // auth user uuid, or 'sponsored' / other literal
  file_count: number;
  total_bytes: number;
  owner_name?: string | null;
};

type UserProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  onboarding_completed: boolean | null;
  ai_consent_accepted_at: string | null;
  is_admin: boolean | null;
  pet_count: number;
  family_count: number;
  total_cost: number;
  total_calls: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtBytes(b: number): string {
  if (!b) return '0 B';
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`;
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024)         return `${(b / 1_024).toFixed(0)} KB`;
  return `${b} B`;
}

function fmtCost(n: number): string {
  return n < 0.01 ? '< $0.01' : `$${n.toFixed(4)}`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(23, 59, 59, 999); return r;
}

// Build the last 7 calendar days (newest first)
function last7Days(): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return startOfDay(d);
  });
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const API_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  gemini_mood:    { label: 'Gemini — Mood Analysis',     emoji: '😊', color: '#E8A320' },
  gemini_health:  { label: 'Gemini — Health Record',     emoji: '🏥', color: '#3B82F6' },
  gemini_receipt: { label: 'Gemini — Receipt Parse',     emoji: '🧾', color: '#06B6D4' },
  gemini:         { label: 'Gemini — (legacy)',          emoji: '⚡', color: '#9CA3AF' },
  deepseek:       { label: 'DeepSeek — Health Parse',   emoji: '🧠', color: '#7C5CBF' },
  nearby_yelp:    { label: 'Yelp — Nearby Places',      emoji: '📍', color: '#E24B4A' },
  nearby_osm:     { label: 'OSM — Nearby Places (free)',emoji: '🗺️', color: '#16A34A' },
  broadcast:      { label: 'Push Broadcast',            emoji: '📢', color: '#FF8C55' },
};

// ─── User Profile Modal ───────────────────────────────────────────────────────
function UserProfileModal({
  userId, onClose, colors, isDark,
}: { userId: string; onClose: () => void; colors: any; isDark: boolean }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const card = isDark ? '#29223D' : '#F5F3FF';

  useFocusEffect(useCallback(() => {
    (async () => {
      const [
        { data: p },
        { count: petCount },
        { count: famCount },
        { data: usage },
      ] = await Promise.all([
        supabase.from('profiles')
          .select('id,full_name,avatar_url,created_at,onboarding_completed,ai_consent_accepted_at,is_admin')
          .eq('id', userId).single(),
        supabase.from('pets').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
        supabase.from('pet_family').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('api_usage_logs').select('cost_usd').eq('user_id', userId),
      ]);
      setProfile({
        ...(p as any),
        pet_count:    petCount ?? 0,
        family_count: famCount ?? 0,
        total_cost:   (usage ?? []).reduce((s: number, r: any) => s + (r.cost_usd ?? 0), 0),
        total_calls:  (usage ?? []).length,
      });
      setLoading(false);
    })();
  }, [userId]));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={pm.overlay}>
        <View style={[pm.sheet, { backgroundColor: colors.background }]}>
          <View style={[pm.handle, { backgroundColor: colors.border }]} />
          <View style={[pm.header, { borderBottomColor: colors.border }]}>
            <Text style={[pm.title, { color: colors.textPrimary }]}>User Profile</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={sub} />
            </TouchableOpacity>
          </View>

          {loading
            ? <View style={{ padding: 48, alignItems: 'center' }}><PawBondLoader size={48} isDark={isDark} /></View>
            : profile && (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={pm.scroll} showsVerticalScrollIndicator={false}>
                <View style={pm.avatarRow}>
                  {profile.avatar_url
                    ? <Image source={{ uri: profile.avatar_url }} cachePolicy="memory-disk" style={pm.avatar} />
                    : <View style={[pm.avatarFallback, { backgroundColor: colors.primary + '22' }]}>
                        <Text style={[pm.avatarInitial, { color: colors.primary }]}>
                          {(profile.full_name ?? '?')[0].toUpperCase()}
                        </Text>
                      </View>
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={[pm.name, { color: colors.textPrimary }]}>{profile.full_name ?? 'No name'}</Text>
                    <Text style={[pm.uid, { color: sub }]} selectable numberOfLines={1}>{profile.id}</Text>
                    {profile.is_admin && (
                      <View style={[pm.badge, { backgroundColor: '#7C5CBF22' }]}>
                        <Text style={[pm.badgeText, { color: '#7C5CBF' }]}>Admin</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={[pm.grid, { marginTop: 16 }]}>
                  {([
                    { label: 'Pets',        value: String(profile.pet_count),    color: '#16A34A' },
                    { label: 'Family links', value: String(profile.family_count), color: '#3B82F6' },
                    { label: 'API calls',   value: String(profile.total_calls),  color: '#E8A320' },
                    { label: 'Cost',        value: fmtCost(profile.total_cost),  color: '#E24B4A' },
                  ] as const).map(t => (
                    <View key={t.label} style={[pm.tile, { backgroundColor: card }]}>
                      <Text style={[pm.tileVal, { color: t.color }]}>{t.value}</Text>
                      <Text style={[pm.tileLabel, { color: sub }]}>{t.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={[pm.infoCard, { backgroundColor: card, marginTop: 16 }]}>
                  {([
                    { label: 'Joined',      value: fmtDate(profile.created_at) },
                    { label: 'Onboarding',  value: profile.onboarding_completed ? '✅ Complete' : '⏳ Pending' },
                    { label: 'AI Consent',  value: profile.ai_consent_accepted_at ? `✅ ${fmtDate(profile.ai_consent_accepted_at)}` : '❌ Not given' },
                  ] as const).map((row, i) => (
                    <View key={row.label} style={[pm.infoRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <Text style={[pm.infoLabel, { color: sub }]}>{row.label}</Text>
                      <Text style={[pm.infoVal, { color: colors.textPrimary }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )
          }
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CostsScreen() {
  const { colors, isDark } = useTheme();

  // ── Period state ────────────────────────────────────────────────────────────
  const days7 = last7Days();
  const [mode, setMode]         = useState<Mode>('week');
  const [selectedDay, setSelectedDay] = useState<Date>(days7[days7.length - 1]); // today
  const [customFrom, setCustomFrom]   = useState<Date>(days7[0]);
  const [customTo,   setCustomTo]     = useState<Date>(new Date());
  // date picker sheet
  const [datePicking, setDatePicking] = useState<'from' | 'to' | null>(null);
  const [tempDate, setTempDate]       = useState<Date>(new Date());

  // ── Data state ──────────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const [apiData,   setApiData]   = useState<ApiSummary[]>([]);
  const [topUsers,  setTopUsers]  = useState<UserSummary[]>([]);
  const [storage,   setStorage]   = useState<StorageRow[]>([]);
  const [totalStorage, setTotalStorage] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]             = useState<'api' | 'users' | 'storage'>('api');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showGoTop, setShowGoTop] = useState(false);

  // Resolve the active [since, until] range
  function getRange(): { since: string; until: string } {
    if (mode === 'week') {
      return {
        since: startOfDay(selectedDay).toISOString(),
        until: endOfDay(selectedDay).toISOString(),
      };
    }
    return {
      since: startOfDay(customFrom).toISOString(),
      until: endOfDay(customTo).toISOString(),
    };
  }

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { since, until } = getRange();

    // 1. Per-API summary
    const { data: usageRows } = await supabase
      .from('api_usage_logs')
      .select('api_type,cost_usd,tokens_in,tokens_out,success,user_id')
      .gte('called_at', since).lte('called_at', until);

    const apiMap: Record<string, ApiSummary> = {};
    const userMap: Record<string, { calls: number; cost: number }> = {};

    for (const r of usageRows ?? []) {
      // API map
      if (!apiMap[r.api_type]) apiMap[r.api_type] = { api_type: r.api_type, calls: 0, cost_usd: 0, tokens_in: 0, tokens_out: 0, errors: 0 };
      const m = apiMap[r.api_type];
      m.calls++; m.cost_usd += r.cost_usd ?? 0; m.tokens_in += r.tokens_in ?? 0;
      m.tokens_out += r.tokens_out ?? 0; if (!r.success) m.errors++;
      // User map
      if (r.user_id) {
        if (!userMap[r.user_id]) userMap[r.user_id] = { calls: 0, cost: 0 };
        userMap[r.user_id].calls++; userMap[r.user_id].cost += r.cost_usd ?? 0;
      }
    }
    setApiData(Object.values(apiMap).sort((a, b) => b.cost_usd - a.cost_usd));

    // 2. Top users — resolve names
    const topIds = Object.entries(userMap).sort((a, b) => b[1].cost - a[1].cost).slice(0, 20).map(([id]) => id);
    let nameMap: Record<string, string> = {};
    if (topIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', topIds);
      nameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    }
    setTopUsers(topIds.map(id => ({ user_id: id, full_name: nameMap[id] ?? 'Unknown', calls: userMap[id].calls, cost_usd: userMap[id].cost })));

    // 3. Storage (not date-filtered — always full picture)
    const { data: storageRows } = await supabase.from('storage_usage_summary').select('*').limit(100);
    const sRows = (storageRows ?? []) as StorageRow[];
    // Resolve user UUIDs not already in nameMap from the API usage lookup above
    const storageUuids = [...new Set(sRows.map(r => r.user_id).filter(id => UUID_RE.test(id) && !nameMap[id]))];
    if (storageUuids.length) {
      const { data: ops } = await supabase.from('profiles').select('id,full_name').in('id', storageUuids);
      for (const op of ops ?? []) nameMap[op.id] = op.full_name ?? 'Unknown';
    }
    const resolved = sRows.map(r => ({
      ...r,
      owner_name: UUID_RE.test(r.user_id) ? (nameMap[r.user_id] ?? 'Unknown') : null,
    }));
    setStorage(resolved);
    setTotalStorage(resolved.reduce((s, r) => s + (r.total_bytes ?? 0), 0));

    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [mode, selectedDay, customFrom, customTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const totalCost  = apiData.reduce((s, r) => s + r.cost_usd, 0);
  const totalCalls = apiData.reduce((s, r) => s + r.calls, 0);
  // ── Week strip helpers ────────────────────────────────────────────────────
  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
  const isSel   = (d: Date) => d.toDateString() === selectedDay.toDateString();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>

      {/* ── Period selector ── */}
      <View style={[ps.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>

        {/* Mode tabs */}
        <View style={ps.modeRow}>
          {(['week','custom'] as Mode[]).map(m => (
            <TouchableOpacity key={m} onPress={() => setMode(m)}
              style={[ps.modeBtn, mode === m && { backgroundColor: colors.primary + '18', borderRadius: 10 }]}>
              <Text style={[ps.modeTxt, { color: mode === m ? colors.primary : sub }]}>
                {m === 'week' ? '📅 Day view' : '📆 Custom range'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Week strip */}
        {mode === 'week' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ps.stripRow}>
            {days7.map((d, i) => {
              const sel = isSel(d); const tod = isToday(d);
              return (
                <TouchableOpacity key={i} onPress={() => setSelectedDay(d)}
                  style={[ps.dayPill, sel && { backgroundColor: colors.primary }]}>
                  <Text style={[ps.dayName, { color: sel ? '#fff' : sub }]}>{DAY_LABELS[d.getDay()]}</Text>
                  <Text style={[ps.dayNum,  { color: sel ? '#fff' : colors.textPrimary, fontWeight: tod ? '800' : '600' }]}>{d.getDate()}</Text>
                  {tod && <View style={[ps.todayDot, { backgroundColor: sel ? '#ffffffaa' : colors.primary }]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Custom range */}
        {mode === 'custom' && (
          <View style={ps.rangeRow}>
            <TouchableOpacity style={[ps.dateBtn, { backgroundColor: isDark ? '#29223D' : '#F5F3FF', flex: 1 }]}
              onPress={() => { setTempDate(customFrom); setDatePicking('from'); }}>
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={[ps.dateTxt, { color: colors.textPrimary }]}>
                {MONTH_LABELS[customFrom.getMonth()]} {customFrom.getDate()}, {customFrom.getFullYear()}
              </Text>
            </TouchableOpacity>
            <Text style={[ps.rangeSep, { color: sub }]}>→</Text>
            <TouchableOpacity style={[ps.dateBtn, { backgroundColor: isDark ? '#29223D' : '#F5F3FF', flex: 1 }]}
              onPress={() => { setTempDate(customTo); setDatePicking('to'); }}>
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={[ps.dateTxt, { color: colors.textPrimary }]}>
                {MONTH_LABELS[customTo.getMonth()]} {customTo.getDate()}, {customTo.getFullYear()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ps.applyBtn, { backgroundColor: colors.primary }]} onPress={() => load()}>
              <Text style={ps.applyTxt}>Apply</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Content ── */}
      {loading
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <PawBondLoader size={52} isDark={isDark} />
          </View>
        : (
          
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
              {/* Summary cards */}
              <View style={s.summaryRow}>
                <SumCard label="Total cost"   value={fmtCost(totalCost)}           color="#E24B4A" card={card} sub={sub} />
                <SumCard label="API calls"    value={totalCalls.toLocaleString()}   color={colors.primary} card={card} sub={sub} />
                <SumCard label="Storage used" value={fmtBytes(totalStorage)}        color="#16A34A" card={card} sub={sub} />
              </View>

              {/* Tabs */}
              <View style={[s.tabs, { backgroundColor: card, marginBottom: 14 }]}>
                {(['api','users','storage'] as const).map(t => (
                  <TouchableOpacity key={t}
                    style={[s.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                    onPress={() => setTab(t)}>
                    <Text style={[s.tabText, { color: tab === t ? colors.primary : sub }]}>
                      {t === 'api' ? '🔌 By API' : t === 'users' ? '👤 By User' : '🗄️ Storage'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── API tab ── */}
              {tab === 'api' && (
                <View style={[s.card, { backgroundColor: card }]}>
                  {apiData.length === 0
                    ? <Text style={[s.empty, { color: sub }]}>No API calls in this period</Text>
                    : apiData.map((a, i) => {
                        const info = API_LABELS[a.api_type] ?? { label: a.api_type, emoji: '⚙️', color: '#6B7280' };
                        const errPct = a.calls > 0 ? Math.round((a.errors / a.calls) * 100) : 0;
                        return (
                          <View key={a.api_type} style={[s.apiRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                            <View style={[s.apiIcon, { backgroundColor: info.color + '18' }]}>
                              <Text style={{ fontSize: TYPO.heading }}>{info.emoji}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[s.apiLabel, { color: colors.textPrimary }]}>{info.label}</Text>
                              <Text style={[s.apiSub, { color: sub }]}>
                                {a.calls.toLocaleString()} calls
                                {a.tokens_in > 0 ? ` · ${(a.tokens_in / 1000).toFixed(0)}K in / ${(a.tokens_out / 1000).toFixed(0)}K out` : ''}
                                {errPct > 0 ? ` · ⚠ ${errPct}% errors` : ''}
                              </Text>
                            </View>
                            <Text style={[s.apiCost, { color: a.cost_usd > 0.5 ? '#E24B4A' : colors.textPrimary }]}>
                              {fmtCost(a.cost_usd)}
                            </Text>
                          </View>
                        );
                      })
                  }
                </View>
              )}

              {/* ── Users tab ── */}
              {tab === 'users' && (
                <View style={[s.card, { backgroundColor: card }]}>
                  {topUsers.length === 0
                    ? <Text style={[s.empty, { color: sub }]}>No usage in this period</Text>
                    : topUsers.map((u, i) => (
                        <TouchableOpacity key={u.user_id} onPress={() => setProfileUserId(u.user_id)} activeOpacity={0.7}
                          style={[s.userRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                          <View style={[s.rankBadge, { backgroundColor: i < 3 ? colors.primary + '22' : colors.card }]}>
                            <Text style={[s.rankText, { color: i < 3 ? colors.primary : sub }]}>#{i + 1}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.userName, { color: colors.textPrimary }]}>{u.full_name ?? 'Unknown'}</Text>
                            <Text style={[s.userSub, { color: sub }]}>{u.calls} calls</Text>
                          </View>
                          <Text style={[s.userCost, { color: u.cost_usd > 0.1 ? '#E24B4A' : colors.textPrimary }]}>
                            {fmtCost(u.cost_usd)}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={sub} style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      ))
                  }
                </View>
              )}

              {/* ── Storage tab — grouped by user ── */}
              {tab === 'storage' && (
                <View style={[s.card, { backgroundColor: card }]}>
                  {storage.length === 0
                    ? <Text style={[s.empty, { color: sub }]}>No storage data</Text>
                    : storage.map((r, i) => {
                        const isUuid = UUID_RE.test(r.user_id);
                        const isSponsored = r.user_id === 'sponsored';
                        const emoji = isSponsored ? '📢' : isUuid ? '🐾' : '🗂️';
                        const displayName = r.owner_name ?? (isSponsored ? 'Sponsored assets' : r.user_id);
                        const hot = (r.total_bytes ?? 0) > 100_000_000;
                        return (
                          <TouchableOpacity
                            key={`${r.user_id}-${i}`}
                            onPress={() => isUuid ? setProfileUserId(r.user_id) : undefined}
                            activeOpacity={isUuid ? 0.7 : 1}
                            style={[s.userRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                          >
                            <View style={[s.stIcon, { backgroundColor: isUuid ? colors.primary + '18' : '#6B728018' }]}>
                              <Text style={{ fontSize: TYPO.heading }}>{emoji}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[s.userName, { color: isUuid ? colors.primary : colors.textPrimary }]} numberOfLines={1}>
                                {displayName}
                              </Text>
                              <Text style={[s.userSub, { color: sub }]}>{r.file_count} files</Text>
                            </View>
                            <Text style={[s.userCost, { color: hot ? '#E24B4A' : colors.textPrimary }]}>
                              {fmtBytes(r.total_bytes ?? 0)}
                            </Text>
                            {isUuid && <Ionicons name="chevron-forward" size={14} color={sub} style={{ marginLeft: 4 }} />}
                          </TouchableOpacity>
                        );
                      })
                  }
                  {storage.length > 0 && (
                    <View style={[s.userRow, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: isDark ? '#29223D' : '#F5F3FF' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.userName, { color: sub, fontSize: TYPO.body, letterSpacing: 0.5 }]}>TOTAL</Text>
                      </View>
                      <Text style={[s.userCost, { color: colors.primary }]}>{fmtBytes(totalStorage)}</Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          
        )
      }

      {showGoTop && (
        <TouchableOpacity
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Profile modal ── */}
      {profileUserId && (
        <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} colors={colors} isDark={isDark} />
      )}

      {/* ── Date picker ── */}
      <AppDateTimePicker
        visible={datePicking !== null}
        value={tempDate}
        mode="date"
        maximumDate={new Date()}
        minimumDate={datePicking === 'to' ? customFrom : undefined}
        accent={colors.primary}
        onCancel={() => setDatePicking(null)}
        onConfirm={(d) => {
          if (datePicking === 'from') setCustomFrom(d); else setCustomTo(d);
          setDatePicking(null);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function SumCard({ label, value, color, card, sub }: any) {
  return (
    <View style={[s.sumCard, { backgroundColor: card }]}>
      <Text style={[s.sumVal, { color }]}>{value}</Text>
      <Text style={[s.sumLabel, { color: sub }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ps = StyleSheet.create({
  container: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  modeRow:   { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 6 },
  modeBtn:   { flex: 1, alignItems: 'center', paddingVertical: 8 },
  modeTxt:   { fontSize: TYPO.body, fontWeight: '700' },
  stripRow:  { paddingHorizontal: 12, paddingTop: 10, gap: 6 },
  dayPill:   { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, minWidth: 50 },
  dayName:   { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.3 },
  dayNum:    { fontSize: TYPO.subheading, marginTop: 2 },
  todayDot:  { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  rangeRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  dateBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  dateTxt:   { fontSize: TYPO.body, fontWeight: '600' },
  rangeSep:  { fontSize: TYPO.subheading, fontWeight: '600' },
  applyBtn:  { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  applyTxt:  { color: '#fff', fontSize: TYPO.body, fontWeight: '700' },
});

const s = StyleSheet.create({
  scroll:      { padding: 14 },
  summaryRow:  { flexDirection: 'row', gap: 10, marginBottom: 14 },
  sumCard:     { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  sumVal:      { fontSize: TYPO.heading, fontWeight: '800' },
  sumLabel:    { fontSize: TYPO.body, marginTop: 3, fontWeight: '600' },
  tabs:        { flexDirection: 'row', borderRadius: 14, overflow: 'hidden' },
  tabBtn:      { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabText:     { fontSize: TYPO.body, fontWeight: '700' },
  card:        { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  apiRow:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  apiIcon:     { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  apiLabel:    { fontSize: TYPO.body, fontWeight: '700' },
  apiSub:      { fontSize: TYPO.body, marginTop: 2 },
  apiCost:     { fontSize: TYPO.body, fontWeight: '800' },
  userRow:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rankBadge:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rankText:    { fontSize: TYPO.body, fontWeight: '800' },
  userName:    { fontSize: TYPO.body, fontWeight: '700' },
  userSub:     { fontSize: TYPO.body, marginTop: 1 },
  userCost:    { fontSize: TYPO.body, fontWeight: '800' },
  stIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty:       { padding: 24, textAlign: 'center', fontSize: TYPO.body },
});

const pm = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 24, maxHeight: '85%' },
  handle:        { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title:         { fontSize: TYPO.subheading, fontWeight: '700' },
  scroll:        { padding: 20 },
  avatarRow:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:        { width: 64, height: 64, borderRadius: 32 },
  avatarFallback:{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: TYPO.hero, fontWeight: '800' },
  name:          { fontSize: TYPO.heading, fontWeight: '800' },
  uid:           { fontSize: TYPO.body, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  badge:         { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  badgeText:     { fontSize: TYPO.body, fontWeight: '700' },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:          { width: '47.5%', borderRadius: 14, padding: 14, alignItems: 'center' },
  tileVal:       { fontSize: TYPO.title, fontWeight: '800' },
  tileLabel:     { fontSize: TYPO.body, marginTop: 3, fontWeight: '600' },
  infoCard:      { borderRadius: 16, overflow: 'hidden' },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  infoLabel:     { fontSize: TYPO.body, fontWeight: '600' },
  infoVal:       { fontSize: TYPO.body, fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 12 },
});

const dp = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerTitle: { fontSize: TYPO.subheading, fontWeight: '700' },
  cancel:      { fontSize: TYPO.body, fontWeight: '500' },
  done:        { fontSize: TYPO.body, fontWeight: '700' },
});
