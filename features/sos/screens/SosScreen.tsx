import { showAlert } from '@/components/AppAlert';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Linking, ActivityIndicator, TextInput, Share,
  Animated, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/BottomSheet';
import PetHeaderChip from '@/components/PetHeaderChip';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { format, parseISO, differenceInYears } from 'date-fns';
import { getLocationAPI } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { insertLostAlert, updateLostAlert, getPetsByIds } from '@/lib/db';
import { invalidateLostAlerts } from '@/lib/hooks/useActiveLostAlerts';
import { invalidateLostAlert } from '@/lib/hooks/useActiveLostAlert';
import { useAuthStore } from '@/store/authStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { usePreferenceStore } from '@/store/preferenceStore';
import { useTheme } from '@/lib/ThemeContext';
import { getLocaleSettings } from '@/lib/localization';
import { SPECIES_EMOJI , TYPO } from '@/constants/theme';
import { getOSMPlaces, type Partner } from '@/lib/discovery';
import { syncUserLocation } from '@/lib/notifications';
import { formatDist , formatTime } from '@/lib/units';
import { toTitle } from '@/lib/format';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { FeatureUnavailable } from '@/components/FeatureGate';
import { SosHeroCard } from '@/features/sos/components/SosHeroCard';
import { SosNearbyVets } from '@/features/sos/components/SosNearbyVets';
import { SosNearbyAlerts } from '@/features/sos/components/SosNearbyAlerts';
import { SosPetSwitcher } from '@/features/sos/components/SosPetSwitcher';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';

const EMERGENCY_CONTACTS = [
  { id: 'aspca',  name: 'ASPCA Poison Control',  phone: '+18884264435', emoji: '☠️', is_24h: true  },
  { id: 'pph',    name: 'Pet Poison Helpline',    phone: '+18558645765', emoji: '🆘', is_24h: true  },
  { id: 'animal', name: 'Animal Emergency Line',  phone: '+18005482423', emoji: '🏥', is_24h: false },
];

interface NearbyLostAlert {
  id: string;
  pet_id: string;
  last_seen_address: string | null;
  description: string | null;
  contact_phone: string | null;
  reward_amount: number | null;
  created_at: string;
  pets?: { name: string; emoji: string; species: string; breed: string | null };
}

function usePulse(active: boolean) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { anim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  return anim;
}

export default function SOSScreen() {
  const { colors, isDark } = useTheme();
  const sosEnabled = useFeatureFlag('sos_enabled', true);
  const { from } = useLocalSearchParams<{ from?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const { activePetId, activePet, pets, setActivePet } = usePetStore(useShallow(s => ({ activePetId: s.activePetId, activePet: s.activePet, pets: s.pets, setActivePet: s.setActivePet })));
  const [showPetSwitcher, setShowPetSwitcher] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const insets = useSafeAreaInsets();
  const handAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pets.length <= 1) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(handAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(handAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.delay(800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pets.length]);
  const pet  = activePet();
  const ac   = (pet as any)?.accent_color ?? colors.primary ?? '#E24B4A';
  const petAgeYrs = (pet as any)?.birthday
    ? differenceInYears(new Date(), parseISO((pet as any).birthday))
    : null;
  const petMeta = [
    toTitle((pet as any)?.breed),
    petAgeYrs != null ? `${petAgeYrs} yr${petAgeYrs !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ') || toTitle((pet as any)?.species) || '';
  const country = usePreferenceStore((s) => s.country);
  const localeSettings = getLocaleSettings(country);

  const [coords,          setCoords]          = useState<{ lat: number; lng: number } | null>(null);
  const [locationText,    setLocationText]    = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  const [activeLostAlert, setActiveLostAlert] = useState<any | null>(null);
  const [sending,         setSending]         = useState(false);
  const [showModal,       setShowModal]       = useState(false);
  const [description,     setDescription]     = useState('');
  const [contactPhone,    setContactPhone]    = useState('');
  const [reward,          setReward]          = useState('');
  const [formErrors,      setFormErrors]      = useState<{ description?: string; phone?: string; reward?: string }>({});

  const [showFoundModal,  setShowFoundModal]  = useState(false);
  const [foundMessage,    setFoundMessage]    = useState('');
  const [foundDetails,    setFoundDetails]    = useState('');
  const [foundByName,     setFoundByName]     = useState('');
  const [foundByUserId,   setFoundByUserId]   = useState<string | null>(null);
  const [finderResults,   setFinderResults]   = useState<{ id: string; handle: string | null; full_name: string | null; avatar_url: string | null }[]>([]);
  const [finderSearching, setFinderSearching] = useState(false);
  const [showFinderList,  setShowFinderList]  = useState(false);
  const finderSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [markingFound,    setMarkingFound]    = useState(false);

  const [nearbyAlerts,  setNearbyAlerts]  = useState<NearbyLostAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [nearbyVets,    setNearbyVets]    = useState<Partner[]>([]);
  const [vetsLoading,   setVetsLoading]   = useState(false);
  const [selectedRadius, setSelectedRadius] = useState<3 | 5 | 10>(10);

  const pulse = usePulse(!activeLostAlert);
  const preferenceRadius = usePreferenceStore((s) => s.sosNotificationRadius);

  // Load saved radius preference when component mounts or modal opens
  useEffect(() => {
    setSelectedRadius(preferenceRadius);
  }, [showModal, preferenceRadius]);

  const getLocation = useCallback(async () => {
    setLocationLoading(true);
    const Loc = getLocationAPI();
    if (!Loc) { setLocationLoading(false); return; }
    try {
      const { status } = await Loc.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocationLoading(false); return; }
      const loc = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.Balanced });
      const { latitude, longitude, accuracy } = loc.coords;
      setCoords({ lat: latitude, lng: longitude });
      const [place] = await Loc.reverseGeocodeAsync({ latitude, longitude });
      setLocationText(place
        ? `${place.street ?? ''} ${place.city ?? ''}, ${place.region ?? ''}`.trim()
        : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      );
      const uid = useAuthStore.getState().user?.id;
      if (uid) syncUserLocation(uid, latitude, longitude, accuracy ?? undefined);
      fetchNearbyAlerts(latitude, longitude);
      fetchNearbyVets({ lat: latitude, lng: longitude });
    } catch {}
    finally { setLocationLoading(false); setRefreshing(false); }
  }, []);

  const fetchNearbyVets = async (c: { lat: number; lng: number }) => {
    setVetsLoading(true);
    try {
      const vets = await getOSMPlaces(c, 'vet', pet);
      setNearbyVets(vets.slice(0, 5));
    } catch {} finally { setVetsLoading(false); }
  };

  const fetchNearbyAlerts = async (lat: number, lng: number) => {
    setAlertsLoading(true);
    try {
      const myPetIds = new Set(pets.map(p => p.id));
      const { data } = await supabase.rpc('get_nearby_lost_alerts', { p_lat: lat, p_lng: lng, p_radius_km: 10 }) as any;
      if (data) {
        // One batched pets query instead of a per-alert lookup (N+1)
        const alerts = (data as any[]).filter((a: any) => !myPetIds.has(a.pet_id)).slice(0, 8);
        const petIds = [...new Set(alerts.map((a: any) => a.pet_id).filter(Boolean))];
        const fetchedPets = await getPetsByIds(petIds).catch(() => []);
        const petMap = new Map(fetchedPets.map((p: any) => [p.id, p]));
        setNearbyAlerts(alerts.map((a: any) => ({ ...a, pets: petMap.get(a.pet_id) ?? null })));
      } else {
        const { data: fb } = await supabase.from('lost_alerts')
          .select('*, pets(name,emoji,species,breed)').eq('is_found', false)
          .not('pet_id', 'in', `(${[...myPetIds].join(',') || '00000000-0000-0000-0000-000000000000'})`)
          .order('created_at', { ascending: false }).limit(8);
        setNearbyAlerts((fb as NearbyLostAlert[]) ?? []);
      }
    } catch {} finally { setAlertsLoading(false); }
  };

  const checkActiveLostAlert = useCallback(async () => {
    if (!activePetId) return;
    const { data } = await supabase.from('lost_alerts')
      .select('*').eq('pet_id', activePetId).eq('is_found', false)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setActiveLostAlert(data ?? null);
  }, [activePetId]);

  const getDaysRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const expiresTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const daysLeft = Math.ceil((expiresTime - now) / (1000 * 60 * 60 * 24));
    return daysLeft > 0 ? daysLeft : 0;
  };

  const load = useCallback(() => {
    checkActiveLostAlert();
    getLocation();
  }, [activePetId]);

  useEffect(() => { load(); }, [activePetId]);

  // Reset scroll to top when screen is focused
  useFocusEffect(useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    return () => {
      setShowModal(false);
      setShowFoundModal(false);
      setShowFinderList(false);
      setShowPetSwitcher(false);
    };
  }, []));

  const handleReportLost = async () => {
    if (!activePetId || !pet) return;
    const trimDesc  = description.trim();
    const trimPhone = contactPhone.trim();
    const digits    = trimPhone.replace(/\D/g, '');
    const errs: { description?: string; phone?: string; reward?: string } = {};
    if (!trimDesc || trimDesc.length < 10)
      errs.description = trimDesc ? 'Too short — add at least 10 characters.' : 'Describe where your pet was last seen.';
    if (!trimPhone)
      errs.phone = 'A contact number is required so people can reach you.';
    else if (digits.length < 7 || digits.length > 15)
      errs.phone = 'Enter a valid phone number (7–15 digits).';
    if (reward.trim()) {
      const r = parseFloat(reward);
      if (isNaN(r) || r <= 0) errs.reward = 'Enter a positive reward amount.';
    }
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    setFormErrors({});
    setSending(true);
    const userId = useAuthStore.getState().user?.id;
    if (!userId) { setSending(false); return; }

    // If location is still loading, wait briefly for it
    if (locationLoading) {
      await new Promise(res => setTimeout(res, 2000));
    }

    let data: any;
    try {
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      data = await insertLostAlert({
        pet_id: activePetId, reported_by: userId,
        last_seen_address: locationText ?? 'Unknown location',
        last_seen_lat: coords?.lat ?? null, last_seen_lng: coords?.lng ?? null,
        description: description || `${pet.name} is lost. Please help!`,
        contact_phone: contactPhone || null,
        reward_amount: reward ? parseFloat(reward) : null,
        is_found: false,
        expires_at: expiresAt,
      });
    } catch (e: any) { setSending(false); showAlert('Error', e.message); return; }

    try {
    const radiusKm = selectedRadius * 1.60934;
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('send-lost-alert', {
      body: {
        alert_id: data.id, pet_id: activePetId, pet_name: pet.name, pet_emoji: pet.emoji,
        lat: coords?.lat ?? null, lng: coords?.lng ?? null, description,
        last_seen_address: locationText ?? null,
        contact_phone: contactPhone || null,
        reward_amount: reward ? parseFloat(reward) : null,
        radius_km: radiusKm,
      },
    });

    setSending(false); setShowModal(false); setDescription(''); setContactPhone(''); setReward('');
    setActiveLostAlert(data);
    invalidateLostAlerts();            // badge (multi-hook)
    invalidateLostAlert(activePetId);  // banner (single-hook)

    const pushCount  = (fnData as any)?.notified ?? 0;
    const inAppCount = (fnData as any)?.in_app   ?? pushCount;
    const reached    = Math.max(pushCount, inAppCount);
    if (fnErr || reached === 0) {
      showAlert(
        'Alert posted ⚠️',
        `${pet.name}'s alert is saved, but we couldn't reach nearby pet parents — your location may be unavailable. Enable precise location and re-send for best results.`,
        [{ text: 'OK' }]
      );
    } else {
      showAlert('Alert sent! 🚨', `${pet.name}'s alert has been shared with the PawBond community. Keep an eye on your notifications for updates.`);
    }
    } catch (e: any) {
      showAlert('Error', e?.message ?? 'Alert saved but notification failed.');
    } finally {
      setSending(false);
    }
  };

  const handleMarkFound = () => {
    if (!activeLostAlert || !pet) return;
    setFoundMessage(`${pet.name} is safely home! 🏠 Thank you to everyone who helped search. You made a difference. 💚`);
    setFoundDetails('');
    setFoundByName('');
    setFoundByUserId(null);
    setFinderResults([]);
    setShowFinderList(false);
    setShowFoundModal(true);
  };

  // Dynamic search-as-you-type — searches all app users by name
  const handleFinderNameChange = useCallback((text: string) => {
    setFoundByName(text);
    setFoundByUserId(null); // typing invalidates a previous exact selection
    setShowFinderList(true);

    if (finderSearchTimer.current) clearTimeout(finderSearchTimer.current);

    const trimmed = text.trim();
    if (trimmed.length === 0) { setFinderResults([]); return; }

    finderSearchTimer.current = setTimeout(async () => {
      setFinderSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke('search-users', {
          body: { query: trimmed },
        });
        if (!error) setFinderResults(data?.results ?? []);
      } catch {}
      setFinderSearching(false);
    }, 300);
  }, []);

  const selectFinder = (u: { id: string; handle?: string | null; full_name: string | null }) => {
    setFoundByName(u.handle ? `@${u.handle}` : (u.full_name ?? ''));
    setFoundByUserId(u.id);
    setShowFinderList(false);
  };

  const handleConfirmFound = async () => {
    if (!activeLostAlert || !pet) return;
    setMarkingFound(true);
    try {
      await updateLostAlert(activeLostAlert.id, { is_found: true, found_at: new Date().toISOString() });
    } catch (e: any) {
      setMarkingFound(false);
      showAlert('Error', 'Could not update the alert. Please try again.');
      return;
    }
    const alertId  = activeLostAlert.id;
    const alertPetId = activeLostAlert.pet_id;
    setActiveLostAlert(null);
    setShowFoundModal(false);
    setMarkingFound(false);
    setFoundMessage(''); setFoundDetails(''); setFoundByName(''); setFoundByUserId(null);
    invalidateLostAlerts();             // badge (multi-hook)
    invalidateLostAlert(alertPetId);    // banner (single-hook)

    const { data: fnData, error: fnErr } = await supabase.functions.invoke('send-found-alert', {
      body: {
        alert_id:         alertId,
        pet_name:         pet.name,
        pet_emoji:        pet.emoji ?? '🐾',
        custom_message:   foundMessage.trim() || undefined,
        found_details:    foundDetails.trim() || undefined,
        found_by:         foundByName.trim() || undefined,
        found_by_user_id: foundByUserId ?? undefined,
      },
    });

    const notified = (fnData as any)?.in_app ?? (fnData as any)?.notified ?? 0;
    if (fnErr || notified === 0) {
      showAlert('Wonderful! 💚', `So glad ${pet.name} is safe! The alert has been marked as found.`);
    } else {
      showAlert('Wonderful! 💚', `So glad ${pet.name} is safe! Your community has been notified. 🎉`);
    }
  };

  const callNumber = (phone: string, name: string) => {
    const display = phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '+1 ($2) $3-$4');
    showAlert(`Call ${name}?`, display, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const alertColor = activeLostAlert ? '#E74C3C' : ac;

  if (!sosEnabled) {
    return (
      <View style={s.safe}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
          <FeatureUnavailable label="SOS alerts" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.safe}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
      {/* ── Header — matches other screens ── */}
      <View style={[s.header, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[s.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push(from === 'profile' ? '/(tabs)/profile' : '/(tabs)')}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={[s.title, { color: colors.textPrimary }]}>SOS</Text>
          {pet ? (
            <PetHeaderChip pet={pet as any} meta={petMeta} />
          ) : (
            <Text style={[s.sub, { color: colors.textSecondary }]}>Emergency tools</Text>
          )}
        </View>
      </View>
      </SafeAreaView>

      
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} colors={[colors.primary]} />}
        onScroll={e => setShowScrollTop(e.nativeEvent.contentOffset.y > 200)}
        scrollEventThrottle={16}
      >

        {/* ── Hero card — same accent-color tile pattern as Health ── */}
        <SosHeroCard
          activeLostAlert={activeLostAlert}
          ac={ac}
          pet={pet}
          pets={pets}
          petMeta={petMeta}
          locationLoading={locationLoading}
          locationText={locationText}
          nearbyVets={nearbyVets}
          nearbyAlerts={nearbyAlerts}
          getDaysRemaining={getDaysRemaining}
          handAnim={handAnim}
          colors={colors}
          s={s}
          onSwitchPet={() => setShowPetSwitcher(true)}
        />

        {/* ── SOS / Found button ── */}
        <View style={s.section}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <TouchableOpacity
              style={[s.sosBtn, { backgroundColor: activeLostAlert ? '#2ECC71' : '#E74C3C',
                shadowColor: activeLostAlert ? '#2ECC71' : '#E74C3C' }]}
              onPress={activeLostAlert ? handleMarkFound : () => setShowModal(true)}
              activeOpacity={0.85}
            >
              <Text style={s.sosBtnEmoji}>{activeLostAlert ? '🎉' : '🚨'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.sosBtnLabel}>{activeLostAlert ? 'Mark as Found' : 'Report Lost'}</Text>
                <Text style={s.sosBtnSub}>
                  {activeLostAlert
                    ? `Alert expires in ${getDaysRemaining((activeLostAlert as any)?.expires_at) || 0} days`
                    : 'Alert pet parents within your selected radius'
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* ── Quick actions ── */}
        <View style={s.section}>
          <View style={s.quickRow}>
            {[
              { icon: 'share-social-outline', label: 'Share Alert',
                onPress: () => pet && Share.share({ message: `🚨 MISSING: ${pet.emoji ?? '🐾'} ${pet.name} (${pet.species}${pet.breed ? ` · ${pet.breed}` : ''})\n📍 Last seen: ${locationText ?? 'unknown'}\n\nPosted via Family Cube` }) },
              { icon: 'card-outline',         label: 'ID Card',
                onPress: () => pet && router.push(`/pet/card?id=${pet.id}` as any) },
              { icon: 'location-outline',     label: 'Refresh',
                onPress: getLocation, loading: locationLoading },
              { icon: 'call-outline',         label: 'Poison Ctrl',
                onPress: () => callNumber('+18884264435', 'ASPCA Poison Control') },
            ].map((q) => (
              <TouchableOpacity key={q.label} style={[s.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={q.onPress} activeOpacity={0.75}>
                {(q as any).loading
                  ? <ActivityIndicator size="small" color={ac} />
                  : <Ionicons name={q.icon as any} size={20} color={ac} />}
                <Text style={[s.quickLabel, { color: colors.textSecondary }]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Emergency contacts ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Emergency Contacts</Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {EMERGENCY_CONTACTS.map((c, i) => (
              <TouchableOpacity key={c.id} onPress={() => callNumber(c.phone, c.name)} activeOpacity={0.7}
                style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[s.rowIcon, { backgroundColor: isDark ? '#3D1515' : '#FEE2E2' }]}>
                  <Text style={{ fontSize: TYPO.heading }}>{c.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: colors.textPrimary }]}>{c.name}</Text>
                  <Text style={[s.rowSub, { color: colors.textSecondary }]}>
                    {c.phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '+1 ($2) $3-$4')}
                    {c.is_24h ? '  ·  24/7' : ''}
                  </Text>
                </View>
                <View style={[s.callChip, { backgroundColor: isDark ? '#3D1515' : '#FEE2E2' }]}>
                  <Ionicons name="call-outline" size={13} color="#EF4444" />
                  <Text style={[s.callChipTxt, { color: '#EF4444' }]}>Call</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Nearby vets ── */}
        <SosNearbyVets
          nearbyVets={nearbyVets}
          vetsLoading={vetsLoading}
          ac={ac}
          isDark={isDark}
          colors={colors}
          s={s}
          onCall={callNumber}
        />

        {/* ── Nearby lost pets ── */}
        <SosNearbyAlerts
          nearbyAlerts={nearbyAlerts}
          alertsLoading={alertsLoading}
          isDark={isDark}
          colors={colors}
          s={s}
          onCall={callNumber}
        />

      </ScrollView>
      

      {/* ── Report Lost modal ── */}
      <BottomSheet visible={showModal} onClose={() => setShowModal(false)} title={`🚨 Report ${pet?.name ?? 'pet'} lost`}>
            <Text style={[s.sheetSub, { color: colors.textSecondary }]}>
              Alerts pet parents within {selectedRadius} miles. Add as much detail as possible.
            </Text>

            <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Last seen address *</Text>
            <LocationAutocompleteInput
              value={locationText ?? ''}
              onChangeText={setLocationText}
              placeholder="Where was your pet last seen?"
              accent={ac}
              colors={colors}
              autoDetect
              onLocationDetected={(text, lat, lng) => {
                setLocationText(text);
                setCoords({ lat, lng });
              }}
              style={{ marginBottom: 12 }}
            />

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Description *</Text>
              <TextInput
                style={[s.input, s.textarea, { borderColor: formErrors.description ? '#EF4444' : colors.inputBorder, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                placeholder={`Last seen near… describe the area, collar colour, anything that helps ${pet?.name ?? 'your pet'} get found`}
                placeholderTextColor={colors.placeholder}
                value={description} onChangeText={v => { setDescription(v); if (formErrors.description) setFormErrors(e => ({ ...e, description: undefined })); }}
                multiline numberOfLines={4} textAlignVertical="top"
                maxLength={500}
              />
              {formErrors.description && <Text style={s.fieldError}>{formErrors.description}</Text>}
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Contact phone *</Text>
              <TextInput
                style={[s.input, { borderColor: formErrors.phone ? '#EF4444' : colors.inputBorder, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                placeholder="+1 555 000 0000" placeholderTextColor={colors.placeholder}
                value={contactPhone} onChangeText={v => { setContactPhone(v); if (formErrors.phone) setFormErrors(e => ({ ...e, phone: undefined })); }} keyboardType="phone-pad"
                maxLength={20}
              />
              {formErrors.phone && <Text style={s.fieldError}>{formErrors.phone}</Text>}
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
                Reward amount {localeSettings.currencySymbol} (optional)
              </Text>
              <TextInput
                style={[s.input, { borderColor: formErrors.reward ? '#EF4444' : colors.inputBorder, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                placeholder={`e.g. 100.50 ${localeSettings.currencySymbol}`}
                placeholderTextColor={colors.placeholder}
                value={reward}
                onChangeText={(text) => {
                  const filtered = text.replace(/[^0-9.]/g, '');
                  const parts = filtered.split('.');
                  if (parts.length <= 2) { setReward(filtered); if (formErrors.reward) setFormErrors(e => ({ ...e, reward: undefined })); }
                }}
                keyboardType="decimal-pad"
              />
              {formErrors.reward && <Text style={s.fieldError}>{formErrors.reward}</Text>}
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Notification radius</Text>
              <View style={s.radiusSelector}>
                {[3, 5, 10].map((miles) => (
                  <TouchableOpacity
                    key={miles}
                    style={[
                      s.radiusButton,
                      {
                        borderColor: selectedRadius === miles ? ac : colors.border,
                        backgroundColor: selectedRadius === miles ? ac : colors.inputBg,
                      }
                    ]}
                    onPress={() => {
                      setSelectedRadius(miles as 3 | 5 | 10);
                      usePreferenceStore.getState().setSOSNotificationRadius(miles as 3 | 5 | 10);
                    }}
                  >
                    <Text style={[
                      s.radiusButtonText,
                      { color: selectedRadius === miles ? '#fff' : colors.textPrimary }
                    ]}>
                      {miles} mi
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={s.sheetBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={() => { setShowModal(false); setFormErrors({}); }}>
                <Text style={[s.cancelTxt, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.alertBtn, sending && { opacity: 0.6 }]} onPress={handleReportLost} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.alertBtnTxt}>🚨 Send Alert</Text>}
              </TouchableOpacity>
            </View>
      </BottomSheet>

      {/* ── Pet switcher — same as home screen ── */}
      <SosPetSwitcher
        visible={showPetSwitcher}
        onClose={() => setShowPetSwitcher(false)}
        pets={pets}
        activePetId={activePetId}
        colors={colors}
        bottomInset={insets.bottom}
        onSelect={(id) => setActivePet(id)}
      />

      <BottomSheet visible={showFoundModal} onClose={() => setShowFoundModal(false)} title={`🎉 ${pet?.name ?? 'Pet'} found!`}>
            <Text style={[s.sheetSub, { color: colors.textSecondary }]}>
              This message goes out to everyone who was notified about the search.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Message to searchers</Text>
              <TextInput
                style={[s.input, s.textarea, { borderColor: colors.inputBorder, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                placeholder="Let everyone know the good news…"
                placeholderTextColor={colors.placeholder}
                value={foundMessage} onChangeText={setFoundMessage}
                multiline numberOfLines={3} textAlignVertical="top"
              />

              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>How was {pet?.name ?? 'they'} found? (optional)</Text>
              <TextInput
                style={[s.input, s.textarea, { borderColor: colors.inputBorder, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                placeholder="e.g. Spotted near the park, a neighbor called us…"
                placeholderTextColor={colors.placeholder}
                value={foundDetails} onChangeText={setFoundDetails}
                multiline numberOfLines={3} textAlignVertical="top"
              />

              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Credit the finder (optional)</Text>
              <View style={{ position: 'relative', zIndex: 10 }}>
                {showFinderList && foundByName.trim().length > 0 && !foundByUserId && (
                  <View style={[s.finderDropdown, s.finderDropdownUp, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {finderSearching ? (
                      <View style={s.finderRow}>
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                        <Text style={[s.finderRowText, { color: colors.textSecondary }]}>Searching…</Text>
                      </View>
                    ) : finderResults.length > 0 ? (
                      finderResults.map((u) => (
                        <TouchableOpacity key={u.id} style={s.finderRow} onPress={() => selectFinder(u)}>
                          <View style={[s.finderAvatar, { backgroundColor: ac + '22' }]}>
                            <Text style={{ fontSize: TYPO.body }}>{(u.handle ?? u.full_name ?? '?').charAt(0).toUpperCase()}</Text>
                          </View>
                          <Text style={[s.finderRowText, { color: colors.textPrimary }]} numberOfLines={1}>
                            {u.handle ? `@${u.handle}` : (u.full_name ?? 'Unknown user')}
                          </Text>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text style={[s.finderRowText, { color: colors.textSecondary, padding: 10 }]}>
                        No match — this name will be saved as-is
                      </Text>
                    )}
                  </View>
                )}
                <TextInput
                  style={[s.input, { borderColor: colors.inputBorder, color: colors.textPrimary, backgroundColor: colors.inputBg }]}
                  placeholder="Search the community who was notified…"
                  placeholderTextColor={colors.placeholder}
                  value={foundByName}
                  onChangeText={handleFinderNameChange}
                  onFocus={() => setShowFinderList(true)}
                />
                {!!foundByUserId && (
                  <View style={s.finderVerifiedBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#1D9E75" />
                    <Text style={s.finderVerifiedText}>Community member</Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={s.sheetBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowFoundModal(false)}>
                <Text style={[s.cancelTxt, { color: colors.textSecondary }]}>Not yet</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.alertBtn, markingFound && { opacity: 0.6 }]} onPress={handleConfirmFound} disabled={markingFound}>
                {markingFound ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.alertBtnTxt}>🎉 Notify everyone</Text>}
              </TouchableOpacity>
            </View>
      </BottomSheet>

      {showScrollTop && (
        <TouchableOpacity
          onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ position: 'absolute', bottom: insets.bottom + 16, right: 20, width: 46, height: 46, borderRadius: 23,
            backgroundColor: ac, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
          <Ionicons name="chevron-up" size={22} color="#fff" />
        </TouchableOpacity>
      )}

    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 40 },

  // ── Header (matches Health / Memories) ──
  header:    { flexDirection: 'row', alignItems: 'center', gap: 12,
               paddingHorizontal: 20, paddingVertical: 14 },
  title:     { fontSize: TYPO.hero, fontWeight: '800', letterSpacing: -0.5 },
  sub:       { fontSize: TYPO.body, marginTop: 1 },
  headerBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
               alignItems: 'center', justifyContent: 'center' },

  // ── Hero card (matches Health hero pattern) ──
  heroWrap:  { marginHorizontal: 16, marginBottom: 6 },
  hero:      { borderRadius: 24, padding: 18, overflow: 'hidden',
               shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  heroBlob:  { position: 'absolute', width: 160, height: 160, borderRadius: 80,
               backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -40 },

  heroPetRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroAvatar:   { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center', justifyContent: 'center' },
  heroName:     { fontSize: TYPO.heading, fontWeight: '800', color: '#fff' },
  heroSub:      { fontSize: TYPO.body, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  passportBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5,
                  borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  passportBtnTxt:{ fontSize: TYPO.body, fontWeight: '600', color: '#fff' },

  heroTiles:    { flexDirection: 'row', gap: 8 },
  heroTile:     { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center' },
  heroTileMid:  {},
  heroTileNum:  { fontSize: TYPO.heading, fontWeight: '800', color: '#fff' },
  heroTileLabel:{ fontSize: TYPO.body, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginTop: 2, letterSpacing: 0.5 },

  alertBanner:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
                  backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  alertBannerTxt:{ fontSize: TYPO.body, fontWeight: '600', color: '#fff' },

  // ── SOS button ──
  section:  { marginHorizontal: 16, marginTop: 12 },
  sosBtn:   { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 18,
              shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  sosBtnEmoji:{ fontSize: TYPO.hero },
  sosBtnLabel:{ fontSize: TYPO.subheading, fontWeight: '800', color: '#fff' },
  sosBtnSub:  { fontSize: TYPO.body, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  // ── Quick actions ──
  quickRow:  { flexDirection: 'row', gap: 8 },
  quickBtn:  { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 16,
               borderWidth: StyleSheet.hairlineWidth,
               shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  quickLabel:{ fontSize: TYPO.body, fontWeight: '600', marginTop: 5 },

  // ── Shared section ──
  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: TYPO.body, fontWeight: '700', marginBottom: 8 },
  card:         { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
                  shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  emptyCard:    { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 24, alignItems: 'center', marginBottom: 2 },

  // ── Shared row ──
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: TYPO.body, fontWeight: '600' },
  rowSub:   { fontSize: TYPO.body, marginTop: 2 },

  callChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  callChipTxt: { fontSize: TYPO.body, fontWeight: '700' },
  iconBtn:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge24:     { backgroundColor: isDark ? '#3D1515' : '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badge24Txt:  { fontSize: TYPO.body, fontWeight: '700', color: '#EF4444' },

  rewardBadge: { alignItems: 'center', backgroundColor: isDark ? '#3D2000' : '#FFF7ED', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginRight: 4 },
  rewardAmt:   { fontSize: TYPO.body, fontWeight: '800', color: '#D97706' },
  rewardLbl:   { fontSize: TYPO.body, fontWeight: '500', color: '#D97706' },

  // ── Modal ──
  sheetSub:    { fontSize: TYPO.body, lineHeight: 19, marginBottom: 12 },
  locationChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  locationChipTxt: { fontSize: TYPO.body, fontWeight: '600', flex: 1 },
  inputLabel:  { fontSize: TYPO.body, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  fieldError:  { fontSize: TYPO.caption, color: '#EF4444', fontWeight: '500', marginTop: 4, marginBottom: 2 },
  input:       { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: TYPO.body },
  textarea:    { height: 88, paddingTop: 12 },
  sheetBtns:   { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:   { flex: 1, height: 50, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelTxt:   { fontSize: TYPO.body },
  alertBtn:    { flex: 2, height: 50, backgroundColor: '#E74C3C', borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                 shadowColor: '#E74C3C', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  alertBtnTxt: { color: '#fff', fontSize: TYPO.body, fontWeight: '800' },

  // ── Finder search dropdown ──
  finderDropdown: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden', maxHeight: 180 },
  finderDropdownUp: {
    position: 'absolute', left: 0, right: 0, bottom: '100%', marginTop: 0, marginBottom: 6,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: 12,
  },
  finderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  finderRowText: { fontSize: TYPO.body, flex: 1 },
  finderAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  finderVerifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  finderVerifiedText: { fontSize: TYPO.body, fontWeight: '600', color: '#1D9E75' },

  // ── Radius selector ──
  radiusSelector:  { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 12 },
  radiusButton:    { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radiusButtonText:{ fontSize: TYPO.body, fontWeight: '600' },
});
