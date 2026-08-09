/**
 * Consolidated data hook for HomeScreen.
 * Fetches weather, nearby partners, and product picks in parallel.
 * Keeps useHomeDashboard + useSponsoredListings separate (they use React Query).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWeather, clearWeatherCache, getTodayScheduleAllPets, type Weather, type TodayItem } from '@/lib/weather';
import { getOSMPlaces, getProductPicks, type Partner, type PartnerCategory, type ProductPick, type Coords } from '@/lib/discovery';
import { getLocationAPI } from '@/lib/location';
import { useNotifStore } from '@/store/notifStore';
import { invalidateLostAlerts } from '@/lib/hooks/useActiveLostAlerts';
import type { Pet } from '@/lib/types';

interface UseHomeSecondaryDataOptions {
  userId: string | undefined;
  pets: Pet[];
  activePetId: string | null;
  nearbyRadiusKm: number | null;
  onDashRefetch: () => void;
  onPetsRefetch: (userId: string) => Promise<void>;
}

export function useHomeScreenData({
  userId,
  pets,
  activePetId,
  nearbyRadiusKm,
  onDashRefetch,
  onPetsRefetch,
}: UseHomeSecondaryDataOptions) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<TodayItem[]>([]);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [productPicks, setProductPicks] = useState<ProductPick[]>([]);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const scheduleInFlight = useRef(false);
  const lastScheduleFetch = useRef(0);
  const coordsLoaded = useRef(false);

  // Get location once
  useEffect(() => {
    if (coordsLoaded.current) return;
    coordsLoaded.current = true;
    (async () => {
      try {
        const Loc = getLocationAPI();
        if (!Loc) return;
        const { status } = await Loc.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.Balanced });
        setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch { /* keep null */ }
    })();
  }, []);

  // Fetch weather once on mount
  useEffect(() => {
    let cancelled = false;
    getCurrentWeather()
      .then(w => { if (!cancelled && w) setWeather(w); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch today's schedule when pets change
  const fetchSchedule = useCallback(async () => {
    if (!pets.length) return;
    const now = Date.now();
    if (now - lastScheduleFetch.current < 8_000) return;
    if (scheduleInFlight.current) return;
    lastScheduleFetch.current = now;
    scheduleInFlight.current = true;
    try {
      const schedule = await getTodayScheduleAllPets(
        pets.map(p => p.id),
        pets.map(p => ({ id: p.id, name: p.name, emoji: (p as any).emoji ?? '🐾' })),
      );
      setTodaySchedule(schedule ?? []);
    } catch {
      // keep previous schedule
    } finally {
      scheduleInFlight.current = false;
    }
  }, [pets]);

  // Fetch nearby partners when coords or activePet changes
  useEffect(() => {
    if (!coords || !activePetId || nearbyRadiusKm == null) return;
    const activePet = pets.find(p => p.id === activePetId) ?? pets[0];
    if (!activePet) return;
    let cancelled = false;
    setAllPartners([]);
    setPartnersLoading(true);
    getOSMPlaces(coords, null, activePet, nearbyRadiusKm)
      .then(rows => { if (!cancelled) { setAllPartners(rows); setPartnersLoading(false); } })
      .catch(() => { if (!cancelled) setPartnersLoading(false); });
    return () => { cancelled = true; };
  }, [coords, activePetId, nearbyRadiusKm, pets]);

  // Fetch product picks when pets load
  useEffect(() => {
    if (!pets.length) { setProductPicks([]); return; }
    let cancelled = false;
    getProductPicks(pets as any)
      .then(ps => { if (!cancelled) setProductPicks(ps); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pets]);

  // Full pull-to-refresh
  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    clearWeatherCache();
    invalidateLostAlerts();
    lastScheduleFetch.current = 0;

    const [, w] = await Promise.allSettled([
      Promise.all([
        onPetsRefetch(userId),
        onDashRefetch(),
        userId ? useNotifStore.getState().fetchUnreadCount(userId).catch(() => {}) : Promise.resolve(),
        fetchSchedule(),
      ]),
      getCurrentWeather(),
    ]);

    if (w.status === 'fulfilled' && w.value) setWeather(w.value);
    setRefreshing(false);
  }, [userId, onPetsRefetch, onDashRefetch, fetchSchedule]);

  return {
    weather,
    todaySchedule,
    allPartners,
    partnersLoading,
    productPicks,
    coords,
    refreshing,
    fetchSchedule,
    refresh,
  };
}
