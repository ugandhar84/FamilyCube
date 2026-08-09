/**
 * useTodayActions — all write-side handlers for TodayScreen.
 * Kept separate from useTodayData so they can be composed independently.
 */
import { useCallback, useRef } from 'react';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { uploadDailyPhoto } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/components/AppAlert';
import { usePetStore } from '@/store/petStore';
import { upsertChecklistItem } from '@/lib/db/daily';
import { invalidateJournalCache } from '@/features/care/components/journalTypes';
import { GROOM_PHOTO_TYPES } from '@/lib/groomTypes';
import { GROOM_META } from '@/features/care/components/today/todayTypes';
import type { DoneEntry } from '@/features/care/components/today/todayTypes';

interface Options {
  pets:       any[];
  userId:     string | null;
  today:      string;
  checklist:  Record<string, any[]>;
  groomingLogs: Record<string, any[]>;
  lostSet:    Set<string>;
  /** Guard callback — returns true and shows alert if pet is lost */
  guardLost:  (petId: string, name?: string) => boolean;
  /** Reload after mutations that need a full refresh */
  reload:     (force?: boolean) => Promise<void>;
  fetchChecklist:    (id: string, date: string) => Promise<void>;
  fetchFeedingLogs:  (id: string, date: string) => Promise<void>;
  fetchMoodLogs:     (id: string) => Promise<void>;
  fetchGroomingLogs: (id: string) => Promise<void>;
  fetchGroomingSummary: (ids: string[]) => Promise<void>;
  fetchVaccines:     (id: string) => Promise<void>;
  addFeedingLog:     (payload: any) => Promise<void>;
  addGroomingLog:    (payload: any) => Promise<void>;
  toggleChecklistItem: (id: string, done: boolean, userId: string) => Promise<void>;
  setLogSheet: (s: any) => void;
}

export function useTodayActions({
  pets, userId, today, checklist, groomingLogs, guardLost,
  reload, fetchChecklist, fetchFeedingLogs, fetchMoodLogs, fetchGroomingLogs,
  fetchGroomingSummary, fetchVaccines, addFeedingLog, addGroomingLog,
  toggleChecklistItem, setLogSheet,
}: Options) {
  const pendingActions = useRef(new Set<string>());

  const quickWater = useCallback((petId: string) => {
    const pet = pets.find((p: any) => p.id === petId);
    if (guardLost(petId, pet?.name)) return;
    const key = `water-${petId}-${today}`;
    if (!userId || pendingActions.current.has(key)) return;
    pendingActions.current.add(key);
    addFeedingLog({
      pet_id: petId, fed_by: userId, meal_type: 'water',
      food_type: null, amount_grams: null, date: today, fed_at: new Date().toISOString(),
    })
      .then(() => invalidateJournalCache(petId))
      .catch(() => {})
      .finally(() => pendingActions.current.delete(key));
  }, [pets, userId, today, guardLost, addFeedingLog]);

  const markDone = useCallback((itemId: string) => {
    if (!userId) return;
    const pet = pets.find((p: any) => (checklist[p.id] ?? []).some((i: any) => i.id === itemId));
    if (pet && guardLost(pet.id, pet.name)) return;
    toggleChecklistItem(itemId, true, userId)
      .then(() => { if (pet) invalidateJournalCache(pet.id); })
      .catch(() => {});
  }, [pets, userId, checklist, guardLost, toggleChecklistItem]);

  const logScheduledMed = useCallback(async (petId: string, medName: string, notes?: string) => {
    if (!userId) return;
    const pet = pets.find((p: any) => p.id === petId);
    if (guardLost(petId, pet?.name)) return;
    await upsertChecklistItem({
      pet_id: petId, date: today, type: 'medicine', label: medName,
      completed: true, completed_by: userId, completed_at: new Date().toISOString(),
      notes: notes ?? null,
    }).catch(() => {});
    invalidateJournalCache(petId);
    await fetchChecklist(petId, today).catch(() => {});
  }, [pets, userId, today, guardLost, fetchChecklist]);

  const logGroom = useCallback((petId: string, type: string) => {
    const pet = pets.find((p: any) => p.id === petId);
    if (guardLost(petId, pet?.name)) return;
    const key = `groom-${petId}-${type}-${today}`;
    if (!userId || pendingActions.current.has(key)) return;
    const alreadyToday = (groomingLogs[petId] ?? [])
      .some((g: any) => g.type === type && g.done_at.substring(0, 10) === today);
    if (alreadyToday) return;
    pendingActions.current.add(key);
    const now = new Date();
    addGroomingLog({
      pet_id: petId, type,
      done_at: format(now, 'yyyy-MM-dd'), done_at_time: now.toISOString(),
      done_by: userId ?? undefined, notes: null,
    })
      .then(() => invalidateJournalCache(petId))
      .catch(() => {})
      .finally(() => pendingActions.current.delete(key));
  }, [pets, userId, today, groomingLogs, guardLost, addGroomingLog]);

  const handleGroomLog = useCallback((petId: string, type: string) => {
    if (!GROOM_PHOTO_TYPES.has(type)) { logGroom(petId, type); return; }
    showAlert(`Log ${(GROOM_META as any)[type]?.label ?? type}`, 'Add a photo proof?', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { logGroom(petId, type); return; }
          const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85 });
          logGroom(petId, type);
          if (!r.canceled && r.assets[0] && userId)
            uploadDailyPhoto(petId, 'groom', r.assets[0].uri).catch(() => {});
        },
      },
      {
        text: 'Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { logGroom(petId, type); return; }
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: true, quality: 0.85 });
          logGroom(petId, type);
          if (!r.canceled && r.assets[0] && userId)
            uploadDailyPhoto(petId, 'groom', r.assets[0].uri).catch(() => {});
        },
      },
      { text: 'Skip photo', onPress: () => logGroom(petId, type) },
    ]);
  }, [logGroom, userId]);

  const handleUndo = useCallback(async (entry: DoneEntry) => {
    if (entry.source === 'feeding') {
      const key = `${entry.pet.id}:${today}`;
      const snapshot = usePetStore.getState().feedingLogs[key] ?? [];
      usePetStore.setState(s => ({
        feedingLogs: { ...s.feedingLogs, [key]: snapshot.filter((f: any) => f.id !== entry.rawId) },
      }));
      const { error } = await supabase.from('feeding_logs').delete().eq('id', entry.rawId);
      if (error) { usePetStore.setState(s => ({ feedingLogs: { ...s.feedingLogs, [key]: snapshot } })); return; }
      fetchFeedingLogs(entry.pet.id, today).catch(() => {});
    } else if (entry.source === 'mood') {
      const snapshot = usePetStore.getState().moodLogs[entry.pet.id] ?? [];
      usePetStore.setState(s => ({
        moodLogs: { ...s.moodLogs, [entry.pet.id]: snapshot.filter((m: any) => m.id !== entry.rawId) },
      }));
      const { error } = await supabase.from('mood_logs').delete().eq('id', entry.rawId);
      if (error) { usePetStore.setState(s => ({ moodLogs: { ...s.moodLogs, [entry.pet.id]: snapshot } })); return; }
      fetchMoodLogs(entry.pet.id).catch(() => {});
    } else if (entry.source === 'grooming') {
      const snapshot = usePetStore.getState().groomingLogs[entry.pet.id] ?? [];
      usePetStore.setState(s => ({
        groomingLogs: { ...s.groomingLogs, [entry.pet.id]: snapshot.filter((g: any) => g.id !== entry.rawId) },
      }));
      const { error } = await supabase.from('grooming_logs').delete().eq('id', entry.rawId);
      if (error) { usePetStore.setState(s => ({ groomingLogs: { ...s.groomingLogs, [entry.pet.id]: snapshot } })); return; }
      fetchGroomingLogs(entry.pet.id).catch(() => {});
      fetchGroomingSummary([entry.pet.id]).catch(() => {});
    } else if (entry.source === 'checklist') {
      if (!userId) return;
      await toggleChecklistItem(entry.rawId, false, userId).catch(() => {});
    }
    invalidateJournalCache(entry.pet.id);
  }, [today, userId, fetchFeedingLogs, fetchMoodLogs, fetchGroomingLogs, fetchGroomingSummary, toggleChecklistItem]);

  const logWalk = useCallback(async (petId: string) => {
    if (!userId) return;
    const pet = pets.find((p: any) => p.id === petId);
    if (guardLost(petId, pet?.name)) return;
    await upsertChecklistItem({
      pet_id: petId, date: today, type: 'walk', label: 'Walk',
      completed: true, completed_by: userId, completed_at: new Date().toISOString(),
    }).catch(() => {});
    invalidateJournalCache(petId);
    await fetchChecklist(petId, today).catch(() => {});
  }, [pets, userId, today, guardLost, fetchChecklist]);

  const logBathroom = useCallback(async (petId: string, type: string) => {
    if (!userId) return;
    const pet = pets.find((p: any) => p.id === petId);
    if (guardLost(petId, pet?.name)) return;
    await upsertChecklistItem({
      pet_id: petId, date: today, type: 'bathroom', label: type,
      completed: true, completed_by: userId, completed_at: new Date().toISOString(),
      notes: type,
    }).catch(() => {});
    invalidateJournalCache(petId);
    await fetchChecklist(petId, today).catch(() => {});
    if (type === 'blood') {
      showAlert('⚠️ Vet Alert', 'Blood in stool detected — please contact your vet today.');
    }
  }, [pets, userId, today, guardLost, fetchChecklist]);

  return { quickWater, markDone, logScheduledMed, logGroom, handleGroomLog, handleUndo, logWalk, logBathroom };
}
