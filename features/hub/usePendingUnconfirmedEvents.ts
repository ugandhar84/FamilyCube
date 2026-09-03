/**
 * usePendingUnconfirmedEvents — live feed of events with a named helper/
 * driver whose status is still 'pending' (or a real, non-confirmed status),
 * with NO upper date bound — only `date >= today`.
 *
 * useUpcomingOpenEvents already covers ParentView's near-term backlog need,
 * but it's deliberately capped at a 14-day window (it also feeds the
 * near-term dispatch cards, LendAHandCard/RideRequestCard, where a
 * months-out ride request showing up would be noise). A self/co-parent
 * assignment still awaiting confirmation has no such natural ceiling —
 * live-reported: a Baylor Scott & White appointment synced from Google,
 * dated 67 days out, self-assigned and still 'pending', never appeared
 * anywhere on the Hub because classifyEventUrgency (correctly) only ever
 * saw whatever useUpcomingOpenEvents' 14-day window happened to return,
 * and ParentView's fallback to the wider day-scoped `events` only ever
 * triggers when that window is COMPLETELY empty — not when it's merely
 * missing one far-future item.
 *
 * This hook is intentionally narrow (only the fields classifyEventUrgency's
 * myPending/coParentPending buckets actually need) rather than widening
 * useUpcomingOpenEvents' own window, which would change semantics for the
 * dispatch cards this app also relies on it for.
 */
import { useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fromRow, useEventStore, type FamilyEvent } from '@/store/eventStore';
import { localToday } from './hubUtils';

export function usePendingUnconfirmedEvents(familyId: string | undefined) {
  const [events, setEvents] = useState<FamilyEvent[]>([]);

  const refetch = useCallback(() => {
    if (!familyId) return;
    const today = localToday();
    // Two separate .or()-style queries collapsed into one via a Postgres
    // `or` filter — either helper or driver is set and not yet confirmed/
    // rejected. Deleted rows and past dates excluded same as every other
    // event feed in this app.
    supabase
      .from('calendar_events')
      .select('*')
      .eq('family_id', familyId)
      .gte('date', today)
      .is('deleted_at', null)
      .or('and(helper_status.not.is.null,helper_status.neq.confirmed,helper_status.neq.rejected),and(driver_status.not.is.null,driver_status.neq.confirmed,driver_status.neq.rejected)')
      .then(({ data, error }) => {
        if (error) { console.warn('[usePendingUnconfirmedEvents] fetch failed', error.message); return; }
        setEvents((data ?? []).map(fromRow));
      });
  }, [familyId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Same debounced-refetch-on-any-local-write pattern as useUpcomingOpenEvents
  // — a Confirm/Decline/Reassign tap writes through useEventStore, which this
  // hook's separate useState has no visibility into otherwise.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useEventStore.subscribe((state, prevState) => {
      if (state.events === prevState.events && state.dayEvents === prevState.dayEvents
          && state.rangeEvents === prevState.rangeEvents) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; refetch(); }, 200);
    });
    return () => { unsubscribe(); if (t) clearTimeout(t); };
  }, [refetch]);

  useEffect(() => {
    if (!familyId) return;
    const staleTopic = `realtime:hub-pending-unconfirmed:${familyId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));
    const channel = supabase
      .channel(`hub-pending-unconfirmed:${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events', filter: `family_id=eq.${familyId}` },
        () => refetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, refetch]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => { if (next === 'active') refetch(); });
    return () => sub.remove();
  }, [refetch]);

  return { events };
}
