import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, TextInput,  Modal, Platform,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import LazyImage from '@/components/LazyImage';
import {
  getAdminUsers, setUserAdmin,
  type AdminUserRow, type UserFilter, type UserSort,
} from '@/lib/db/admin';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

type UserRow = AdminUserRow;
type Filter  = UserFilter;
type Sort    = UserSort;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'new7d',     label: 'New 7d' },
  { key: 'onboarded', label: 'Onboarded' },
  { key: 'consented', label: 'AI Consent' },
  { key: 'admin',     label: 'Admin' },
];

function fmtDate(s: string) { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }); }

export default function UsersScreen() {
  const { colors, isDark } = useTheme();
  const listRef    = useRef<FlashListRef<any>>(null);
  const loadedOnce = useRef(false);
  const searchRef  = useRef('');

  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showGoTop, setShowGoTop] = useState(false);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<Filter>('all');
  const [sort, setSort]         = useState<Sort>('newest');
  const [offset, setOffset]     = useState(0);
  const [hasMore, setHasMore]   = useState(true);
  // Date range
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate,   setToDate]   = useState<Date | null>(null);
  const [datePick, setDatePick] = useState<'from' | 'to' | null>(null);
  const [tempDate, setTempDate] = useState(new Date());

  const load = useCallback(async (reset = false, silent = false) => {
    const off = reset ? 0 : offset;
    if (!silent && !loadedOnce.current) setLoading(true);
    try {
      const { users: enriched, hasMore: more } = await getAdminUsers({
        filter, sort, search: searchRef.current, fromDate, toDate, offset: off,
      });
      setUsers(reset ? enriched : prev => [...prev, ...enriched]);
      setOffset(off + 30);
      setHasMore(more);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  }, [offset, filter, sort, fromDate, toDate]);

  useEffect(() => { load(true); }, [filter, sort, fromDate, toDate]);

  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) load(true, true);
  }, [load]));

  const onSearch = (text: string) => {
    setSearch(text);
    searchRef.current = text;
    load(true);
  };

  const toggleAdmin = async (user: UserRow) => {
    const next = !user.is_admin;
    showAlert(
      next ? 'Grant Admin?' : 'Revoke Admin?',
      `${user.full_name ?? 'This user'} will ${next ? 'gain' : 'lose'} admin access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: next ? 'default' : 'destructive', onPress: async () => {
          try {
            await setUserAdmin(user.id, next);
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_admin: next } : u));
          } catch (e: any) {
            showAlert('Error', e.message);
          }
        }},
      ]
    );
  };

  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const inp  = isDark ? '#2A2242' : '#F4F0FF';

  const hasDateFilter = !!(fromDate || toDate);

  const renderUser = ({ item: u }: { item: UserRow }) => (
    <View style={[s.userCard, { backgroundColor: card }]}>
      <View style={s.userRow}>
        {u.avatar_url
          ? <LazyImage uri={u.avatar_url} style={s.avatar} />
          : <View style={[s.avatar, { backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: TYPO.heading, fontWeight: '700', color: colors.primary }}>
                {(u.full_name ?? '?')[0]?.toUpperCase()}
              </Text>
            </View>
        }
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[s.userName, { color: colors.textPrimary }]} numberOfLines={1}>{u.full_name ?? 'No name'}</Text>
            {u.is_admin && <View style={[s.adminBadge, { backgroundColor: colors.primary }]}><Text style={s.adminText}>ADMIN</Text></View>}
          </View>
          <Text style={[s.userMeta, { color: sub }]}>
            Joined {fmtDate(u.created_at)} · {u.pet_count} pet{u.pet_count !== 1 ? 's' : ''} · {u.family_count} links
          </Text>
          <View style={s.pillRow}>
            {u.onboarding_completed && <Pill label="Onboarded" color="#16A34A" />}
            {u.ai_mood_consent      && <Pill label="AI Consent" color="#7C5CBF" />}
            {!u.onboarding_completed && <Pill label="Pending setup" color="#E8A320" />}
          </View>
        </View>
        <TouchableOpacity onPress={() => toggleAdmin(u)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={u.is_admin ? 'shield-checkmark' : 'shield-outline'} size={22} color={u.is_admin ? colors.primary : sub} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>

      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchInner, { backgroundColor: inp, borderRadius: 12 }]}>
          <Ionicons name="search-outline" size={16} color={sub} />
          <TextInput
            style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder="Search by name…" placeholderTextColor={sub}
            value={search} onChangeText={onSearch}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => onSearch('')}>
              <Ionicons name="close-circle" size={16} color={sub} />
            </TouchableOpacity>
          ) : null}
        </View>
        {/* Sort button */}
        <TouchableOpacity
          style={[s.sortBtn, { backgroundColor: inp }]}
          onPress={() => {
            const next: Sort[] = ['newest', 'oldest', 'az'];
            setSort(s => next[(next.indexOf(s) + 1) % next.length]);
          }}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.primary} />
          <Text style={[s.sortText, { color: colors.primary }]}>
            {sort === 'newest' ? 'Newest' : sort === 'oldest' ? 'Oldest' : 'A–Z'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips + date range */}
      <View style={[s.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <FlashList
          horizontal showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={f => f.key}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
          renderItem={({ item: f }) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                onPress={() => setFilter(f.key)}
                style={[s.chip, { backgroundColor: active ? colors.primary : inp, borderColor: active ? colors.primary : 'transparent' }]}
              >
                <Text style={[s.chipText, { color: active ? '#fff' : sub }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
              <TouchableOpacity
                onPress={() => { setTempDate(fromDate ?? new Date()); setDatePick('from'); }}
                style={[s.chip, { backgroundColor: fromDate ? colors.primary + '22' : inp, borderColor: fromDate ? colors.primary : 'transparent' }]}
              >
                <Ionicons name="calendar-outline" size={13} color={fromDate ? colors.primary : sub} />
                <Text style={[s.chipText, { color: fromDate ? colors.primary : sub }]}>
                  {fromDate ? `From ${fmtDate(fromDate.toISOString())}` : 'From date'}
                </Text>
                {fromDate && <TouchableOpacity onPress={() => setFromDate(null)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Ionicons name="close-circle" size={12} color={colors.primary} />
                </TouchableOpacity>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setTempDate(toDate ?? new Date()); setDatePick('to'); }}
                style={[s.chip, { backgroundColor: toDate ? colors.primary + '22' : inp, borderColor: toDate ? colors.primary : 'transparent' }]}
              >
                <Ionicons name="calendar-outline" size={13} color={toDate ? colors.primary : sub} />
                <Text style={[s.chipText, { color: toDate ? colors.primary : sub }]}>
                  {toDate ? `To ${fmtDate(toDate.toISOString())}` : 'To date'}
                </Text>
                {toDate && <TouchableOpacity onPress={() => setToDate(null)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Ionicons name="close-circle" size={12} color={colors.primary} />
                </TouchableOpacity>}
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      <FlashList
        ref={listRef}
        data={users}
        keyExtractor={u => u.id}
        renderItem={renderUser}
        style={{ flex: 1 }}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 32 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onEndReached={() => hasMore && !loading && load()}
        onEndReachedThreshold={0.3}
        onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
        scrollEventThrottle={16}
        ListFooterComponent={loading ? <View style={{ alignItems: 'center', padding: 20 }}><PawBondLoader size={36} isDark={isDark} /></View> : null}
        ListEmptyComponent={!loading ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 36 }}>👤</Text>
            <Text style={[s.emptyText, { color: sub }]}>No users found</Text>
            {hasDateFilter && <Text style={[s.emptySub, { color: sub }]}>Try clearing the date filter</Text>}
          </View>
        ) : null}
      />

      {/* Date pickers */}
      <AppDateTimePicker
        visible={datePick !== null}
        value={tempDate}
        mode="date"
        maximumDate={new Date()}
        accent={colors.primary}
        onCancel={() => setDatePick(null)}
        onConfirm={(d) => {
          if (datePick === 'from') setFromDate(d); else setToDate(d);
          setDatePick(null);
        }}
      />
      {showGoTop && (
        <TouchableOpacity
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={{ position: 'absolute', bottom: 24, right: 20, width: 44, height: 44, borderRadius: 22,
            backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.pill, { backgroundColor: color + '18' }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: TYPO.body },
  sortBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  sortText:    { fontSize: TYPO.body, fontWeight: '700' },
  filterBar:   { borderBottomWidth: StyleSheet.hairlineWidth },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipText:    { fontSize: TYPO.body, fontWeight: '600' },
  userCard:    { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 5, elevation: 2 },
  userRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:      { width: 48, height: 48, borderRadius: 24 },
  userName:    { fontSize: TYPO.body, fontWeight: '700', flex: 1 },
  userMeta:    { fontSize: TYPO.body },
  pillRow:     { flexDirection: 'row', gap: 5, marginTop: 4, flexWrap: 'wrap' },
  pill:        { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  pillText:    { fontSize: TYPO.body, fontWeight: '700' },
  adminBadge:  { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminText:   { fontSize: TYPO.body, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  empty:       { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyText:   { fontSize: TYPO.body, fontWeight: '600' },
  emptySub:    { fontSize: TYPO.body },
});

const dp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title:   { fontSize: TYPO.subheading, fontWeight: '700' },
  cancel:  { fontSize: TYPO.body },
  done:    { fontSize: TYPO.body, fontWeight: '700' },
});
