import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '@/components/AppAlert';
import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  RefreshControl, useWindowDimensions, Animated, Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { format, subDays } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useHomeDashboard, useGlobalSummary, useSponsoredListings } from '@/lib/hooks/useHomeDashboard';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/lib/ThemeContext';
import { SPACING, RADIUS, TYPO} from '@/constants/theme';
import { MOOD_DAYS } from '@/lib/homeUtils';
import { CubeMark } from '@/components/FamilyCubeLogo';
import PawBondSplashScreen from '@/components/PawBondSplashScreen';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { type PartnerCategory } from '@/lib/discovery';
import { parseDbTime, todayLocal } from '@/lib/dates';
import { formatTime } from '@/lib/units';
import { usePaywall } from '@/lib/hooks/usePaywall';
import { useActiveLostAlert } from '@/lib/hooks/useActiveLostAlert';
import { useActiveLostAlerts } from '@/lib/hooks/useActiveLostAlerts';
import { LIMITS, showUpgradeAlert } from '@/lib/subscription';
import AppointmentDetailSheet from '@/components/AppointmentDetailSheet';
import MedicationDetailSheet from '@/components/MedicationDetailSheet';
import type { Appointment } from '@/lib/types';
import type { Medication } from '@/lib/db/medications';
import { useNotifStore } from '@/store/notifStore';

// Extracted components
import { SponsoredBanner, RecommendationCarousel } from '@/components/home/CarouselComponents';
import { darkenHex, hexLuminance, greetingWord } from '@/lib/homeUtils';
import { PetHeroCarousel } from '@/features/home/components/PetHeroCarousel';
import { WeatherCard } from '@/features/home/components/WeatherCard';
import { WidgetGrid } from '@/features/home/components/WidgetGrid';
import { NearbySection } from '@/features/home/components/NearbySection';
import { PetSelectorModals } from '@/features/home/components/PetSelectorModals';
import { StatusStrip } from '@/features/home/components/StatusStrip';

// New modular data hook
import { useHomeScreenData } from '@/features/home/hooks/useHomeScreenData';
import { makeStyles } from '@/features/home/screens/HomeScreen.styles';

const TEAL = '#14B8A6';
const BellIcon = ({ color = '#71717A' }: { color?: string }) => (
  <Ionicons name="notifications-outline" size={22} color={color} />
);

type QARoute = string | { pathname: string; params?: Record<string, string> };

function useQuickActions(colors: any, activePetId: string | null, sosEnabled: boolean, moodScanEnabled: boolean, petName?: string) {
  return useMemo(() => [
    {
      label: 'Health Centre', bg: colors.primaryLight, border: colors.primary + '25',
      route: { pathname: '/(tabs)/care', params: { section: 'health' } } as QARoute,
      icon: <Ionicons name="medkit-outline" size={24} color={colors.primaryText ?? colors.primary} />,
    },
    {
      label: 'Journal', bg: colors.successLight ?? '#F0FDF4', border: (colors.success ?? '#22C55E') + '40',
      route: { pathname: '/(tabs)/care', params: { section: 'notes' } } as QARoute,
      icon: <Ionicons name="journal-outline" size={24} color={colors.success ?? '#22C55E'} />,
    },
    ...(moodScanEnabled ? [{
      label: 'AI mood scan', bg: colors.infoLight ?? '#EFF6FF', border: (colors.info ?? '#3B82F6') + '40',
      route: '/ai/mood-camera' as QARoute,
      icon: <Ionicons name="camera-outline" size={24} color={colors.info ?? '#3B82F6'} />,
    }] : []),
    {
      label: 'PetDoc Chat', bg: colors.primaryLight ?? '#F0EAFB', border: colors.primary + '40',
      route: '/ai/vet-chat' as QARoute,
      icon: <Ionicons name="chatbubble-ellipses-outline" size={24} color="#7B2FBE" />,
      ultimateOnly: true,
      paywall: {
        headline: '24/7 Virtual Vet Chat',
        body: `Skip the $150 emergency clinic fee. Ask anything about ${petName ?? 'your baby'}'s diet, behavior, or medication — any time, any night.`,
        perks: [
          'Unlimited AI vet conversations',
          `Personalised answers for ${petName ?? 'your baby'}`,
          'Symptom guidance & home care tips',
          'Follow-up questions in the same chat',
        ],
      },
    },
    {
      label: 'Symptom Scan', bg: colors.primaryLight, border: colors.primary + '40',
      route: '/ai/symptom-scan' as QARoute,
      icon: <Ionicons name="scan-outline" size={24} color={colors.primaryText ?? colors.primary} />,
      ultimateOnly: true,
      paywall: {
        headline: 'Instant AI Symptom Scanner',
        body: `Is it an emergency or just grass? Photo-scan ${petName ?? 'your baby'}'s rashes, eyes, or digestion issues for immediate triage guidance.`,
        perks: [
          'Photo-scan symptoms instantly',
          'Triage guidance — emergency or wait?',
          'Breed & age-aware analysis',
          '24/7 Virtual Vet Chat included',
        ],
      },
    },
    {
      label: 'Pet Expenses', bg: (colors.successLight ?? '#F0FDF4'), border: (colors.success ?? '#16A34A') + '40',
      route: '/health/expenses' as QARoute,
      icon: <Ionicons name="wallet-outline" size={24} color={colors.success ?? '#16A34A'} />,
    },
    ...(sosEnabled ? [{
      label: 'Emergency', bg: colors.dangerLight, border: colors.danger + '25',
      route: { pathname: '/(tabs)/sos', params: { from: 'home' } } as QARoute,
      icon: <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />,
    }] : []),
  ], [colors, activePetId, sosEnabled, moodScanEnabled, petName]);
}

// Module-level flag — survives remounts (biometric lock navigation, token refresh)
let _homeHasLoadedOnce = false;

export default function HomeScreen() {
  const { width, height: screenHeight } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const hasLoadedOnce = useRef(_homeHasLoadedOnce);
  const lastFocusFetch = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const splashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [splashTimedOut, setSplashTimedOut] = useState(false);

  // Scroll-based carousel visibility
  const mainScrollY = useRef(0);
  const sponsoredLayoutRef = useRef({ y: 0, h: 0 });
  const recLayoutRef = useRef({ y: 0, h: 0 });
  const [sponsoredVisible, setSponsoredVisible] = useState(true);
  const [recVisible, setRecVisible] = useState(true);

  const checkCarouselVisibility = useCallback(() => {
    const sy = mainScrollY.current;
    const wh = screenHeight;
    const inView = (y: number, h: number) => y + h > sy - 50 && y < sy + wh + 50;
    setSponsoredVisible(v => { const next = inView(sponsoredLayoutRef.current.y, sponsoredLayoutRef.current.h); return v === next ? v : next; });
    setRecVisible(v => { const next = inView(recLayoutRef.current.y, recLayoutRef.current.h); return v === next ? v : next; });
  }, [screenHeight]);

  // Pet & user stores
  const {
    pets, activePetId, loading,
    fetchPets, setActivePet, activePet,
    daysWithPet, todaysMood, moodLogs,
    checklist, fetchChecklist,
    streaks, touchStreak,
    vetVisits, vaccines,
    appointments, fetchAppointments,
    dailyScores, fetchDailyCareScores,
  } = usePetStore(useShallow(s => ({
    pets: s.pets, activePetId: s.activePetId, loading: s.loading,
    fetchPets: s.fetchPets, setActivePet: s.setActivePet, activePet: s.activePet,
    daysWithPet: s.daysWithPet, todaysMood: s.todaysMood, moodLogs: s.moodLogs,
    checklist: s.checklist, fetchChecklist: s.fetchChecklist,
    streaks: s.streaks, touchStreak: s.touchStreak,
    vetVisits: s.vetVisits, vaccines: s.vaccines,
    appointments: s.appointments, fetchAppointments: s.fetchAppointments,
    dailyScores: s.dailyScores, fetchDailyCareScores: s.fetchDailyCareScores,
  })));

  const { profile, user, fetchProfile } = useAuthStore();
  const { gate, tier } = usePaywall();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  // isOnSummary drives the "no active pet" view without clearing activePetId in the store.
  // Starts true so the app always opens on the summary card for multi-pet users.
  const [isOnSummary, setIsOnSummary] = useState(true);
  const isGlobal = isOnSummary && pets.length >= 2;
  // When on the summary card, suppress the active pet so no single-pet data leaks through.
  const pet = isGlobal ? null : (activePet() ?? pets[0] ?? null);
  const displayPetId = pet?.id ?? null;
  const days = displayPetId ? daysWithPet(displayPetId) : 0;
  const mood = displayPetId ? todaysMood(displayPetId) : null;

  const firstName = (profile?.full_name?.trim().split(/\s+/)[0])
    || (user?.user_metadata?.full_name?.trim().split(/\s+/)[0])
    || (user?.user_metadata?.name?.trim().split(/\s+/)[0])
    || 'there';

  // Dashboard RPC (React Query — already efficient)
  const { data: singleDash, refetch: refetchDash } = useHomeDashboard(displayPetId ?? null, user?.id ?? null);
  const allPetIds = useMemo(() => pets.map(p => p.id), [pets]);
  const { data: globalSummary } = useGlobalSummary(user?.id ?? null, isGlobal);

  // Checklist counts — global mode reads from DB summary, single-pet from local store
  const todayChecklist = displayPetId ? (checklist[displayPetId] ?? []) : [];
  const tasksDone = isGlobal
    ? (globalSummary?.tasks_done ?? 0)
    : todayChecklist.filter((t: any) => t.completed && t.date === todayStr).length;
  const tasksTotal = isGlobal
    ? (globalSummary?.tasks_total ?? 0)
    : todayChecklist.filter((t: any) => t.date === todayStr).length;

  // All secondary data (weather, nearby, products) via consolidated parallel hook
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<number | null>(null); // null = pref not loaded yet
  const loadData = useCallback(async (userId: string) => {
    const [fetchedPets] = await Promise.all([fetchPets(userId), fetchProfile(userId)]);
    hasLoadedOnce.current = true;
    _homeHasLoadedOnce = true;
    // Fetch today's DB-stored scores for all pets in one query
    const petIds = (fetchedPets as any[] | undefined ?? usePetStore.getState().pets).map((p: any) => p.id);
    if (petIds.length) {
      fetchDailyCareScores(petIds).catch(() => {});
      petIds.forEach((id: string) => fetchAppointments(id).catch(() => {}));
    }
  }, [fetchPets, fetchProfile, fetchDailyCareScores, fetchAppointments]);

  const {
    weather, todaySchedule, allPartners, partnersLoading,
    productPicks, coords, refreshing, fetchSchedule, refresh,
  } = useHomeScreenData({
    userId: user?.id,
    pets,
    activePetId,
    nearbyRadiusKm,
    onDashRefetch: refetchDash,
    onPetsRefetch: loadData,
  });

  // Unread notifications count
  const totalUnread = useNotifStore(s => s.unreadCount);

  // Derived counts — global reads from the single-RPC global summary, single-pet from per-pet dash
  const todayMoodCount = isGlobal
    ? (globalSummary?.counts?.moods ?? 0)
    : (singleDash?.counts?.moods ?? 0);

  const todayEntryCount = useMemo(() => {
    const c = isGlobal ? globalSummary?.counts : singleDash?.counts;
    if (!c) return 0;
    return c.notes + c.moods + c.meals + c.grooming + c.weight + c.vet;
  }, [isGlobal, globalSummary?.counts, singleDash?.counts]);

  const todayPhotoScanCount = isGlobal
    ? (globalSummary?.scan_count ?? 0)
    : (singleDash?.scan_count ?? 0);

  const nextVet = useMemo(() => {
    const raw = isGlobal ? globalSummary?.next_vet : singleDash?.next_vet;
    if (!raw) return null;
    const d = parseDbTime(raw);
    if (isNaN(d.getTime())) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const then = new Date(d); then.setHours(0, 0, 0, 0);
    return { label: format(d, 'MMM d'), timeLabel: formatTime(d), daysUntil: Math.round((then.getTime() - now.getTime()) / 86400000) };
  }, [isGlobal, globalSummary?.next_vet, singleDash?.next_vet]);

  const lastVet = useMemo(() => {
    const raw = isGlobal ? globalSummary?.last_vet : singleDash?.last_vet;
    if (!raw?.date) return null;
    const d = parseDbTime(raw.date);
    if (isNaN(d.getTime())) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const then = new Date(d); then.setHours(0, 0, 0, 0);
    return { label: format(d, 'MMM d'), daysAgo: Math.round((now.getTime() - then.getTime()) / 86400000), type: raw.type, title: raw.title };
  }, [isGlobal, globalSummary?.last_vet, singleDash?.last_vet]);

  // Next appointment per pet from today's schedule
  const nextApptByPet = useMemo(() => {
    const map: Record<string, { label: string; timeLabel: string; type: 'appointment' | 'medication' }> = {};
    const now = new Date();
    for (const [petId, appts] of Object.entries(appointments ?? {})) {
      const next = (appts as any[])
        .filter(a => (a.status === 'upcoming' || a.status === 'scheduled') && a.scheduled_at && new Date(a.scheduled_at) >= now)
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
      if (next) {
        const d = new Date(next.scheduled_at);
        const isToday = d.toDateString() === now.toDateString();
        const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString();
        const timeLabel = isToday
          ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : isTomorrow ? 'Tomorrow'
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        map[petId] = { label: next.title, timeLabel, type: 'appointment' };
      }
    }
    return map;
  }, [appointments]);

  // 7-day mood chart data
  const weekMoods = useMemo(() => {
    const logs = displayPetId ? (moodLogs[displayPetId] ?? []) : [];
    return Array.from({ length: 7 }, (_, i) => {
      const day = subDays(new Date(), 6 - i);
      const dateStr = format(day, 'yyyy-MM-dd');
      const log = logs.find((l: any) => l.date === dateStr);
      return { day: MOOD_DAYS[day.getDay() === 0 ? 6 : day.getDay() - 1], mood: log?.mood_label ?? null, isToday: i === 6 };
    });
  }, [moodLogs, displayPetId]);

  // Animations
  const stripFade = useRef(new Animated.Value(1)).current;
  const stripY = useRef(new Animated.Value(0)).current;
  const actionsFade = useRef(new Animated.Value(1)).current;
  const actionsY = useRef(new Animated.Value(0)).current;
  const moodEmojiScale = useRef(new Animated.Value(1)).current;
  const prevMoodRef = useRef<string | null>(null);
  const scanPulse = useRef(new Animated.Value(1)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const [bondDisplay, setBondDisplay] = useState(0);

  // Streak
  const [streakMilestone, setStreakMilestone] = useState<{ days: number; petName: string; emoji: string } | null>(null);
  const STREAK_MILESTONES = [3, 7, 14, 30, 100, 365];
  const streak = isGlobal
    ? Math.max(0, ...pets.map(p => streaks[p.id] ?? 0))
    : (displayPetId ? (streaks[displayPetId] ?? 0) : 0);

  // UI state
  const [discoverCat, setDiscoverCat] = useState<PartnerCategory | null>(null);
  const [showPetSelector, setShowPetSelector] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [pendingActionRoute, setPendingActionRoute] = useState<QARoute | null>(null);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showApptSheet, setShowApptSheet] = useState(false);
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  const [selectedMedPetId, setSelectedMedPetId] = useState<string>('');
  const [showMedSheet, setShowMedSheet] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  // Swipe hero
  const sortedPets = useMemo(() => [...pets], [pets]);
  const petHeroRef = useRef<ScrollView>(null);
  const heroCardWidth = width - 32;
  const swipeDidSetPet = useRef(false);
  // true only when carousel is settled on the summary card (not a specific pet card)
  const isOnSummaryCard = useRef(false);
  // skip programmatic carousel scroll on the very first mount so the app opens on the summary card
  const carouselHasMounted = useRef(false);

  const heroGradient: [string, string] = useMemo(() => {
    const acc: string = (pet as any)?.accent_color;
    if (acc) return [acc, darkenHex(acc, 0.25)];
    return [colors.primary, colors.primaryDark];
  }, [pet, colors]);

  const allSpecies = useMemo(
    () => [...new Set(pets.map((p: any) => p.species).filter(Boolean))] as string[],
    [pets],
  );
  const { data: sponsoredAds = [] } = useSponsoredListings(allSpecies, pet?.species ?? null);

  const displayPartners = useMemo(
    () => discoverCat ? allPartners.filter(p => p.category === discoverCat) : allPartners,
    [allPartners, discoverCat],
  );

  const sosEnabled = useFeatureFlag('sos_enabled', true);
  const moodScanEnabled = useFeatureFlag('mood_scan_enabled', true);
  const quickActions = useQuickActions(colors, displayPetId, sosEnabled, moodScanEnabled, pet?.name);
  const activeLostAlert = useActiveLostAlert(displayPetId ?? null);
  const lostPetIdSet = useActiveLostAlerts(allPetIds);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Splash safety timeout
  useEffect(() => {
    splashTimeoutRef.current = setTimeout(() => setSplashTimedOut(true), 8000);
    return () => { if (splashTimeoutRef.current) clearTimeout(splashTimeoutRef.current); };
  }, []);

  // Initial load
  useEffect(() => {
    if (user?.id) loadData(user.id);
  }, [user?.id, loadData]);

  // Focus: reload every 60s + update tick
  useFocusEffect(useCallback(() => {
    const now = Date.now();
    if (user?.id && now - lastFocusFetch.current > 60_000) {
      lastFocusFetch.current = now;
      loadData(user.id);
    }
    setFocusTick(t => t + 1);
  }, [user?.id, loadData]));

  // Focus: refetch dashboard
  useFocusEffect(useCallback(() => {
    if (displayPetId && user?.id) refetchDash();
  }, [refetchDash, displayPetId, user?.id]));

  // Focus: schedule refresh
  useFocusEffect(useCallback(() => {
    fetchSchedule();
  }, [fetchSchedule]));

  // Focus: reset outer scroll to top
  useFocusEffect(useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, []));

  // Focus: notification count (30s throttle)
  const lastNotifCountFetch = useRef(0);
  useFocusEffect(useCallback(() => {
    if (user?.id && Date.now() - lastNotifCountFetch.current > 30_000) {
      lastNotifCountFetch.current = Date.now();
      useNotifStore.getState().fetchUnreadCount(user.id).catch(() => {});
    }
  }, [user?.id]));

  // Checklist
  useEffect(() => {
    if (!displayPetId) return;
    fetchChecklist(displayPetId, todayStr);
  }, [displayPetId, focusTick, fetchChecklist, todayStr]);

  // Nearby radius pref — set null default so useHomeScreenData waits until pref is loaded
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('nearby_places_prefs').then(raw => {
      try {
        if (raw) {
          const { idx, metric } = JSON.parse(raw);
          const opts = metric ? [2, 5, 8, 16, 40] : [1, 3, 5, 10, 25];
          const v = opts[idx] ?? opts[1];
          setNearbyRadiusKm(metric ? v : v * 1.60934);
        } else {
          setNearbyRadiusKm(4.828); // default 3 miles
        }
      } catch {
        setNearbyRadiusKm(4.828);
      }
    });
  }, []));

  // Streak milestones — shown at most once per calendar day per (pet, streak) pair
  const streakCheckedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!displayPetId) return;
    if (streakCheckedRef.current.has(displayPetId)) return;
    streakCheckedRef.current.add(displayPetId);
    import('@/lib/db/streak').then(({ getCareStreak }) => {
      getCareStreak(displayPetId).then(async n => {
        usePetStore.setState(s => ({ streaks: { ...s.streaks, [displayPetId]: n } }));
        if (!STREAK_MILESTONES.includes(n)) return;
        const today = todayLocal();
        const key = `streak_celebrated_${displayPetId}_${n}_${today}`;
        const already = await AsyncStorage.getItem(key);
        if (already) return;
        await AsyncStorage.setItem(key, '1');
        const p = usePetStore.getState().pets.find(pp => pp.id === displayPetId);
        setStreakMilestone({ days: n, petName: p?.name ?? 'your baby', emoji: (p as any)?.emoji ?? '🐾' });
      }).catch(() => {});
    }).catch(() => {});
  }, [displayPetId]);

  // Bond heart animation
  const lastBondPet = useRef<string | null>(null);
  useEffect(() => {
    if (!days || !displayPetId) return;
    const isNewPet = displayPetId !== lastBondPet.current;
    lastBondPet.current = displayPetId;
    setBondDisplay(days);
    if (isNewPet) {
      heartScale.setValue(1);
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.5, useNativeDriver: true, speed: 30, bounciness: 12 }),
        Animated.spring(heartScale, { toValue: 1,   useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
    }
    return () => { heartScale.stopAnimation(); };
  }, [days, displayPetId]);

  // Mood emoji pop-in
  useEffect(() => {
    if (!mood?.mood_label || mood.mood_label === prevMoodRef.current) return;
    prevMoodRef.current = mood.mood_label;
    moodEmojiScale.setValue(0);
    Animated.spring(moodEmojiScale, { toValue: 1, damping: 10, stiffness: 180, useNativeDriver: true }).start();
  }, [mood?.mood_label]);

  // Scan pulse animation
  const scanMaxedForPulse = todayPhotoScanCount >= (LIMITS[tier]?.moodScansPerDay ?? 3);
  const scanPulseActive = !scanMaxedForPulse && !activeLostAlert;
  useEffect(() => {
    if (!scanPulseActive) { scanPulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanPulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scanPulse, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scanPulseActive]);

  // Reset scroll on pet switch
  const lastScrollResetPet = useRef<string | null>(null);
  useEffect(() => {
    if (displayPetId && displayPetId !== lastScrollResetPet.current) {
      lastScrollResetPet.current = displayPetId;
      if (!swipeDidSetPet.current) {
        scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      }
      swipeDidSetPet.current = false;
    }
  }, [displayPetId]);

  // Sync hero carousel position to active pet.
  // Summary card is always card 0 when 2+ pets, so pet at sortedPets[idx] is at card idx+1.
  // Skip on first mount so the app always opens on the summary card (position 0).
  useEffect(() => {
    if (!carouselHasMounted.current) {
      carouselHasMounted.current = true;
      return;
    }
    if (swipeDidSetPet.current) return;
    const idx = sortedPets.findIndex(p => p.id === activePetId);
    if (idx >= 0 && petHeroRef.current) {
      const hasSummary = sortedPets.length >= 2;
      const cardIdx = hasSummary ? idx + 1 : idx;
      petHeroRef.current.scrollTo({ x: cardIdx * (heroCardWidth + 12), animated: true });
    }
  }, [activePetId, sortedPets, heroCardWidth]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const goAddPet = useCallback(async () => {
    const petLimit = LIMITS[tier].pets;
    const limitLabel = petLimit === -1 ? 'unlimited' : `${petLimit} pet${petLimit === 1 ? '' : 's'}`;
    const ok = await gate(`pets`, { title: `Pet limit reached`, message: `Your ${tier === 'free' ? 'free' : tier === 'ultimate' ? 'Ultimate' : 'Pro'} plan supports ${limitLabel}. Upgrade to add more.` });
    if (ok) router.push(`/onboarding/add-pet`);
  }, [gate, tier]);

  const openScan = useCallback(() => {
    if (pet?.status === 'memorial') {
      showAlert('Memorial profile', `${pet.name}'s profile is a read-only memorial.`);
      return;
    }
    router.push('/ai/mood-camera');
  }, [pet]);

  const openApptSheet = useCallback(async (apptId: string) => {
    try {
      const { data } = await supabase.from('appointments').select('*').eq('id', apptId).single();
      if (data) { setSelectedAppt(data as Appointment); setShowApptSheet(true); }
      else router.push('/health/appointments');
    } catch { router.push('/health/appointments'); }
  }, []);

  const openMedSheet = useCallback(async (medId: string, petId: string) => {
    try {
      const { data } = await supabase.from('medications').select('*').eq('id', medId).single();
      if (data) { setSelectedMed(data as Medication); setSelectedMedPetId(petId); setShowMedSheet(true); }
    } catch {}
  }, []);

  const openVetTileSheet = useCallback(async () => {
    if (!displayPetId) return;
    try {
      if (nextVet) {
        const { data } = await supabase.from('appointments').select('*')
          .eq('pet_id', displayPetId).in('status', ['scheduled', 'upcoming'])
          .in('type', ['vet', 'checkup', 'vaccination']).gt('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true }).limit(1).single();
        if (data) { setSelectedAppt(data as Appointment); setShowApptSheet(true); return; }
        router.push('/health/appointments'); return;
      }
      if (lastVet) {
        const { data } = await supabase.from('appointments').select('*')
          .eq('pet_id', displayPetId).eq('status', 'completed')
          .in('type', ['vet', 'checkup', 'vaccination'])
          .order('scheduled_at', { ascending: false }).limit(1).single();
        if (data) { setSelectedAppt(data as Appointment); setShowApptSheet(true); return; }
      }
    } catch {}
    router.push('/health/appointments');
  }, [displayPetId, nextVet, lastVet]);

  const explainWhy = useCallback((reason: string) => {
    showAlert(
      'Why you\'re seeing this',
      `${reason}.\n\nSponsored picks are matched to all your babies' species and your area. Paid placements are labelled "Sponsored" or "Ad". We never sell your personal data.`,
    );
  }, []);

  const openPartner = useCallback((p: any) => {
    const url = p.cta_url ?? (p.phone ? `tel:${p.phone}` : null);
    if (url) { const { Linking } = require('react-native'); Linking.openURL(url).catch(() => {}); }
  }, []);

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = useMemo(() => makeStyles(colors, isDark, width), [colors, isDark, width]);

  // ── Loading / empty states ────────────────────────────────────────────────
  if (!hasLoadedOnce.current && loading && !splashTimedOut) {
    return <PawBondSplashScreen />;
  }

  if (!pet && !sortedPets.length) {
    if (!hasLoadedOnce.current && !splashTimedOut) return <PawBondSplashScreen />;
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.emptyWrap}>
          <Text style={s.emptyEmoji}>🐾</Text>
          <Text style={s.emptyTitle}>Add your first baby!</Text>
          <Text style={s.emptySub}>Track every precious day together</Text>
          <TouchableOpacity style={s.addBtn} onPress={goAddPet}>
            <Text style={s.addBtnText}>+ Add your baby</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasLoadedOnce.current && !splashTimedOut) return <PawBondSplashScreen />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.safe}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        {/* Header */}
        <View style={s.appBar}>
          <View style={s.petleyLogoBox}>
            <CubeMark size={44} />
          </View>
          <View style={s.greetWrap}>
            <Text style={s.greetWord}>{greetingWord()} 👋</Text>
            <Text style={s.greetName} numberOfLines={1}>{firstName}</Text>
          </View>
          <View style={s.appBarRight}>
            <TouchableOpacity
              style={s.bellBtn}
              onPress={() => router.push('/(tabs)/all-notifications')}
            >
              <BellIcon color={totalUnread > 0 ? TEAL : colors.textSecondary} />
              {totalUnread > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
                  backgroundColor: TEAL, borderWidth: 1.5, borderColor: colors.surface,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: '800', color: '#fff' }}>
                    {totalUnread < 10 ? totalUnread : '9+'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
        scrollEventThrottle={150}
        onScroll={(e) => {
          mainScrollY.current = e.nativeEvent.contentOffset.y;
          checkCarouselVisibility();
        }}
      >
        {/* Pet hero swipe cards */}
        <PetHeroCarousel
          sortedPets={sortedPets}
          activePetId={activePetId}
          setActivePet={setActivePet}
          clearActivePet={() => setActivePet(null)}
          heroCardWidth={heroCardWidth}
          petHeroRef={petHeroRef}
          swipeDidSetPet={swipeDidSetPet}
          isDark={isDark}
          colors={colors}
          daysWithPet={daysWithPet}
          streaks={streaks}
          moodLogs={moodLogs}
          vetVisits={vetVisits}
          vaccines={vaccines}
          totalLogs={isGlobal
            ? pets.reduce((sum, p) => {
                const hasLog = (moodLogs[p.id] ?? []).some((l: any) => l.date === todayStr);
                return sum + (hasLog ? 1 : 0);
              }, 0)
            : Object.values(singleDash?.counts ?? {}).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0)
          }
          dailyScores={dailyScores}
          lostPetIds={[...lostPetIdSet]}
          nextApptByPet={nextApptByPet}
          goAddPet={goAddPet}
          onSummaryCardChange={(v) => { isOnSummaryCard.current = v; setIsOnSummary(v); }}
        />

        {/* Weather + Status side by side */}
        {(weather || pet || isGlobal) && (
          <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14, marginBottom: 12, alignItems: 'stretch' }}>
            {weather && (
              <View style={{ flex: 1 }}>
                <WeatherCard weather={weather} isDark={isDark} compact />
              </View>
            )}
            {(pet || isGlobal) && (
              <StatusStrip
                tasksDone={tasksDone}
                tasksTotal={tasksTotal}
                mealsCount={isGlobal
                  ? (globalSummary?.counts?.meals ?? 0)
                  : (singleDash?.counts?.meals ?? 0)}
                todayEntryCount={todayEntryCount}
                scheduleCount={todaySchedule.length}
                isGlobal={isGlobal}
                stripFade={stripFade}
                stripY={stripY}
                colors={colors}
                s={s}
                compact
              />
            )}
          </View>
        )}

        {/* Lost pet banner */}
        {pet && activeLostAlert && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/sos' as any)}
            style={{
              marginHorizontal: 16, marginBottom: 12,
              backgroundColor: colors.dangerLight,
              borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger,
              flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
            }}
          >
            <Text style={{ fontSize: TYPO.heading }}>🔴</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.danger }}>
                {(pet as any).name} is lost
              </Text>
              <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 1 }}>
                Tap to mark as found or manage alert
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}

        {(pet || isGlobal) && (
          <>
            {/* Widget grid */}
            <WidgetGrid
              pet={pet as any}
              activePetId={displayPetId}
              ac={(pet as any)?.accent_color ?? colors.primary}
              days={days}
              bondDisplay={bondDisplay}
              streak={streak}
              petAvatarUrl={pet ? (pet as any).avatar_url ?? null : null}
              profile={profile}
              mood={mood}
              todayPhotoScanCount={todayPhotoScanCount}
              tier={tier}
              scanPulse={scanPulse}
              moodEmojiScale={moodEmojiScale}
              activeLostAlert={activeLostAlert}
              nextVet={nextVet}
              lastVet={lastVet}
              colors={colors}
              s={s}
              onOpenScan={() => {
                if (isOnSummaryCard.current && sortedPets.length > 1) {
                  setPendingActionRoute('/ai/mood-camera' as QARoute);
                  setShowPetSelector(true);
                } else {
                  openScan();
                }
              }}
              onOpenVetSheet={openVetTileSheet}
              onSummaryAction={(route) => {
                setPendingActionRoute(route as QARoute);
                setShowPetSelector(true);
              }}
              isGlobal={isGlobal}
              sortedPets={sortedPets}
              daysWithPet={daysWithPet}
              streaks={streaks}
              globalPetMoods={globalSummary?.pet_moods ?? []}
            />

            {/* Quick actions grid */}
            <Animated.View style={{ opacity: actionsFade, transform: [{ translateY: actionsY }] }}>
              <Text style={s.sectionTitle}>Quick actions</Text>
              <View style={s.actionsGrid}>
                {quickActions.map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={[s.actionGridCard, { backgroundColor: a.bg, borderColor: a.border }]}
                    onPress={() => {
                      if (pet?.status === 'memorial') {
                        showAlert('Memorial profile', `${pet.name}'s profile is a read-only memorial. New logs and AI features are not available.`);
                        return;
                      }
                      if ((a as any).ultimateOnly && tier !== 'ultimate') {
                        const pw = (a as any).paywall;
                        showUpgradeAlert({ title: pw?.headline, message: pw?.body, perks: pw?.perks, requiredTier: 'ultimate' });
                        return;
                      }
                      if (sortedPets.length === 1) {
                        // Always ensure single-pet context is set
                        setActivePet(sortedPets[0].id);
                        router.push(a.route as any);
                        return;
                      }
                      // On a specific pet card: treat that pet as active, skip selector
                      if (!isOnSummaryCard.current && activePetId) {
                        router.push(a.route as any);
                        return;
                      }
                      // On the summary card: ask which pet
                      setPendingActionRoute(a.route);
                      setShowPetSelector(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={s.actionGridIcon}>{a.icon}</View>
                    <Text style={[s.actionGridLabel, { color: colors.textPrimary }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>

            {/* Sponsored ads */}
            {sponsoredAds.length > 0 && (pet?.status !== 'memorial' || isGlobal) && (
              <View onLayout={(e) => {
                sponsoredLayoutRef.current = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
              }}>
                <SponsoredBanner ads={sponsoredAds} colors={colors} isDark={isDark} visible={sponsoredVisible} />
              </View>
            )}

            {/* Product recommendations */}
            {productPicks.length > 0 && (pet?.status !== 'memorial' || isGlobal) && (
              <View onLayout={(e) => {
                recLayoutRef.current = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
              }}>
                <RecommendationCarousel
                  products={productPicks}
                  petName={pets.length > 1 ? 'you' : (pet?.name ?? 'you')}
                  colors={colors}
                  isDark={isDark}
                  onWhyPress={() => explainWhy(productPicks[0].reason)}
                  visible={recVisible}
                />
              </View>
            )}

            {/* Near you */}
            <NearbySection
              pet={pet}
              partnersLoading={partnersLoading}
              allPartners={allPartners}
              coords={coords}
              nearbyRadiusKm={nearbyRadiusKm}
              discoverCat={discoverCat}
              setDiscoverCat={setDiscoverCat}
              displayPartners={displayPartners}
              openPartner={openPartner}
              colors={colors}
              s={s}
            />
          </>
        )}
      </ScrollView>

      {/* Sheets */}
      <AppointmentDetailSheet
        visible={showApptSheet}
        appointment={selectedAppt}
        canEdit={false}
        onClose={() => setShowApptSheet(false)}
        onSaved={updated => setSelectedAppt(updated)}
      />
      <MedicationDetailSheet
        visible={showMedSheet}
        medication={selectedMed}
        petId={selectedMedPetId}
        canEdit={false}
        onClose={() => setShowMedSheet(false)}
      />

      {/* Streak milestone modal */}
      <Modal visible={!!streakMilestone} transparent animationType="none" onRequestClose={() => setStreakMilestone(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 28, padding: 28, alignItems: 'center', gap: 10, width: '100%' }}>
            <Text style={{ fontSize: 52 }}>{streakMilestone?.emoji ?? '🐾'}</Text>
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.primary, letterSpacing: 1.2 }}>STREAK MILESTONE</Text>
            <Text style={{ fontSize: TYPO.hero, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 }}>
              {streakMilestone?.days} day{(streakMilestone?.days ?? 0) !== 1 ? 's' : ''} 🔥
            </Text>
            <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
              You've cared for {streakMilestone?.petName} every day for {streakMilestone?.days} days in a row. Keep it going!
            </Text>
            <TouchableOpacity
              style={{ marginTop: 8, backgroundColor: colors.primary, borderRadius: 20, paddingVertical: 13, paddingHorizontal: 36 }}
              onPress={() => setStreakMilestone(null)}
            >
              <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700' }}>Thanks! 🐾</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pet selector modal */}
      <PetSelectorModals
        showDropdown={showDropdown}
        setShowDropdown={setShowDropdown}
        showPetSelector={showPetSelector}
        setShowPetSelector={(show, selectedPetId) => {
          const resolvedId = selectedPetId ?? activePetId;
          if (!show && resolvedId) {
            setActivePet(resolvedId);
            swipeDidSetPet.current = true;
            // Leaving summary → switch to single-pet view
            if (isOnSummary) setIsOnSummary(false);
          }
          setShowPetSelector(show);
          if (!show && resolvedId && pendingActionRoute) {
            const route = pendingActionRoute === '/pet'
              ? `/pet/${resolvedId}`
              : pendingActionRoute;
            router.push(route as any);
            setPendingActionRoute(null);
          }
        }}
        sortedPets={sortedPets}
        activePetId={activePetId}
        setActivePet={setActivePet}
        goAddPet={goAddPet}
        bottomInset={insets.bottom}
        colors={colors}
      />
    </View>
  );
}
