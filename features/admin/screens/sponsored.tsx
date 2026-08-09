import { showAlert } from '@/components/AppAlert';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text,  TouchableOpacity,
  StyleSheet, Alert, Switch, useWindowDimensions,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import LazyImage from '@/components/LazyImage';
import {
  getAdminSponsoredListings, toggleSponsoredActive, deleteSponsoredListing,
  type AdminListing,
} from '@/lib/db/admin';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { TYPO } from '@/constants/theme';

export type Listing = AdminListing;

const CATEGORY_EMOJI: Record<string, string> = {
  clinic: '🏥', food: '🥩', toy: '🎾', facility: '🏢',
  grooming: '✂️', boarding: '🏠', training: '🎓',
  insurance: '🛡️', other: '📦',
};

const CATEGORY_COLOR: Record<string, string> = {
  clinic: '#E24B4A', food: '#16A34A', toy: '#E8A320', facility: '#3B82F6',
  grooming: '#7C5CBF', boarding: '#FF8C55', training: '#6B7280',
  insurance: '#0891B2', other: '#9CA3AF',
};

export default function SponsoredScreen() {
  const { colors, isDark } = useTheme();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<string | null>(null);
  const loadedOnce = useRef(false);
  const listRef = useRef<FlashListRef<any>>(null);
  const [showGoTop, setShowGoTop] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getAdminSponsoredListings(filter);
      setListings(data);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [filter]);
  useFocusEffect(useCallback(() => {
    if (loadedOnce.current) load(true);
    else loadedOnce.current = true;
  }, [load]));

  const toggleActive = async (l: Listing) => {
    const next = !l.is_active;
    try {
      await toggleSponsoredActive(l.id, next);
      setListings(prev => prev.map(x => x.id === l.id ? { ...x, is_active: next } : x));
    } catch (e: any) {
      showAlert('Error', e.message);
    }
  };

  const deleteListing = (l: Listing) => {
    showAlert('Delete listing?', `"${l.business_name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteSponsoredListing(l.id);
          setListings(prev => prev.filter(x => x.id !== l.id));
        } catch (e: any) {
          showAlert('Error', e.message);
        }
      }},
    ]);
  };

  const { width: SW } = useWindowDimensions();
  const card = isDark ? '#1E1A2E' : '#FFFFFF';
  const sub  = isDark ? '#9A8FC0' : '#8A7FAA';

  const CATEGORIES = ['clinic','food','toy','facility','grooming','boarding','training','insurance','other'];

  const renderItem = ({ item: l }: { item: Listing }) => {
    const catColor = CATEGORY_COLOR[l.category] ?? '#6B7280';
    const ctr = l.impressions > 0 ? ((l.clicks / l.impressions) * 100).toFixed(1) : '0.0';
    return (
      <View style={[s.card, { backgroundColor: card }]}>
        {/* Header */}
        <View style={s.cardHead}>
          {l.logo_url
            ? <LazyImage uri={l.logo_url} style={s.logo} />
            : <View style={[s.logo, { backgroundColor: catColor + '22', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: TYPO.title }}>{CATEGORY_EMOJI[l.category] ?? '📦'}</Text>
              </View>
          }
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[s.bizName, { color: colors.textPrimary }]}>{l.business_name}</Text>
              {l.is_featured && <View style={[s.pill, { backgroundColor: '#E8A32020', borderColor: '#E8A32050' }]}>
                <Text style={[s.pillText, { color: '#E8A320' }]}>⭐ FEATURED</Text>
              </View>}
            </View>
            <View style={[s.catPill, { backgroundColor: catColor + '18' }]}>
              <Text style={[s.catText, { color: catColor }]}>{CATEGORY_EMOJI[l.category]} {l.category}</Text>
            </View>
            {l.city ? <Text style={[s.location, { color: sub }]}>📍 {l.city}</Text> : null}
          </View>
          <Switch
            value={l.is_active}
            onValueChange={() => toggleActive(l)}
            trackColor={{ true: '#16A34A', false: colors.border }}
            thumbColor="#fff"
          />
        </View>

        {/* Stats */}
        <View style={[s.statsRow, { borderTopColor: colors.border }]}>
          <StatCell label="Impressions" value={l.impressions.toLocaleString()} />
          <StatCell label="Clicks" value={l.clicks.toLocaleString()} />
          <StatCell label="CTR" value={`${ctr}%`} color={parseFloat(ctr) > 2 ? '#16A34A' : undefined} />
          <StatCell label="Priority" value={String(l.priority)} />
        </View>

        {/* Live preview */}
        <AdPreview listing={l} colors={colors} isDark={isDark} />

        {/* Actions */}
        <View style={[s.actions, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => router.push({ pathname: '/admin/sponsored-edit', params: { id: l.id } })}
          >
            <Ionicons name="pencil-outline" size={16} color={colors.primary} />
            <Text style={[s.actionText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => deleteListing(l)}>
            <Ionicons name="trash-outline" size={16} color="#E24B4A" />
            <Text style={[s.actionText, { color: '#E24B4A' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      {/* Category filter */}
      <View style={{ paddingVertical: 10, paddingLeft: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <FlashList
          horizontal showsHorizontalScrollIndicator={false}
          data={[null, ...CATEGORIES]}
          keyExtractor={i => i ?? 'all'}
          contentContainerStyle={{ gap: 8, paddingRight: 12 }}
          renderItem={({ item }) => {
            const active = filter === item;
            const col = item ? CATEGORY_COLOR[item] : colors.primary;
            return (
              <TouchableOpacity
                onPress={() => setFilter(item)}
                style={[s.filterChip, { backgroundColor: active ? col : colors.card, borderColor: active ? col : colors.border }]}
              >
                <Text style={[s.filterText, { color: active ? '#fff' : sub }]}>
                  {item ? `${CATEGORY_EMOJI[item]} ${item}` : 'All'}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlashList
        ref={listRef}
        data={listings}
        keyExtractor={l => l.id}
        renderItem={renderItem}
        style={{ flex: 1 }}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{ padding: 12, gap: 10 }}
        onScroll={e => setShowGoTop(e.nativeEvent.contentOffset.y > 300)}
        scrollEventThrottle={16}
        ListFooterComponent={loading ? <View style={{ alignItems: 'center', padding: 16 }}><PawBondLoader size={36} isDark={isDark} /></View> : null}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: sub }]}>No listings. Tap + to add one.</Text> : null}
      />

      {/* FAB — scrolled: go to top; at top: add new */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: colors.primary }]}
        onPress={showGoTop ? () => listRef.current?.scrollToOffset({ offset: 0, animated: true }) : () => router.push('/admin/sponsored-edit')}
        activeOpacity={0.85}
      >
        <Ionicons name={showGoTop ? 'chevron-up' : 'add'} size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[s.statVal, { color: color ?? colors.textPrimary }]}>{value}</Text>
      <Text style={{ fontSize: TYPO.body, color: '#9A8FC0', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function AdPreview({ listing: l, colors, isDark }: { listing: Listing; colors: any; isDark: boolean }) {
  const accentCol = CATEGORY_COLOR[l.category] ?? '#6B7280';
  const CAT_EMOJI: Record<string, string> = {
    clinic: '🏥', food: '🥩', toy: '🎾', facility: '🏢',
    grooming: '✂️', boarding: '🏠', training: '🎓', insurance: '🛡️', other: '📦',
  };

  return (
    <View style={[p.wrap, { borderTopColor: colors.border }]}>
      <Text style={[p.previewLabel, { color: '#9A8FC0' }]}>CLIENT PREVIEW</Text>
      <View style={[p.card, { backgroundColor: isDark ? '#2A2242' : '#F8F6FF' }]}>
        {/* Cover */}
        {l.cover_url
          ? <LazyImage uri={l.cover_url} style={p.cover} />
          : (
            <LinearGradient
              colors={[accentCol + 'CC', accentCol + '55']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[p.cover, { alignItems: 'center', justifyContent: 'center' }]}
            >
              <Text style={{ fontSize: 40 }}>{CAT_EMOJI[l.category] ?? '📦'}</Text>
            </LinearGradient>
          )
        }
        {/* Sponsored badge */}
        <View style={[p.badge, { backgroundColor: accentCol }]}>
          <Text style={p.badgeText}>Sponsored</Text>
        </View>
        {/* Body */}
        <View style={p.body}>
          <View style={{ flex: 1 }}>
            <Text style={[p.name, { color: colors.textPrimary }]} numberOfLines={1}>{l.business_name}</Text>
            {l.cover_url === null && l.logo_url === null
              ? <Text style={{ fontSize: TYPO.body, color: '#9A8FC0', marginTop: 2 }}>⚠ No image — add cover/logo</Text>
              : null
            }
            {l.city ? <Text style={[p.city, { color: '#9A8FC0' }]}>📍 {l.city}</Text> : null}
          </View>
          <View style={[p.cta, { backgroundColor: accentCol + '20', borderColor: accentCol + '55' }]}>
            <Text style={[p.ctaText, { color: accentCol }]}>
              {(l as any).cta_label || 'Learn More'}
            </Text>
          </View>
        </View>
        {!l.is_active && (
          <View style={p.inactiveBanner}>
            <Text style={p.inactiveText}>⏸ INACTIVE — not shown to users</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const p = StyleSheet.create({
  wrap:         { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, paddingBottom: 6 },
  previewLabel: { fontSize: TYPO.body, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  card:         { borderRadius: 14, overflow: 'hidden' },
  cover:        { width: '100%', height: 120 },
  badge:        { position: 'absolute', top: 10, right: 10, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText:    { fontSize: TYPO.body, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  body:         { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  name:         { fontSize: TYPO.body, fontWeight: '700' },
  city:         { fontSize: TYPO.body, marginTop: 2 },
  cta:          { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  ctaText:      { fontSize: TYPO.body, fontWeight: '700' },
  inactiveBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: 6, alignItems: 'center' },
  inactiveText:   { fontSize: TYPO.body, fontWeight: '700', color: '#fff' },
});

const s = StyleSheet.create({
  card:       { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  cardHead:   { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  logo:       { width: 52, height: 52, borderRadius: 12 },
  bizName:    { fontSize: TYPO.body, fontWeight: '700' },
  catPill:    { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  catText:    { fontSize: TYPO.body, fontWeight: '700' },
  location:   { fontSize: TYPO.body, marginTop: 3 },
  pill:       { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  pillText:   { fontSize: TYPO.body, fontWeight: '800', letterSpacing: 0.5 },
  statsRow:   { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  statVal:    { fontSize: TYPO.body, fontWeight: '700' },
  actions:    { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  actionText: { fontSize: TYPO.body, fontWeight: '600' },
  filterChip: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 5 },
  filterText: { fontSize: TYPO.body, fontWeight: '600' },
  fab:        { position: 'absolute', right: 20, bottom: 28, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 8 },
  empty:      { textAlign: 'center', marginTop: 48, fontSize: TYPO.body },
});
