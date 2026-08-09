/**
 * useWidgetSync — keeps the iOS home screen widget in sync with live app data.
 *
 * Mount once in _layout.tsx. Writes to the App Group whenever:
 *   • The app comes to the foreground (AppState change)
 *   • Pet, streak, checklist, or appointment data changes in the store
 *   • Supabase realtime fires a change in appointments or checklist_items tables
 *
 * No-ops on Android and when the admin flag is off.
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { useShallow } from 'zustand/react/shallow';
import { usePetStore } from '@/store/petStore';
import { useFeatureFlag } from '@/lib/hooks/useAppSettings';
import { syncWidget, clearWidget, saveAvatarToGroup, type WidgetPet } from 'widget-data';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUpcomingAppointments } from '@/lib/db/appointments';
import { supabase } from '@/lib/supabase';
import { computeCareProgress } from '@/lib/careProgress';

export function useWidgetSync() {
  if (Platform.OS !== 'ios') return;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useWidgetSyncInner();
}

function useWidgetSyncInner() {
  const { pets, streaks, checklist, feedingLogs, moodLogs, loading } = usePetStore(
    useShallow(s => ({ pets: s.pets, streaks: s.streaks, checklist: s.checklist, feedingLogs: s.feedingLogs, moodLogs: s.moodLogs, loading: s.loading }))
  );
  const syncingRef = useRef(false);
  // Tracks the pet IDs the realtime subscription is currently watching
  const subscribedPetIds = useRef<string>('');

  const doSync = useCallback(async () => {
    if (syncingRef.current) return;
    // Don't act while the store is still loading — can't distinguish "no pets" from "not yet fetched"
    if (loading) return;
    syncingRef.current = true;

    try {
      console.log('[useWidgetSync] doSync called:', { petsCount: pets.length });
      if (pets.length === 0) {
        console.log('[useWidgetSync] Clearing widget: no pets');
        try {
          await clearWidget();
        } catch (e) {
          // Widget module unavailable (App Group missing, Android, simulator)
          console.error('[useWidgetSync] clearWidget failed:', e);
        }
        return;
      }

      const now = new Date();

      // Respect user's widget pet selection (Profile → Widget pets)
      const savedIds = await AsyncStorage.getItem('widget_selected_pet_ids');
      const selectedIds: string[] | null = savedIds ? JSON.parse(savedIds) : null;
      const petsToShow = selectedIds && selectedIds.length > 0
        ? pets.filter(p => selectedIds.includes(p.id)).slice(0, 3)
        : pets.slice(0, 3);

      const widgetPets: WidgetPet[] = await Promise.all(
        petsToShow.map(async (pet) => {
          const today = format(now, 'yyyy-MM-dd');
          const careProgress = computeCareProgress({ petId: pet.id, today, species: pet.species, checklist, feedingLogs, moodLogs });

          // Streak
          const streakDays = streaks[pet.id] ?? 0;

          // Next upcoming appointment — use efficient query (upcoming only, limit 5)
          let nextApptTitle: string | null = null;
          let nextApptDate:  string | null = null;
          try {
            const appts = await getUpcomingAppointments(pet.id);
            const next = appts[0]; // already sorted ascending by DB
            if (next) {
              nextApptTitle = next.title;
              try {
                const d = parseISO(next.scheduled_at.replace(' ', 'T'));
                if (isToday(d)) {
                  nextApptDate = `Today · ${format(d, 'h:mm a')}`;
                } else if (isTomorrow(d)) {
                  nextApptDate = `Tomorrow · ${format(d, 'h:mm a')}`;
                } else {
                  nextApptDate = format(d, 'MMM d');
                }
              } catch { nextApptDate = null; }
            }
          } catch (e) {
            // Per-pet appointment fetch failed — widget still shows other data
            if (__DEV__) console.warn(`[useWidgetSync] appts fetch failed for ${pet.name}:`, e);
          }

          // Download avatar to App Group so widget can load it without network
          let avatarFileName: string | null = null;
          if (pet.avatar_url) {
            try {
              avatarFileName = await saveAvatarToGroup(pet.id, pet.avatar_url);
            } catch {}
          }

          return {
            name:          pet.name,
            emoji:         pet.emoji ?? '🐾',
            accentHex:     pet.accent_color ?? '#7C5CBF',
            streakDays,
            careProgress,
            nextApptTitle,
            nextApptDate,
            avatarFileName,
          };
        })
      );

      try {
        await syncWidget({
          enabled: true,
          pets: widgetPets,
          lastSyncedAt: now.toISOString(),
        });
        console.log('[useWidgetSync] ✅ Widget synced successfully');
      } catch (e: any) {
        // Widget module unavailable (App Group missing, Android, simulator)
        console.error('[useWidgetSync] ❌ syncWidget FAILED:', {
          error: e?.message,
          code: e?.code,
          domain: e?.domain,
          errorDescription: e?.userInfo?.NSLocalizedDescription,
          fullError: JSON.stringify(e)
        });
        // Non-critical — widget sync failures must not affect app UX
      }
    } catch (e) {
      if (__DEV__) console.warn('[useWidgetSync] data fetch failed:', e);
    } finally {
      syncingRef.current = false;
    }
  }, [pets, streaks, checklist, feedingLogs, moodLogs, loading]);

  // Sync when store data changes
  useEffect(() => { doSync(); }, [doSync]);

  // Sync on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') doSync();
    });
    return () => sub.remove();
  }, [doSync]);

  // Realtime sync — subscribe to appointments + checklist_items for the user's pets.
  // Fires doSync whenever any row changes so the widget stays current.
  useEffect(() => {
    if (pets.length === 0) return;

    const petIds = pets.slice(0, 3).map(p => p.id).sort().join(',');
    // Don't re-subscribe if the pet set hasn't changed
    if (subscribedPetIds.current === petIds) return;
    subscribedPetIds.current = petIds;

    const idList = pets.slice(0, 3).map(p => `pet_id=eq.${p.id}`).join(',');

    const ch = supabase
      .channel('widget-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: idList,
      }, () => { doSync(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'checklist_items',
        filter: idList,
      }, () => { doSync(); })
      .subscribe();

    return () => { supabase.removeChannel(ch); subscribedPetIds.current = ''; };
  }, [pets, doSync]);
}
