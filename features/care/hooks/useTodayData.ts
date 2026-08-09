/**
 * useTodayData — loads all data required by TodayScreen.
 * Handles the medications DB query, all pet-store thunks,
 * realtime subscriptions, and a 30 s debounce guard.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { subscribeToDaily, unsubscribeFromDaily } from '@/lib/realtime';
import { useAppStateRefresh } from '@/lib/useAppStateRefresh';
import { isMedDueToday, getCurrentWeather, type Weather } from '@/lib/weather';

export function useTodayData(pets: any[], today: string) {
  const {
    fetchChecklist, fetchFeedingLogs, fetchGroomingSummary, fetchGroomSettings,
    fetchMoodLogs, fetchGroomingLogs, fetchVaccines, fetchAppointments,
  } = usePetStore(useShallow(s => ({
    fetchChecklist: s.fetchChecklist, fetchFeedingLogs: s.fetchFeedingLogs,
    fetchGroomingSummary: s.fetchGroomingSummary, fetchGroomSettings: s.fetchGroomSettings,
    fetchMoodLogs: s.fetchMoodLogs, fetchGroomingLogs: s.fetchGroomingLogs,
    fetchVaccines: s.fetchVaccines, fetchAppointments: s.fetchAppointments,
  })));

  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [scheduledMeds, setScheduledMeds] = useState<any[]>([]);
  const [weather,       setWeather]       = useState<Weather | null>(null);
  const [weightLogs,    setWeightLogs]    = useState<any[]>([]);
  const [streak,        setStreak]        = useState(0);

  const lastLoadedAt = useRef(0);
  const loadInFlight = useRef(false);

  const load = useCallback(async (force = false) => {
    if (!pets.length) { setLoading(false); return; }
    if (!force && Date.now() - lastLoadedAt.current < 30_000) return;
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const ids = pets.map((p: any) => p.id);
      const [medsResult, , weightResult] = await Promise.all([
        supabase
          .from('medications')
          .select('id, pet_id, name, dosage, frequency, start_date, end_date, is_active')
          .in('pet_id', ids)
          .eq('is_active', true)
          .or(`start_date.is.null,start_date.lte.${today}`)
          .or(`end_date.is.null,end_date.gte.${today}`),
        Promise.all([
          ...ids.map((id: string) => fetchChecklist(id, today)),
          ...ids.map((id: string) => fetchFeedingLogs(id, today)),
          fetchGroomingSummary(ids),
          fetchGroomSettings(ids),
        ]),
        supabase.from('weight_logs').select('id, pet_id, weight_kg, logged_at').in('pet_id', ids).eq('logged_at', today),
      ]).catch(() => [{ data: [] }, null, { data: [] }]);

      const allMeds: any[] = (medsResult as any)?.data ?? [];
      const nowDate = new Date();
      setScheduledMeds(allMeds.filter((m: any) => isMedDueToday(m.frequency, m.start_date, nowDate)));
      setWeightLogs((weightResult as any)?.data ?? []);
      lastLoadedAt.current = Date.now();
      setLoading(false);

      // Streak — fire and forget
      if (pets[0]?.id) {
        Promise.resolve(supabase.from('pets').select('care_streak, last_care_date').eq('id', pets[0].id).single())
          .then(({ data }) => {
            if (!data) return;
            const lcd: string | null = data.last_care_date;
            if (!lcd) { setStreak(0); return; }
            const diff = Math.floor((new Date().getTime() - new Date(lcd).getTime()) / 86400000);
            setStreak(diff <= 1 ? (data.care_streak ?? 0) : 0);
          }).catch(() => {});
      }

      // Weather — fire and forget, never blocks UI
      getCurrentWeather().then(w => setWeather(w)).catch(() => {});

      // Non-critical secondary fetches — don't block the UI
      await Promise.all([
        ...ids.map((id: string) => fetchMoodLogs(id).catch(() => null)),
        ...ids.map((id: string) => fetchGroomingLogs(id).catch(() => null)),
        ...ids.map((id: string) => fetchVaccines(id).catch(() => null)),
        ...ids.map((id: string) => fetchAppointments(id).catch(() => null)),
      ]).catch(() => []);
    } finally {
      loadInFlight.current = false;
    }
  }, [pets, today, fetchChecklist, fetchFeedingLogs, fetchGroomingSummary, fetchGroomSettings,
    fetchMoodLogs, fetchGroomingLogs, fetchVaccines, fetchAppointments]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(true); } finally { setRefreshing(false); }
  }, [load]);

  // Defer initial load until after animations settle
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { load(); });
    return () => task.cancel();
  }, [load]);

  // Daily realtime subscriptions (feeding, checklist, grooming, appointments, vaccines)
  useEffect(() => {
    pets.forEach((p: any) => subscribeToDaily(p.id));
    return () => pets.forEach((p: any) => unsubscribeFromDaily(p.id));
  }, [pets]);

  // Keep a stable ref to load so the realtime callback doesn't cause re-subscriptions
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Medications realtime — not covered by subscribeToDaily
  useEffect(() => {
    if (!pets.length) return;
    const ids = pets.map((p: any) => p.id);
    const channels = ids.map((id: string) =>
      supabase.channel(`today-meds-${id}-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'medications', filter: `pet_id=eq.${id}` },
          () => { lastLoadedAt.current = 0; loadRef.current(true); })
        .subscribe()
    );
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [pets]); // only re-subscribe when pets change, not when load reference changes

  // AppState refresh at 60 s minimum gap
  useAppStateRefresh(() => load(true), 60_000);

  // Refresh on focus — always force so new data is visible immediately on tab switch
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  return { loading, refreshing, scheduledMeds, weather, weightLogs, streak, load, handleRefresh };
}
