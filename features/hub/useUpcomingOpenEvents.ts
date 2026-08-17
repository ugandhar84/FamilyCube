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
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fromRow, type FamilyEvent } from '@/store/eventStore';
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

  useEffect(() => {
    if (!familyId) return;
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [familyId]);

  return { events, loaded, refetch };
}
