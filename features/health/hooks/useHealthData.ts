/**
 * useHealthData — parallel-loads all 8 health data types with a 5-minute TTL.
 * Re-fetches on focus (debounced) and when the app returns from background.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { unstable_batchedUpdates } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  getAppointments, getAllergies, getWeightLogs, getVaccines,
  getMedications, getInsurance, type PetInsurance,
} from '@/lib/db';
import { updateWeightLog, deleteWeightLog, type WeightLog } from '@/lib/db/weight';
import { supabase } from '@/lib/supabase';
import { dbgSupabase } from '@/lib/debug';
import { useAppStateRefresh } from '@/lib/useAppStateRefresh';
import type { Appointment, Allergy, LabResult, Medication } from '@/lib/types';

interface VaxRow { id: string; name: string; next_due: string | null; last_given: string | null }

export function useHealthData(activePetId: string | null | undefined) {
  const [appts,     setAppts]     = useState<Appointment[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [labs,      setLabs]      = useState<LabResult[]>([]);
  const [meds,      setMeds]      = useState<Medication[]>([]);
  const [weights,   setWeights]   = useState<WeightLog[]>([]);
  const [vaxes,     setVaxes]     = useState<VaxRow[]>([]);
  const [insurance, setInsurance] = useState<PetInsurance[]>([]);
  const [aiSummaryMap, setAiSummaryMap] = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [loadFailed,setLoadFailed]= useState(false);

  const lastFetch   = useRef(0);
  const inFlight    = useRef(false);
  const rtDebounce  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevPetId   = useRef<string | null | undefined>(null);

  const load = useCallback(async (refresh = false) => {
    if (!activePetId) return;
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadFailed(false);
    let anyFailed = false;

    const [apptRes, allergyRes, labRes, weightRes, vaxRes, medRes, hrRes, insurRes] = await Promise.all([
      getAppointments(activePetId).catch(e => { dbgSupabase('appts', e); anyFailed = true; return [] as Appointment[]; }),
      getAllergies(activePetId).catch(e => { dbgSupabase('allergies', e); anyFailed = true; return [] as Allergy[]; }),
      supabase.from('lab_results')
        .select('id,test_name,name,result_value,result,unit,is_abnormal,tested_at,interpretation,notes')
        .eq('pet_id', activePetId)
        .order('tested_at', { ascending: false }),
      getWeightLogs(activePetId, 20).catch(e => { dbgSupabase('weights', e); anyFailed = true; return [] as WeightLog[]; }),
      getVaccines(activePetId).catch(e => { dbgSupabase('vaccines', e); anyFailed = true; return [] as VaxRow[]; }),
      getMedications(activePetId).catch(e => { dbgSupabase('meds', e); anyFailed = true; return [] as Medication[]; }),
      supabase.from('health_records')
        .select('ai_summary,created_at,extracted_data')
        .eq('pet_id', activePetId).eq('status', 'done').eq('auto_saved', true)
        .not('ai_summary', 'is', null).neq('ai_summary', ''),
      getInsurance(activePetId).catch(e => { dbgSupabase('insurance', e); return [] as PetInsurance[]; }),
    ]);

    if (labRes.error) { dbgSupabase('labs', labRes.error); anyFailed = true; }

    const sMap: Record<string, string> = {};
    for (const hr of (hrRes.data ?? [])) {
      if (!hr.ai_summary) continue;
      const dateKey = (hr.extracted_data?.visit_date ?? hr.created_at ?? '').slice(0, 10);
      if (dateKey) sMap[dateKey] = hr.ai_summary;
    }

    lastFetch.current = Date.now();
    unstable_batchedUpdates(() => {
      if (anyFailed) setLoadFailed(true);
      setAppts(apptRes as Appointment[]);
      setAllergies(allergyRes as unknown as Allergy[]);
      setLabs((labRes.data as unknown as LabResult[]) ?? []);
      setInsurance(insurRes);
      setMeds(medRes as unknown as Medication[]);
      setWeights(weightRes);
      setVaxes(vaxRes as VaxRow[]);
      setAiSummaryMap(sMap);
      setLoading(false);
      setRefreshing(false);
    });
  }, [activePetId]);

  // Initial load when activePetId first resolves (handles cold-start while tab is already focused).
  // Always reset TTL when the pet changes so the new pet's data is fetched immediately.
  useEffect(() => {
    if (!activePetId) return;
    if (activePetId !== prevPetId.current) {
      prevPetId.current = activePetId;
      lastFetch.current = 0;
    }
    if (inFlight.current) return;
    if (Date.now() - lastFetch.current < 300_000) return;
    inFlight.current = true;
    load().finally(() => { inFlight.current = false; });
  }, [activePetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus: 5-minute TTL + concurrent-fetch guard
  useFocusEffect(useCallback(() => {
    if (!activePetId || inFlight.current) return;
    if (Date.now() - lastFetch.current < 300_000) return;
    inFlight.current = true;
    load().finally(() => { inFlight.current = false; });
  }, [activePetId, load]));

  // AppState: re-fetch when returning from background
  useAppStateRefresh(() => { lastFetch.current = 0; load(); }, 300_000);

  // Realtime: any change to health tables forces a reload
  useEffect(() => {
    if (!activePetId) return;
    const tables = [
      'appointments', 'vaccines', 'medications', 'weight_logs',
      'lab_results', 'health_records', 'allergies', 'pet_insurance',
    ];
    const uid = Date.now();
    const channels = tables.map(table =>
      supabase.channel(`health-${table}-${activePetId}-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `pet_id=eq.${activePetId}` },
          () => {
          clearTimeout(rtDebounce.current);
          rtDebounce.current = setTimeout(() => { lastFetch.current = 0; load(); }, 300);
        })
        .subscribe()
    );
    return () => {
      clearTimeout(rtDebounce.current);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [activePetId, load]);

  return {
    appts, setAppts,
    allergies, setAllergies,
    labs,
    meds, setMeds,
    weights,
    vaxes,
    insurance,
    aiSummaryMap,
    loading, refreshing, loadFailed,
    load,
    lastFetch,
  };
}
