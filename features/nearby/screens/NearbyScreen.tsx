import { showAlert } from '@/components/AppAlert';
/**
 * PawBond — Nearby Pets (standalone full-screen)
 * Launched from the social Nearby tab "Show all →" link.
 * Has full filtering: distance chips · species chips · breed search
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Image, ActivityIndicator, Alert, Linking,
  Dimensions, Platform, Modal, Animated,
} from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import AppDateTimePicker from '@/components/AppDateTimePicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { updatePet } from '@/lib/db';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { getLocationAPI, isLocationAvailable } from '@/lib/location';
import { formatDist, usesImperial , formatTime } from '@/lib/units';
import { toTitle } from '@/lib/format';
import PawBondLoader from '@/components/PawBondLoader';
import PetHeaderChip from '@/components/PetHeaderChip';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { NearbyCard, ns, NearbyPet } from '@/features/nearby/components/NearbyCard';
import { PetProfileSheet } from '@/features/nearby/components/PetProfileSheet';
import { TYPO } from '@/constants/theme';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';


const SW = Dimensions.get('window').width;

// ── Constants ──────────────────────────────────────────────────────────────────
const DISTANCE_OPTS_METRIC   = [{ km: 1, label: '1 km' }, { km: 5, label: '5 km' }, { km: 15, label: '15 km' }, { km: 25, label: '25 km' }] as const;
const DISTANCE_OPTS_IMPERIAL = [{ km: 1.6, label: '1 mi' }, { km: 4.8, label: '3 mi' }, { km: 16.1, label: '10 mi' }, { km: 24.1, label: '15 mi' }] as const;
type SpeciesFilter = 'all' | 'dog' | 'cat' | 'rabbit' | 'bird' | 'other';
type GenderFilter  = 'all' | 'male' | 'female';
type AgeFilter     = 'all' | 'young' | 'adult' | 'senior';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function petAgeLabel(birthDate: string | null): string {
  if (!birthDate) return 'Age unknown';
  const birth = new Date(birthDate);
  const today = new Date();
  const totalMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (totalMonths < 1) return 'Newborn';
  if (totalMonths < 12) return `${totalMonths}m old`;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  return m > 0 ? `${y}y ${m}m` : `${y}y old`;
}



// ── Main screen ────────────────────────────────────────────────────────────────
export default function NearbyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { activePetId, activePet } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet })));
  const { profile } = useAuthStore();
  const pet = activePet();
  const ac = pet?.accent_color ?? '#7C5CBF';
  const { gate, consume } = usePaywall();

  const imperial = useMemo(() => usesImperial(), []);
  const distanceOpts = imperial ? DISTANCE_OPTS_IMPERIAL : DISTANCE_OPTS_METRIC;

  const scrollRef = useRef<ScrollView>(null);
  const [showFab, setShowFab] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fabAnim, { toValue: showFab ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [showFab]);
  const [userId, setUserId]               = useState<string | null>(null);
  const [nearbyPets, setNearbyPets]       = useState<NearbyPet[]>([]);
  const [loading, setLoading]             = useState(false);
  const [userLocation, setUserLocation]   = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<number>(distanceOpts[1].km);
  const [nearbySpecies, setNearbySpecies]   = useState<SpeciesFilter>('all');
  const [genderFilter, setGenderFilter]     = useState<GenderFilter>('all');
  const [ageFilter, setAgeFilter]           = useState<AgeFilter>('all');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [breedSearch, setBreedSearch]       = useState('');
  const [requestedPets, setRequestedPets]   = useState<Map<string, string>>(new Map()); // petId → requestId
  const [selectedPet, setSelectedPet]       = useState<NearbyPet | null>(null);

  // Proposal sheet
  const [proposalTarget,   setProposalTarget]   = useState<NearbyPet | null>(null);
  const [proposalVisible,  setProposalVisible]  = useState(false);
  const [proposalDate,     setProposalDate]     = useState<Date>(() => { const d = new Date(); const m = d.getMinutes(); d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1); return d; });
  const [proposalEndDate,  setProposalEndDate]  = useState<Date>(() => { const d = new Date(); const m = d.getMinutes(); d.setMinutes(m < 30 ? 30 : 0, 0, 0); if (m >= 30) d.setHours(d.getHours() + 1); d.setHours(d.getHours() + 1); return d; });
  const [proposalLocation, setProposalLocation] = useState('');
  const [proposalMessage,  setProposalMessage]  = useState('');
  const [pickerMode,       setPickerMode]       = useState<'date' | 'time' | 'endtime'>('date');
  const [showPicker,       setShowPicker]       = useState(false);
  const [sending,          setSending]          = useState(false);

  useEffect(() => {
    const uid = useAuthStore.getState().user?.id ?? null;
    setUserId(uid);
  }, []);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  useEffect(() => {
    if (userId) { initLocation(); loadOutgoing(); }
  }, [userId]);

  useEffect(() => {
    if (userLocation) loadNearbyPets();
  }, [userLocation, distanceFilter, nearbySpecies]);

  const initLocation = async () => {
    const Loc = getLocationAPI();
    if (!Loc) { setLocationGranted(false); return; }
    try {
      const existing = await Loc.getForegroundPermissionsAsync();
      if (existing.status !== 'granted' && !existing.canAskAgain) {
        showAlert('Location required', 'Enable location in Settings.',
          [{ text: 'Not now', style: 'cancel', onPress: () => setLocationGranted(false) },
           { text: 'Open Settings', onPress: Linking.openSettings }]);
        return;
      }
      const { status } = existing.status === 'granted' ? existing : await Loc.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocationGranted(false); return; }
      setLocationGranted(true);
      const pos = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.Balanced });
      const { latitude: lat, longitude: lon } = pos.coords;
      setUserLocation({ lat, lon });
      Loc.reverseGeocodeAsync({ latitude: lat, longitude: lon }).then(r => {
        const place = r?.[0];
        if (place) {
          const area = place.district || place.subregion || place.street || place.name;
          const city = place.city || place.region;
          const label = (area && city) ? `${area}, ${city}` : (city ?? area ?? null);
          if (label) setLocationLabel(label);
        }
      }).catch(() => {});
      if (userId && activePetId) {
        try {
          await updatePet(activePetId, { location_lat: lat, location_lng: lon, location_updated_at: new Date().toISOString() });
        } catch { /* non-fatal — location still granted, just DB write failed */ }
      }
    } catch { setLocationGranted(false); }
  };

  const loadOutgoing = async () => {
    if (!userId || !activePetId) return;
    const { data } = await supabase.from('playdate_requests')
      .select('id, to_pet_id')
      .eq('from_pet_id', activePetId)
      .in('status', ['pending', 'scheduling', 'accepted']);
    const map = new Map<string, string>();
    for (const r of data ?? []) map.set(r.to_pet_id as string, r.id as string);
    setRequestedPets(map);
  };

  const loadingNearbyRef = useRef(false);
  const loadNearbyPets = async () => {
    if (!userLocation || !userId) return;
    if (loadingNearbyRef.current) return;
    loadingNearbyRef.current = true;
    setLoading(true);
    try {
      const { lat, lon } = userLocation;
      const deg = distanceFilter / 111;
      const { data } = await supabase
        .from('pets')
        .select('id, name, species, breed, gender, emoji, accent_color, birthday, location_lat, location_lng, owner_id, profiles(full_name, avatar_url)')
        .not('location_lat', 'is', null).not('location_lng', 'is', null)
        .neq('owner_id', userId).eq('location_shared', true)
        .gte('location_lat', lat - deg).lte('location_lat', lat + deg)
        .gte('location_lng', lon - deg).lte('location_lng', lon + deg)
        .limit(100);

      // Load blocks (both directions) to hide blocked pets
      const { data: blockData } = await supabase.from('playdate_blocks')
        .select('blocker_pet_id, blocked_pet_id')
        .or(`blocker_pet_id.eq.${activePetId},blocked_pet_id.eq.${activePetId}`)
        .limit(500);
      const blockedIds = new Set<string>();
      for (const b of blockData ?? []) {
        blockedIds.add(b.blocker_pet_id === activePetId ? b.blocked_pet_id : b.blocker_pet_id);
      }

      let pets: NearbyPet[] = (data ?? []).map((p: any) => {
        let age = null;
        if (p.birthday) {
          const birth = new Date(p.birthday);
          const today = new Date();
          const years = today.getFullYear() - birth.getFullYear();
          const months = today.getMonth() - birth.getMonth();
          age = { years: months < 0 ? years - 1 : years, months: months < 0 ? 12 + months : months };
        }
        const ownerRaw = p.profiles;
        return { ...p, latitude: p.location_lat, longitude: p.location_lng,
          owner: Array.isArray(ownerRaw) ? ownerRaw[0] : ownerRaw, age,
          gender: p.gender ?? null,
          distanceKm: haversineKm(lat, lon, p.location_lat, p.location_lng) };
      }).filter((p: NearbyPet) => p.distanceKm <= distanceFilter && !blockedIds.has(p.id));

      if (nearbySpecies !== 'all') pets = pets.filter(p => p.species === nearbySpecies);
      pets.sort((a, b) => a.distanceKm - b.distanceKm);
      setNearbyPets(pets);
    } finally {
      setLoading(false);
      loadingNearbyRef.current = false;
    }
  };

  const openProposalSheet = (target: NearbyPet) => {
    if (!userId || !activePetId) return;
    if (target.owner_id === userId) { showAlert('That\'s your pet! 🐾', 'You can\'t request your own pet.'); return; }
    const d = new Date(); const _m = d.getMinutes(); d.setMinutes(_m < 30 ? 30 : 0, 0, 0); if (_m >= 30) d.setHours(d.getHours() + 1);
    const e = new Date(d); e.setHours(11, 0, 0, 0);
    setProposalDate(d);
    setProposalEndDate(e);
    setProposalLocation('');
    setProposalMessage('');
    setProposalTarget(target);
    setProposalVisible(true);
  };

  const sendProposal = async () => {
    if (!proposalTarget || !activePetId || sending) return;
    const ok = await gate('playdatesPerMonth', {
      title: 'Playdate limit reached',
      message: "You've sent 2 playdate requests this month. Upgrade to Pro for unlimited playdates.",
    });
    if (!ok) return;
    setSending(true);
    const proposed_date = format(proposalDate, 'yyyy-MM-dd');
    const proposed_time = format(proposalDate, 'HH:mm');
    const proposed_end_time = format(proposalEndDate, 'HH:mm');
    const { data, error } = await supabase.functions.invoke('playdates', {
      body: {
        action: 'request',
        from_pet_id: activePetId,
        to_pet_id: proposalTarget.id,
        proposed_date,
        proposed_time,
        proposed_end_time,
        proposed_location: proposalLocation.trim() || undefined,
        message: proposalMessage.trim() || undefined,
      },
    });
    setSending(false);
    if (error || data?.error) {
      showAlert('Error', data?.error ?? error?.message ?? 'Could not send request');
      return;
    }
    const requestId: string = data?.request_id ?? data?.id ?? '';
    await consume('playdatesPerMonth');
    setRequestedPets(prev => new Map(prev).set(proposalTarget.id, requestId));
    setProposalVisible(false);
    showAlert('Playdate requested! 🐾', `${proposalTarget.name}'s parent has been notified.`);
  };

  const withdrawPlaydate = async (target: NearbyPet) => {
    if (!activePetId) return;
    const requestId = requestedPets.get(target.id);
    setRequestedPets(prev => { const n = new Map(prev); n.delete(target.id); return n; });
    try {
      if (requestId) {
        await supabase.functions.invoke('playdates', { body: { action: 'withdraw', request_id: requestId } });
      }
      showAlert('Withdrawn', `Request to ${target.name} cancelled.`);
    } catch (e: any) {
      setRequestedPets(prev => new Map(prev).set(target.id, requestId ?? ''));
      showAlert('Error', e.message);
    }
  };

  const filteredPets = useMemo(() => {
    return nearbyPets.filter(p => {
      if (breedSearch.trim() && !p.breed?.toLowerCase().includes(breedSearch.toLowerCase())) return false;
      if (genderFilter !== 'all' && (p.gender ?? '').toLowerCase() !== genderFilter) return false;
      if (ageFilter !== 'all' && p.age) {
        const totalMonths = p.age.years * 12 + p.age.months;
        if (ageFilter === 'young'  && totalMonths >= 24) return false;
        if (ageFilter === 'adult'  && (totalMonths < 24 || totalMonths >= 96)) return false;
        if (ageFilter === 'senior' && totalMonths < 96) return false;
      }
      return true;
    });
  }, [nearbyPets, breedSearch, genderFilter, ageFilter]);

  const SPECIES = [
    { key: 'all',    label: 'All',     emoji: '🐾' },
    { key: 'dog',    label: 'Dogs',    emoji: '🐶' },
    { key: 'cat',    label: 'Cats',    emoji: '🐱' },
    { key: 'rabbit', label: 'Rabbits', emoji: '🐰' },
    { key: 'bird',   label: 'Birds',   emoji: '🦜' },
    { key: 'other',  label: 'Other',   emoji: '🐟' },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Nav header — fixed */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={pg.header}>
          <TouchableOpacity onPress={() => router.back()} style={[pg.backBtn, { backgroundColor: colors.background, borderColor: colors.border }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[pg.title, { color: colors.textPrimary }]}>Nearby Pets</Text>
            <PetHeaderChip pet={pet as any} meta={locationLabel ? `📍 ${locationLabel}` : undefined} />
          </View>
          <TouchableOpacity style={[pg.refreshBtn, { backgroundColor: colors.inputBg }]}
            onPress={() => { if (userLocation) loadNearbyPets(); else initLocation(); }}>
            <Ionicons name="refresh-outline" size={18} color={ac} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Main scrollable area — filters + content */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={e => setShowFab(e.nativeEvent.contentOffset.y > 300)}
      >
        {/* Compact filter bar */}
        {(() => {
          const speciesLabel = SPECIES.find(s => s.key === nearbySpecies)?.label ?? 'All';
          const distLabel = distanceOpts.find(d => d.km === distanceFilter)?.label ?? '';
          const genderLabel = genderFilter === 'all' ? '' : genderFilter === 'male' ? '♂ Male' : '♀ Female';
          const ageLabel = ageFilter === 'all' ? '' : ageFilter === 'young' ? 'Young' : ageFilter === 'adult' ? 'Adult' : 'Senior';
          const activeCount = (nearbySpecies !== 'all' ? 1 : 0) + (genderFilter !== 'all' ? 1 : 0) + (ageFilter !== 'all' ? 1 : 0);
          const summaryParts = [
            SPECIES.find(s => s.key === nearbySpecies)?.emoji ?? '🐾',
            speciesLabel !== 'All' ? speciesLabel : 'All pets',
            '·',
            distLabel,
            ...(genderLabel ? ['·', genderLabel] : []),
            ...(ageLabel ? ['·', ageLabel] : []),
          ];
          return (
            <TouchableOpacity onPress={() => setFiltersVisible(true)} activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 10, marginBottom: 8,
                backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: activeCount > 0 ? ac : colors.border,
                paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
              <Ionicons name="options-outline" size={16} color={activeCount > 0 ? ac : colors.textSecondary} />
              <Text style={{ flex: 1, fontSize: TYPO.body, color: activeCount > 0 ? colors.textPrimary : colors.textSecondary, fontWeight: activeCount > 0 ? '600' : '400' }}
                numberOfLines={1}>
                {summaryParts.join(' ')}
              </Text>
              {activeCount > 0 && (
                <View style={{ backgroundColor: ac, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{activeCount}</Text>
                </View>
              )}
              <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          );
        })()}

        {/* Breed search */}
        <View style={[pg.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border, marginHorizontal: 16, marginBottom: 12 }]}>
          <Ionicons name="search-outline" size={16} color={colors.textTertiary} />
          <TextInput
            style={[pg.searchInput, { color: colors.textPrimary }]}
            placeholder="Search by breed…"
            placeholderTextColor={colors.placeholder}
            value={breedSearch}
            onChangeText={setBreedSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {breedSearch.length > 0 && (
            <TouchableOpacity onPress={() => setBreedSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {locationGranted === false ? (
          <View style={{ minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
            <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: `${ac}14`,
              alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={isLocationAvailable() ? 'location-outline' : 'construct-outline'} size={38} color={ac} />
            </View>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 }}>
              {isLocationAvailable() ? 'Location needed' : 'Dev build required'}
            </Text>
            <Text style={{ fontSize: TYPO.body, textAlign: 'center', lineHeight: 22, color: colors.textSecondary, opacity: 0.8 }}>
              {isLocationAvailable()
                ? 'Allow location access to see nearby pets in your area.'
                : 'GPS isn\'t available in Expo Go. Run npx expo run:ios for full support.'}
            </Text>
            {isLocationAvailable() && (
              <TouchableOpacity style={{ paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24, backgroundColor: ac }}
                onPress={initLocation}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>Allow Location</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : loading || locationGranted === null ? (
          <View style={{ minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <PawBondLoader size={56} />
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
              {locationGranted === null ? 'Getting your location…' : 'Finding nearby pets…'}
            </Text>
          </View>
        ) : filteredPets.length === 0 ? (
          <View style={{ minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 }}>
            <Text style={{ fontSize: 48 }}>🐾</Text>
            <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4 }}>
              No babies nearby
            </Text>
            <Text style={{ fontSize: TYPO.body, textAlign: 'center', color: colors.textSecondary, lineHeight: 22, opacity: 0.7 }}>
              {breedSearch ? `No ${breedSearch} breeds found within ${formatDist(distanceFilter)}.`
                : `Nothing within ${formatDist(distanceFilter)}. Try a wider range.`}
            </Text>
            {breedSearch ? (
              <TouchableOpacity style={{ paddingHorizontal: 24, paddingVertical: 11, borderRadius: 20, backgroundColor: ac, marginTop: 6 }}
                onPress={() => setBreedSearch('')}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Clear search</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={{ padding: 16, paddingTop: 4 }}>
            {/* Count header */}
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginBottom: 14, fontWeight: '500' }}>
              {filteredPets.length} pet{filteredPets.length !== 1 ? 's' : ''} within {formatDist(distanceFilter)}
              {nearbySpecies !== 'all' ? ` · ${nearbySpecies}s` : ''}
              {genderFilter !== 'all' ? ` · ${genderFilter}` : ''}
              {ageFilter !== 'all' ? ` · ${ageFilter}` : ''}
              {breedSearch ? ` · "${breedSearch}"` : ''}
            </Text>

            {/* 2-column grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}>
              {filteredPets.map(p => (
                <NearbyCard
                  key={p.id}
                  pet={{ ...p, requested: requestedPets.has(p.id) }}
                  ac={ac}
                  colors={colors}
                  onRequest={() => openProposalSheet(p)}
                  onWithdraw={() => withdrawPlaydate(p)}
                  onPress={() => setSelectedPet({ ...p, requested: requestedPets.has(p.id) })}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Scroll-to-top FAB */}
      <Animated.View style={{
        position: 'absolute', right: 20, bottom: insets.bottom + 20,
        opacity: fabAnim, transform: [{ scale: fabAnim }],
        pointerEvents: showFab ? 'auto' : 'none',
      }}>
        <TouchableOpacity
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: ac,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Pet profile bottom sheet */}
      <PetProfileSheet
        pet={selectedPet}
        ac={ac}
        colors={colors}
        visible={!!selectedPet}
        onClose={() => setSelectedPet(null)}
        onRequest={() => { setSelectedPet(null); selectedPet && openProposalSheet(selectedPet); }}
        onWithdraw={() => selectedPet && withdrawPlaydate(selectedPet)}
      />

      {/* Proposal sheet */}
      <BottomSheet visible={filtersVisible} onClose={() => setFiltersVisible(false)} title="Filters" accent={ac}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 20, paddingTop: 4, paddingBottom: 8 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>SPECIES</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SPECIES.map(s => {
                const active = nearbySpecies === (s.key as SpeciesFilter);
                return (
                  <TouchableOpacity key={s.key} onPress={() => setNearbySpecies(s.key as SpeciesFilter)} activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: active ? ac : colors.inputBg, borderRadius: 20, borderWidth: 1,
                      borderColor: active ? ac : colors.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontSize: TYPO.body }}>{s.emoji}</Text>
                    <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500', color: active ? '#fff' : colors.textSecondary }}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>DISTANCE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {distanceOpts.map(opt => {
                const active = distanceFilter === opt.km;
                return (
                  <TouchableOpacity key={opt.km} onPress={() => setDistanceFilter(opt.km)} activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: active ? `${ac}18` : colors.inputBg, borderRadius: 20, borderWidth: 1,
                      borderColor: active ? ac : colors.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Ionicons name="locate-outline" size={13} color={active ? ac : colors.textSecondary} />
                    <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500', color: active ? ac : colors.textSecondary }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>GENDER</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { key: 'all', label: 'Any', emoji: '🐾' },
                { key: 'male', label: 'Male ♂', emoji: '💙' },
                { key: 'female', label: 'Female ♀', emoji: '🩷' },
              ] as { key: GenderFilter; label: string; emoji: string }[]).map(g => {
                const active = genderFilter === g.key;
                return (
                  <TouchableOpacity key={g.key} onPress={() => setGenderFilter(g.key)} activeOpacity={0.8}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      backgroundColor: active ? `${ac}18` : colors.inputBg, borderRadius: 12, borderWidth: 1,
                      borderColor: active ? ac : colors.border, paddingVertical: 12 }}>
                    <Text style={{ fontSize: TYPO.body }}>{g.emoji}</Text>
                    <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500', color: active ? ac : colors.textSecondary }}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: ac, marginBottom: 10 }}>AGE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {([
                { key: 'all',    label: 'Any age',    emoji: '🐾' },
                { key: 'young',  label: 'Young < 2y', emoji: '🐣' },
                { key: 'adult',  label: 'Adult 2–8y', emoji: '🐕' },
                { key: 'senior', label: 'Senior 8y+', emoji: '🐩' },
              ] as { key: AgeFilter; label: string; emoji: string }[]).map(a => {
                const active = ageFilter === a.key;
                return (
                  <TouchableOpacity key={a.key} onPress={() => setAgeFilter(a.key)} activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: active ? `${ac}18` : colors.inputBg, borderRadius: 20, borderWidth: 1,
                      borderColor: active ? ac : colors.border, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ fontSize: TYPO.body }}>{a.emoji}</Text>
                    <Text style={{ fontSize: TYPO.body, fontWeight: active ? '700' : '500', color: active ? ac : colors.textSecondary }}>{a.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => { setNearbySpecies('all'); setDistanceFilter(distanceOpts[1].km); setGenderFilter('all'); setAgeFilter('all'); }}
              style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '600', color: colors.textSecondary }}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFiltersVisible(false)}
              style={{ flex: 2, borderRadius: 12, backgroundColor: ac, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff' }}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </BottomSheet>

      <BottomSheet
        visible={proposalVisible}
        onClose={() => setProposalVisible(false)}
        title={proposalTarget ? `Playdate with ${proposalTarget.emoji} ${proposalTarget.name}` : 'Propose Playdate'}
        accent={proposalTarget?.accent_color ?? ac}>
        {(() => {
          const tac = proposalTarget?.accent_color ?? ac;
          const speciesMismatch = !!(pet?.species && proposalTarget?.species && proposalTarget.species !== pet.species);
          const breedMismatch = !speciesMismatch && !!(pet?.breed && proposalTarget?.breed && proposalTarget.breed !== pet.breed);
          return (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 16, paddingTop: 4, paddingBottom: 8 }}>

              {speciesMismatch && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 1, borderColor: '#FCD34D',
                  paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name="warning-outline" size={16} color="#D97706" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: TYPO.body, color: '#92400E', lineHeight: 20 }}>
                    <Text style={{ fontWeight: '700' }}>Different species</Text>
                    {' — '}{proposalTarget?.name} is a {proposalTarget?.species} and your pet is a {pet?.species}. You can still send a playdate request!
                  </Text>
                </View>
              )}
              {breedMismatch && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  backgroundColor: '#FEF3C7', borderRadius: 12, borderWidth: 1, borderColor: '#FCD34D',
                  paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name="warning-outline" size={16} color="#D97706" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: TYPO.body, color: '#92400E', lineHeight: 20 }}>
                    <Text style={{ fontWeight: '700' }}>Different breeds</Text>
                    {' — '}{proposalTarget?.name} is a {proposalTarget?.breed} and your pet is a {pet?.breed}. You can still send a playdate request!
                  </Text>
                </View>
              )}

              {/* WHEN card */}
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${tac}30`, overflow: 'hidden', backgroundColor: `${tac}0A` }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 8 }}>
                  <Ionicons name="calendar" size={13} color={tac} />
                  <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: tac }}>WHEN</Text>
                </View>
                <TouchableOpacity onPress={() => { setPickerMode('date'); setShowPicker(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    marginHorizontal: 10, marginBottom: 8, backgroundColor: colors.inputBg,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: pickerMode === 'date' && showPicker ? tac : colors.border,
                    paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name="calendar-outline" size={16} color={tac} />
                  <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{format(proposalDate, 'EEEE, MMMM d, yyyy')}</Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 12 }}>
                  <TouchableOpacity onPress={() => { setPickerMode('time'); setShowPicker(true); }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                      borderColor: pickerMode === 'time' && showPicker ? tac : colors.border,
                      paddingHorizontal: 12, paddingVertical: 12 }}>
                    <Ionicons name="time-outline" size={15} color={tac} />
                    <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '600', color: colors.textPrimary }}>{formatTime(proposalDate)}</Text>
                  </TouchableOpacity>
                  <Ionicons name="arrow-forward" size={13} color={colors.textTertiary} />
                  <TouchableOpacity onPress={() => { setPickerMode('endtime'); setShowPicker(true); }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1.5,
                      borderColor: pickerMode === 'endtime' && showPicker ? tac : colors.border,
                      paddingHorizontal: 12, paddingVertical: 12 }}>
                    <Ionicons name="time-outline" size={15} color={colors.textTertiary} />
                    <Text style={{ flex: 1, fontSize: TYPO.body, fontWeight: '500', color: colors.textPrimary }}>{formatTime(proposalEndDate)}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Place */}
              <LocationAutocompleteInput
                value={proposalLocation} onChangeText={setProposalLocation}
                placeholder="Place (optional)"
                colors={colors} />

              {/* Note */}
              <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
                <TextInput style={{ fontSize: TYPO.body, color: colors.textPrimary, minHeight: 56, textAlignVertical: 'top' }}
                  placeholder="Add a note (optional)" placeholderTextColor={colors.placeholder}
                  value={proposalMessage} onChangeText={t => setProposalMessage(t.slice(0, 500))} multiline blurOnSubmit maxLength={500} />
                <Text style={{ fontSize: 11, color: proposalMessage.length >= 480 ? '#EF4444' : colors.textTertiary, textAlign: 'right', marginTop: 2 }}>
                  {proposalMessage.length}/500
                </Text>
              </View>

              {/* Summary strip */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: `${tac}12`, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: `${tac}25` }}>
                <Text style={{ fontSize: 20 }}>📅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                    {format(proposalDate, 'EEE, MMM d')} · {formatTime(proposalDate)} – {formatTime(proposalEndDate)}
                  </Text>
                  {proposalLocation.trim() ? (
                    <Text style={{ fontSize: TYPO.caption, color: colors.textSecondary, marginTop: 2 }}>📍 {proposalLocation.trim()}</Text>
                  ) : null}
                </View>
              </View>

              {/* Send button */}
              <TouchableOpacity onPress={sendProposal} disabled={sending}
                style={{ backgroundColor: tac, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Send Proposal</Text>}
              </TouchableOpacity>

              <AppDateTimePicker
                visible={showPicker}
                value={pickerMode === 'endtime' ? proposalEndDate : proposalDate}
                mode={pickerMode === 'endtime' ? 'time' : pickerMode}
                minimumDate={pickerMode === 'date' ? new Date() : undefined}
                accent={tac}
                onCancel={() => setShowPicker(false)}
                onConfirm={(date) => {
                  setShowPicker(false);
                  if (pickerMode === 'date') {
                    setProposalDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
                    setProposalEndDate(prev => { const n = new Date(prev); n.setFullYear(date.getFullYear(), date.getMonth(), date.getDate()); return n; });
                  } else if (pickerMode === 'time') {
                    setProposalDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
                    setProposalEndDate(prev => { const minEnd = new Date(date); minEnd.setHours(date.getHours() + 1, date.getMinutes(), 0, 0); return prev < minEnd ? minEnd : prev; });
                  } else {
                    setProposalEndDate(prev => { const n = new Date(prev); n.setHours(date.getHours(), date.getMinutes(), 0, 0); return n; });
                  }
                }}
              />
            </ScrollView>
          );
        })()}
      </BottomSheet>
    </View>
  );
}

const pg = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:    { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: TYPO.heading, fontWeight: '900', letterSpacing: -0.4 },
  sub:        { fontSize: TYPO.body, marginTop: 1, opacity: 0.6 },
  refreshBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7,
                borderRadius: 20, borderWidth: 1.5 },
  chipText:   { fontSize: TYPO.body, fontWeight: '700' },
  searchBar:  { flexDirection: 'row', alignItems: 'center', gap: 8,
                height: 42, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12 },
  searchInput:{ flex: 1, fontSize: TYPO.body },
});
