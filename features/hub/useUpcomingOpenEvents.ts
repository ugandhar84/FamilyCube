/**
 * useUpcomingOpenEvents — live, multi-day feed of "open to helpers" events
 * (isOpenToGrandparents / isOpenToTeens) for the Hub's dispatch cards
 * (LendAHandCard / RideRequestCard consumers).
 *
 * Deliberately independent of eventStore's `events`/`dayEvents` — those are
 * a single-day cache tied to whatever date the Calendar tab last selected
 * (defaulting to "today" on boot), so a ride scheduled for tomorrow never
 * appeared in the Hub's open-rides list at all, and the realtime handler
 * only patches `events` when the changed row's date matches that one
 * cached day — a claim on any other date silently never disappeared for
 * other viewers (e.g. one grandparent claiming a ride wouldn't remove it
 * from another grandparent's screen unless they reloaded). This hook
 * fetches a real window of upcoming days directly and keeps it live via
 * its own realtime subscription, scoped to family_id, independent of
 * whatever the Calendar tab is doing.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fromRow, useEventStore, type FamilyEvent } from '@/store/eventStore';
import { localToday } from './hubUtils';

const WINDOW_DAYS = 14;

export function useUpcomingOpenEvents(familyId: string | undefined) {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(() => {
    if (!familyId) return;
    const from = localToday();
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + WINDOW_DAYS);
    const to = toDate.toISOString().slice(0, 10);

    supabase
      .from('calendar_events')
      .select('*')
      .eq('family_id', familyId)
      .gte('date', from)
      .lte('date', to)
      .is('deleted_at', null)
      .then(({ data, error }) => {
        if (error) { console.warn('[useUpcomingOpenEvents] fetch failed', error.message); return; }
        setEvents((data ?? []).map(fromRow));
        setLoaded(true);
      });
  }, [familyId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Confirm/Can't/Reassign/Take Over etc. all write through useEventStore's
  // updateEvent — a same-session, same-device change — which updates ONLY
  // the Zustand store's own events/dayEvents/rangeEvents. This hook's state
  // is a separate useState with no knowledge of that store at all, so
  // without this it could only ever learn about the change via its own
  // realtime subscription round-tripping back from Postgres — confirmed
  // live: tapping Confirm updated the DB correctly, but the Household
  // Backlog card (reading from this hook) still showed "Pending" on a
  // fresh load minutes later. Subscribing directly to the store and
  // refetching on any change closes that gap for every current and future
  // write path, without threading a refetch callback through every RPC
  // call site that touches an event (reassign_event, confirm_event_
  // assignment, decline_event_assignment, plain updateEvent calls, etc.)
  // — one connection point here instead of N callback wires elsewhere.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = useEventStore.subscribe((state, prevState) => {
      if (state.events === prevState.events && state.dayEvents === prevState.dayEvents
          && state.rangeEvents === prevState.rangeEvents) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { debounceRef.current = null; refetch(); }, 200);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refetch]);

  useEffect(() => {
    if (!familyId) return;
    // Same hot-reload defensive sweep as familyStore.ts's/choreStore.ts's
    // ensureRealtime — a dev-mode Fast Refresh (or this hook mounting
    // twice in quick succession) resets this effect's own closure but the
    // Supabase client socket can still hold a channel under this exact
    // topic name, which then throws "cannot add postgres_changes callbacks
    // ... after subscribe()" the next time .channel(...).on(...) runs
    // against the same topic (live-reported crash, this exact hook).
    const staleTopic = `realtime:hub-open-events:${familyId}`;
    supabase.getChannels().filter(c => c.topic === staleTopic).forEach(c => supabase.removeChannel(c));

    const channel = supabase
      .channel(`hub-open-events:${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          const isDeleted = !!newRow?.deleted_at;
          const id = newRow?.id ?? oldRow?.id;
          if (!id) return;

          setEvents(prev => {
            if (payload.eventType === 'DELETE' || isDeleted) {
              return prev.filter(e => e.id !== id);
            }
            const ev = fromRow(newRow);
            // Row now falls outside the window we care about (e.g. date
            // pushed past WINDOW_DAYS) — drop it rather than show stale data.
            const today = localToday();
            const windowEnd = new Date();
            windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);
            const withinWindow = ev.date >= today && ev.date <= windowEnd.toISOString().slice(0, 10);
            if (!withinWindow) return prev.filter(e => e.id !== id);

            const exists = prev.some(e => e.id === id);
            return exists ? prev.map(e => e.id === id ? ev : e) : [...prev, ev];
          });
        },
      )
      .subscribe((status) => {
        // Same class of gap confirmed via QA audit as eventStore.ts's/
        // choreStore.ts's own channels: this one had NO status handling at
        // all (not even a log line) and no foreground-triggered refetch —
        // this hook can stay mounted for the entire time the app is
        // backgrounded (it powers an always-visible Hub card), so a
        // silently-dead socket here had no recovery path whatsoever short
        // of the component unmounting. A real force-refetch on every
        // foreground transition below is the actual fix; this log is only
        // so a dead socket is at least visible in diagnostics.
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[useUpcomingOpenEvents] realtime hub-open-events:${familyId} unhealthy (${status})`);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [familyId]);

  // Force a real re-fetch on every foreground transition — independent of
  // whatever state the realtime socket is actually in, matching the same
  // AppState-driven recovery pattern added to app/_layout.tsx for
  // choreStore/eventStore. This hook has no access to that shared handler
  // (it's component-scoped, mounted per-Hub-render, not a module-level
  // store), so it needs its own listener rather than relying on the
  // global one to happen to also cover it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  return { events, loaded, refetch };
}
