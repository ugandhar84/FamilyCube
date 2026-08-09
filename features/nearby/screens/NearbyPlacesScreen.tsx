/**
 * Nearby Places — full-screen page reached from Home "Near you → See all"
 *
 * Features:
 *  • 2-column grid of compact cards
 *  • Radius options: 1 / 3 / 5 / 10 / 25 (miles or km)
 *  • Unit toggle auto-detected from device locale, manually overridable
 *  • Category chips in 2-row wrap
 *  • Pull-to-refresh re-fetches GPS + places
 *  • Go-to-top FAB (appears after scrolling down 200px)
 *  • No pet context needed — nearby places are universal
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, 
  Linking, ActivityIndicator, Animated, Platform, RefreshControl,
  NativeModules, useWindowDimensions,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import PawBondLoader from '@/components/PawBondLoader';
import { getLocationAPI } from '@/lib/location';
import { getOSMPlaces, type Partner, type PartnerCategory } from '@/lib/discovery';
import { PlaceCard } from '@/features/nearby/components/PlaceCard';
import { TYPO } from '@/constants/theme';

// ─── Locale detection ─────────────────────────────────────────────────────────
function detectUsesMetric(): boolean {
  try {
    const ios = NativeModules.SettingsManager?.settings;
    if (ios?.AppleLocale) return !['en_US', 'en_LR', 'en_MM'].includes(ios.AppleLocale);
    const locale: string = NativeModules.I18nManager?.localeIdentifier ?? 'en_US';
    return !locale.startsWith('en_US');
  } catch {
    return false;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const RADIUS_MI = [1, 3, 5, 10, 25];
const RADIUS_KM = [2, 5, 8, 16, 40];
const PREFS_KEY = 'nearby_places_prefs';
const DEFAULT_RADIUS_IDX = 1; // 3 mi / 5 km

const CHIPS: { label: string; emoji: string; value: PartnerCategory | null }[] = [
  { label: 'All',        emoji: '📍', value: null },
  { label: 'Vets',       emoji: '🏥', value: 'vet' },
  { label: 'Grooming',   emoji: '✂️', value: 'grooming' },
  { label: 'Pet Stores', emoji: '🦴', value: 'food' },
  { label: 'Boarding',   emoji: '🏠', value: 'boarding' },
  { label: 'Dog Parks',  emoji: '🎾', value: 'training' },
];




// ─── Screen ───────────────────────────────────────────────────────────────────
export default function NearbyPlacesScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const CARD_GAP = 10;
  const H_PAD   = 14;
  const cardWidth = (screenW - H_PAD * 2 - CARD_GAP) / 2;

  const [useMetric, setUseMetric] = useState(detectUsesMetric);
  const radiusOpts = useMemo(() => useMetric ? RADIUS_KM : RADIUS_MI, [useMetric]);
  const [radiusIdx, setRadiusIdx] = useState(DEFAULT_RADIUS_IDX);

  // Load persisted prefs on mount
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then(raw => {
      if (!raw) return;
      try {
        const { idx, metric } = JSON.parse(raw);
        if (typeof idx === 'number' && idx >= 0 && idx < RADIUS_MI.length) setRadiusIdx(idx);
        if (typeof metric === 'boolean') setUseMetric(metric);
      } catch {}
    });
  }, []);

  const savePrefs = useCallback((idx: number, metric: boolean) => {
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ idx, metric })).catch(() => {});
  }, []);
  const radiusKm = useMemo(() => {
    const v = radiusOpts[radiusIdx];
    return useMetric ? v : v * 1.60934;
  }, [radiusOpts, radiusIdx, useMetric]);

  const [coords,     setCoords]     = useState<{ lat: number; lng: number } | null>(null);
  const [places,     setPlaces]     = useState<Partner[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locError,   setLocError]   = useState<'denied' | 'unavailable' | null>(null);
  const [cat,        setCat]        = useState<PartnerCategory | null>(null);
  const [showTop,    setShowTop]    = useState(false);
  const listRef = useRef<FlashListRef<any>>(null);

  // ── Location ──
  const getCoords = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    const Loc = getLocationAPI();
    if (!Loc) { setLocError('unavailable'); return null; }
    const { status } = await Loc.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocError('denied'); return null; }
    const loc = await Loc.getCurrentPositionAsync({ accuracy: (Loc.Accuracy as any).Balanced });
    setLocError(null);
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  }, []);

  // ── Fetch ──
  const doFetch = useCallback(async (c: { lat: number; lng: number }, km: number) => {
    try {
      const rows = await getOSMPlaces(c, null, null, km);
      setPlaces(rows);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    getCoords().then(c => {
      if (!c) { setLoading(false); return; }
      setCoords(c);
      doFetch(c, radiusKm);
    });
  }, []);

  // Radius change → re-fetch (no GPS re-request)
  const prevKmRef = useRef(radiusKm);
  useEffect(() => {
    if (prevKmRef.current === radiusKm) return;
    prevKmRef.current = radiusKm;
    if (!coords) return;
    setLoading(true);
    doFetch(coords, radiusKm);
  }, [radiusKm]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const c = await getCoords();
    const activeCoords = c ?? coords;
    if (!activeCoords) { setRefreshing(false); return; }
    if (c) setCoords(c);
    await doFetch(activeCoords, radiusKm);
  }, [coords, radiusKm, doFetch, getCoords]);

  const selectRadius = useCallback((i: number) => {
    setRadiusIdx(i);
    savePrefs(i, useMetric);
  }, [useMetric, savePrefs]);

  const toggleUnit = useCallback(() => {
    setUseMetric(m => {
      savePrefs(radiusIdx, !m);
      return !m;
    });
  }, [radiusIdx, savePrefs]);

  const filtered = useMemo(
    () => cat ? places.filter(p => p.category === cat) : places,
    [places, cat],
  );

  const bg = isDark ? '#0E0A1A' : '#F5F3FF';
  const chipBg     = isDark ? '#1A1030' : '#EDE9FC';
  const chipBorder = isDark ? '#2A1F48' : '#DDD6FE';

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: bg }}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.textPrimary }]}>Near You</Text>
            <Text style={[s.subTitle, { color: colors.textSecondary }]}>
              Pet-friendly places · {radiusOpts[radiusIdx]} {useMetric ? 'km' : 'mi'} radius
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={refreshing || loading}
            style={[s.iconBtn, { opacity: refreshing || loading ? 0.4 : 1 }]}
          >
            {refreshing
              ? <ActivityIndicator size="small" color="#7C5CBF" />
              : <Ionicons name="refresh" size={20} color={colors.textPrimary} />
            }
          </TouchableOpacity>
        </View>

        {/* ── Radius row ── */}
        <View style={s.radiusRow}>
          <Text style={[s.radiusLabel, { color: colors.textSecondary }]}>Radius</Text>
          <View style={s.radiusPills}>
            {radiusOpts.map((v, i) => {
              const active = i === radiusIdx;
              return (
                <TouchableOpacity
                  key={v}
                  onPress={() => selectRadius(i)}
                  style={[s.radiusPill,
                    active
                      ? { backgroundColor: colors.primary, borderColor: colors.primary }
                      : { backgroundColor: chipBg, borderColor: chipBorder }
                  ]}
                >
                  <Text style={[s.radiusPillTxt, { color: active ? '#fff' : (colors.textSecondary) }]}>
                    {v}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            onPress={toggleUnit}
            style={[s.unitToggle, { backgroundColor: chipBg, borderColor: chipBorder }]}
          >
            <Text style={[s.unitTxt, { color: colors.textSecondary }]}>{useMetric ? 'km' : 'mi'}</Text>
            <Ionicons name="swap-horizontal-outline" size={11} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── 2-row category chips ── */}
        <View style={[s.chipGrid, { paddingHorizontal: H_PAD }]}>
          {CHIPS.map(chip => {
            const active = cat === chip.value;
            return (
              <TouchableOpacity
                key={chip.label}
                onPress={() => setCat(chip.value)}
                style={[s.chip,
                  active
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: chipBg, borderColor: chipBorder }
                ]}
              >
                <Text style={s.chipEmoji}>{chip.emoji}</Text>
                <Text style={[s.chipLabel, { color: active ? '#fff' : (colors.textSecondary) }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      {/* ── Content ── */}
      {loading ? (
        <View style={s.center}>
          <PawBondLoader size={52} isDark={isDark} />
          <Text style={[s.emptyTxt, { color: colors.textSecondary, marginTop: 14 }]}>Finding places nearby…</Text>
        </View>
      ) : locError === 'unavailable' ? (
        <View style={s.center}>
          <Text style={s.centerEmoji}>📍</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Location unavailable</Text>
          <Text style={[s.emptyTxt, { color: colors.textSecondary }]}>Location services are not available on this device.</Text>
        </View>
      ) : locError === 'denied' ? (
        <View style={s.center}>
          <Text style={s.centerEmoji}>📍</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Location needed</Text>
          <Text style={[s.emptyTxt, { color: colors.textSecondary }]}>
            Enable location access in Settings to find nearby pet-friendly places.
          </Text>
          <TouchableOpacity style={[s.settingsBtn, { backgroundColor: colors.primary }]} onPress={() => Linking.openSettings()}>
            <Text style={s.settingsBtnTxt}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Text style={s.centerEmoji}>🐾</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Nothing nearby</Text>
          <Text style={[s.emptyTxt, { color: colors.textSecondary }]}>
            No places found within {radiusOpts[radiusIdx]} {useMetric ? 'km' : 'mi'}.{'\n'}Try a wider radius or different category.
          </Text>
        </View>
      ) : (
        <FlashList
          ref={listRef}
          data={filtered}
          keyExtractor={p => p.id}
          numColumns={2}
          renderItem={({ item }) => (
            <PlaceCard
              place={item}
              cardWidth={cardWidth}
              colors={colors}
              isDark={isDark}
              useMetric={useMetric}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: H_PAD, paddingTop: 10, paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          onScroll={e => setShowTop(e.nativeEvent.contentOffset.y > 200)}
          scrollEventThrottle={80}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#7C5CBF"
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <Text style={[s.resultCount, { color: colors.textSecondary }]}>
              {filtered.length} place{filtered.length !== 1 ? 's' : ''} found
            </Text>
          }
        />
      )}

      {/* ── Go-to-top FAB ── */}
      {showTop && (
        <TouchableOpacity
          style={[s.fab, { bottom: insets.bottom + 16, backgroundColor: colors.primary }]}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-up" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  iconBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: TYPO.heading, fontWeight: '800', letterSpacing: -0.3 },
  subTitle:     { fontSize: TYPO.body, fontWeight: '500', marginTop: 1 },

  radiusRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, gap: 8 },
  radiusLabel:  { fontSize: TYPO.body, fontWeight: '600', minWidth: 46 },
  radiusPills:  { flexDirection: 'row', gap: 6, flex: 1 },
  radiusPill:   { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1, minWidth: 32, alignItems: 'center' },
  radiusPillTxt:{ fontSize: TYPO.body, fontWeight: '700' },
  unitToggle:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  unitTxt:      { fontSize: TYPO.body, fontWeight: '700' },

  chipGrid:     { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 5, gap: 7 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  chipEmoji:    { fontSize: TYPO.body },
  chipLabel:    { fontSize: TYPO.body, fontWeight: '600' },

  resultCount:  { fontSize: TYPO.body, fontWeight: '500', marginBottom: 6 },

  // States
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 6 },
  centerEmoji:  { fontSize: 52, marginBottom: 6 },
  emptyTitle:   { fontSize: TYPO.heading, fontWeight: '700', textAlign: 'center' },
  emptyTxt:     { fontSize: TYPO.body, textAlign: 'center', lineHeight: 20 },
  settingsBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  settingsBtnTxt:{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' },

  // FAB
  fab:          { position: 'absolute', right: 20, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
