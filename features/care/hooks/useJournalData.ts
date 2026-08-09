/**
 * useJournalData — fetches journal entries with in-memory cache + pagination.
 * Handles realtime deletion events from the Today tab so the list stays
 * in sync without a full reload.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  type JournalEntry,
  getCached, setCache, invalidateJournalCache, fetchEntries,
} from '@/features/care/components/journalTypes';

interface Options {
  petId:   string | undefined | null;
  userId:  string | undefined | null;
  ownerId: string | undefined | null;
  petName: string | undefined;
  petEmoji: string | undefined;
}

export function useJournalData({ petId, userId, ownerId, petName, petEmoji }: Options) {
  const [entries,     setEntries]     = useState<JournalEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor,      setCursor]      = useState<string | null>(null);
  const [hasMore,     setHasMore]     = useState(false);

  const loadingRef  = useRef(false);
  const rtDebounce  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async (spinner = true, force = false) => {
    if (!petId || !userId) return;
    if (!force) {
      const cached = getCached(petId);
      if (cached) {
        const sorted = [...cached.entries].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        setEntries(sorted);
        setCursor(cached.cursor);
        setHasMore(cached.hasMore);
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }
    if (loadingRef.current && !force) return;
    loadingRef.current = true;
    if (spinner) setLoading(true);
    try {
      const result = await fetchEntries(petId, userId, ownerId ?? userId, petName ?? '', petEmoji ?? '');
      const sorted = result.entries.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setCache(petId, sorted, result.nextCursor, result.hasMore);
      setEntries(sorted);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch { /* keep stale data visible */ } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [petId, userId, ownerId, petName, petEmoji]);

  const loadMore = useCallback(async () => {
    if (!petId || !userId || !hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchEntries(petId, userId, ownerId ?? userId, petName ?? '', petEmoji ?? '', cursor);
      setEntries(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const fresh = result.entries.filter(e => !existingIds.has(e.id));
        const merged = [...prev, ...fresh].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        setCache(petId, merged, result.nextCursor, result.hasMore);
        return merged;
      });
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch { /* keep existing */ } finally {
      setLoadingMore(false);
    }
  }, [petId, userId, ownerId, petName, petEmoji, cursor, hasMore, loadingMore]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Invalidate cache when pet changes
  useEffect(() => {
    return () => { if (petId) invalidateJournalCache(petId); };
  }, [petId]);

  // Focus: respect cache TTL — only bypass when returning from another screen
  const navigatedAway = useRef(false);
  useFocusEffect(useCallback(() => {
    if (navigatedAway.current) { navigatedAway.current = false; load(false, false); }
    return () => { navigatedAway.current = true; };
  }, [load]));

  // Realtime: sync inserts and deletions from Today tab
  useEffect(() => {
    if (!petId) return;
    const uid = Date.now();
    const tables = [
      { table: 'feeding_logs',   type: 'meal'      },
      { table: 'mood_logs',      type: 'mood'      },
      { table: 'grooming_logs',  type: 'grooming'  },
      { table: 'daily_checklist',type: 'checklist' },
      { table: 'walk_logs',      type: 'checklist' },
      { table: 'pet_notes',      type: 'note'      },
      { table: 'vet_visits',     type: 'vet'       },
    ] as const;
    const channels = tables.map(({ table, type }) =>
      supabase.channel(`journal-${table}-${petId}-${uid}`)
        .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table, filter: `pet_id=eq.${petId}` },
          (p) => setEntries(prev => prev.filter(e => !(e.type === type && e.rawId === (p.old as any).id))),
        )
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table, filter: `pet_id=eq.${petId}` },
          () => {
            clearTimeout(rtDebounce.current);
            rtDebounce.current = setTimeout(() => { invalidateJournalCache(petId); load(false, true); }, 300);
          },
        ).subscribe(),
    );
    return () => {
      clearTimeout(rtDebounce.current);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [petId, load]);

  return {
    entries, setEntries,
    loading, refreshing, setRefreshing,
    loadingMore, cursor, hasMore,
    load, loadMore,
  };
}
