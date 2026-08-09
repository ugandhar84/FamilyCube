import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text,  TouchableOpacity,
  StyleSheet, Alert, TextInput, Modal, Platform,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import LazyImage from '@/components/LazyImage';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { toTitle } from '@/lib/format';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

type PetRow = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  emoji: string;
  avatar_url: string | null;
  is_active: boolean;
  owner_id: string;
  owner_name: string | null;
  created_at: string;
  family_count: number;
};

type StatusFilter = 'all' | 'active' | 'inactive';
type Sort = 'newest' | 'oldest' | 'az';

const SPECIES = ['dog','cat','rabbit','bird','hamster','fish','turtle','other'];
const SPECIES_EMOJI: Record<string, string> = {
  dog:'🐶', cat:'🐱', rabbit:'🐰', bird:'🐦', hamster:'🐹', fish:'🐠', turtle:'🐢', other:'🐾',
};
const PAGE = 30;

function fmtDate(s: string) { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }); }

export default function PetsScreen() {
  const { colors, isDark } = useTheme();
  const listRef    = useRef<FlashListRef<any>>(null);
  const loadedOnce = useRef(false);

  const [pets, setPets]               = useState<PetRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [species, setSpecies]         = useState<string | null>(null);
  const [status, setStatus]           = useState<StatusFilter>('all');
  const [showGoTop, setShowGoTop]     = useState(false);
  const [sort, setSort]               = useState<Sort>('newest');
  const [offset, setOffset]           = useState(0);
  const [hasMore, setHasMore]         = useState(true);
  const [fromDate, setFromDate]       = useState<Date | null>(null);
  const [toDate,   setToDate]         = useState<Date | null>(null);
  const [datePick, setDatePick]       = useState<'from' | 'to' | null>(null);
  const [tempDate, setTempDate]       = useState(new Date());

  const load = useCallback(async (reset = false, silent = false) => {
    const off = reset ? 0 : offset;
    if (!silent && !loadedOnce.current) setLoading(true);

    let query = supabase
      .from('pets')
      .select('id,name,species,breed,emoji,avatar_url,is_active,owner_id,created_at,profiles(full_name)');

    if (search.trim()) query = query.ilike('name', `%${search}%`);
    if (species)  query = query.eq('species', species);
    if (status === 'active')   query = query.eq('is_active', true);
    if (status === 'inactive') query = query.eq('is_active', false);
    if (fromDate) query = query.gte('created_at', fromDate.toISOString());
    if (toDate)   { const e = new Date(toDate); e.setHours(23,59,59,999); query = query.lte('created_at', e.toISOString()); }

    if (sort === 'newest') query = query.order('created_at', { ascending: false });
    else if (sort === 'oldest') query = query.order('created_at', { ascending: true });
    else query = query.order('name', { ascending: true });

    query = query.range(off, off + PAGE - 1);

    const { data, error } = await query;
    if (error) { showAlert('Error', error.message); setLoading(false); return; }

    const enriched: PetRow[] = await Promise.all((data ?? []).map(async (p: any) => {
      const { count: famCount } = await supabase
        .from('pet_family').select('id', { count: 'exact', head: true }).eq('pet_id', p.id);
      return { ...p, owner_name: p.profiles?.full_name ?? null, family_count: famCount ?? 0 };
    }));

    setPets(reset ? enriched : prev => [...prev, ...enriched]);
    setOffset(off + PAGE);
    setHasMore((data?.length ?? 0) === PAGE);
    setLoading(false);
    loadedOnce.current = true;
  }, [offset, search, species, status, sort, fromDate, toDate]);

  useEffect(() => { load(true); }, [species, status, sort, fromDate, toDate]);

  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) load(true, true);
  }, [load]));

  const toggleActive = async (pet: PetRow) => {
    const next = !pet.is_active;
    showAlert(next ? 'Activate pet?' : 'Deactivate pet?', pet.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: next ? 'Activate' : 'Deactivate', style: next ? 'default' : 'destructive', onPress: async () => {
        const { error } = await supabase.from('pets').update({ is_active: next }).eq('id', pet.id);
        if (error) showAlert('Error', error.message);
        else setPets(prev => prev.map(p => p.id === pet.id ? { ...p, is_active: next } : p));
      }},
    ]);
  };

  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';
  const inp  = isDark ? '#2A2242' : '#F4F0FF';

  const renderPet = ({ item: p }: { item: PetRow }) => (
    <View style={[s.card, { backgroundColor: card }]}>
      <View style={s.row}>
        {p.avatar_url
          ? <LazyImage uri={p.avatar_url} style={s.avatar} />
          : <View style={[s.avatar, { backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: TYPO.title }}>{SPECIES_EMOJI[p.species] ?? p.emoji}</Text>
            </View>
        }
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.name, { color: colors.textPrimary }]}>{p.name}</Text>
            <View style={[s.statusPill, { backgroundColor: p.is_active ? '#16A34A18' : '#E24B4A18' }]}>
              <Text style={[s.statusText, { color: p.is_active ? '#16A34A' : '#E24B4A' }]}>
                {p.is_active ? '● active' : '○ inactive'}
              </Text>
            </View>
          </View>
          <Text style={[s.meta, { color: sub }]}>
            {SPECIES_EMOJI[p.species]} {toTitle(p.species)}{p.breed ? ` · ${toTitle(p.breed)}` : ''}
          </Text>
          <Text style={[s.meta, { color: sub }]}>
            Owner: {p.owner_name ?? '—'} · {p.family_count} family · Added {fmtDate(p.created_at)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => toggleActive(p)} style={s.toggleBtn}>
          <Ionicons name={p.is_active ? 'eye' : 'eye-off-outline'} size={20} color={p.is_active ? '#16A34A' : sub} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>

      {/* Search + sort */}
      <View style={[s.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchInner, { backgroundColor: inp }]}>
          <Ionicons name="search-outline" size={16} color={sub} />
          <TextInput
            style={[s.searchInput, { color: colors.textPrimary }]}
            placeholder="Search pet name…" placeholderTextColor={sub}
            value={search}
            onChangeText={t => { setSearch(t); load(true); }}
            returnKeyType="search"
          />
          {search ? <TouchableOpacity onPress={() => { setSearch(''); load(true); }}><Ionicons name="close-circle" size={16} color={sub} /></TouchableOpacity> : null}
        </View>
        <TouchableOpacity style={[s.sortBtn, { backgroundColor: inp }]}
          onPress={() => { const opts: Sort[] = ['newest','oldest','az']; setSort(s => opts[(opts.indexOf(s)+1)%opts.length]); }}>
          <Ionicons name="swap-vertical" size={16} color={colors.primary} />
          <Text style={[s.sortText, { color: colors.primary }]}>
            {sort === 'newest' ? 'Newest' : sort === 'oldest' ? 'Oldest' : 'A–Z'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter row 1: Status */}
      <View style={[s.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['all','active','inactive'] as StatusFilter[]).map(st => (
          <TouchableOpacity key={st}
            onPress={() => setStatus(st)}
            style={[s.chip, { backgroundColor: status === st ? colors.primary : inp, borderColor: status === st ? colors.primary : 'transparent' }]}>
            <Text style={[s.chipText, { color: status === st ? '#fff' : sub }]}>
              {st === 'all' ? 'All' : st === 'active' ? '● Active' : '○ Inactive'}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => { setTempDate(fromDate ?? new Date()); setDatePick('from'); }}
          style={[s.chip, { backgroundColor: fromDate ? colors.primary + '22' : inp, borderColor: 'transparent' }]}>
          <Ionicons name="calendar-outline" size={13} color={fromDate ? colors.primary : sub} />
          <Text style={[s.chipText, { color: fromDate ? colors.primary : sub }]}>
            {fromDate ? fmtDate(fromDate.toISOString()) : 'From'}
          </Text>
          {fromDate && <TouchableOpacity onPress={() => setFromDate(null)}><Ionicons name="close-circle" size={12} color={colors.primary} /></TouchableOpacity>}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setTempDate(toDate ?? new Date()); setDatePick('to'); }}
          style={[s.chip, { backgroundColor: toDate ? colors.primary + '22' : inp, borderColor: 'transparent' }]}>
          <Ionicons name="calendar-outline" size={13} color={toDate ? colors.primary : sub} />
          <Text style={[s.chipText, { color: toDate ? colors.primary : sub }]}>
            {toDate ? fmtDate(toDate.toISOString()) : 'To'}
          </Text>
          {toDate && <TouchableOpacity onPress={() => setToDate(null)}><Ionicons name="close-circle" size={12} color={colors.primary} /></TouchableOpacity>}
        </TouchableOpacity>
      </View>

      {/* Species chips */}
      <FlashList
        horizontal showsHorizontalScrollIndicator={false}
        data={[null, ...SPECIES]}
        keyExtractor={i => i ?? 'all'}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
        style={{ flexGrow: 0, backgroundColor: colors.card }}
        renderItem={({ item }) => {
          const active = species === item;
          return (
            <TouchableOpacity
              onPress={() => setSpecies(item)}
              style={[s.chip, { backgroundColor: active ? colors.primary : inp, borderColor: active ? colors.primary : 'transparent' }]}
            >
              <Text style={[s.chipText, { color: active ? '#fff' : sub }]}>
                {item ? `${SPECIES_EMOJI[item]} ${item}` : 'All species'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlashList
        ref={listRef}
        data={pets}
        keyExtractor={p => p.id}
        renderItem={renderPet}
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
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🐾</Text>
            <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: sub }}>No pets found</Text>
          </View>
        ) : null}
      />

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

const s = StyleSheet.create({
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: TYPO.body },
  sortBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  sortText:    { fontSize: TYPO.body, fontWeight: '700' },
  filterRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 5 },
  chipText:    { fontSize: TYPO.body, fontWeight: '600' },
  card:        { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 5, elevation: 2 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:      { width: 50, height: 50, borderRadius: 25 },
  name:        { fontSize: TYPO.body, fontWeight: '700' },
  meta:        { fontSize: TYPO.body },
  statusPill:  { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:  { fontSize: TYPO.body, fontWeight: '700' },
  toggleBtn:   { padding: 6 },
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
