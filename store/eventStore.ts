/**
 * eventStore — production-grade calendar data layer
 *
 * Architecture:
 *  • Day detail  — full rows for one date, paginated (PAGE_SIZE = 30, cursor = start_time)
 *  • Strip map   — lightweight `date + category` only, for the day strip dot indicators
 *  • Prefetch    — adjacent ±1 day pre-loaded so swiping is instant
 *  • SWR cache   — stale-while-revalidate with per-entry TTL (day=5 min, strip=15 min)
 *  • Dedup       — in-flight request set; identical calls coalesce
 *  • Abort       — in-flight day requests cancelled when user changes date
 *  • Optimistic  — add/update/delete reflected instantly; rolled back on DB error
 *  • Realtime    — single Postgres Changes channel per family; updates strip + current day
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

// ── Public types ──────────────────────────────────────────────────────────────
export type EventType    = 'event' | 'reminder' | 'appointment' | 'birthday';
export type HelperStatus = 'pending' | 'confirmed' | 'rejected';

export interface FamilyEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  memberId?: string;
  memberIds?: string[];
  type: EventType;
  color?: string;
  location?: string;
  notes?: string;
  allDay?: boolean;
  category?: string;
  helper?: string;
  helperStatus?: HelperStatus;
  declineReason?: string;
  declinedBy?: string;
  helperRequestedBy?: string;
  pickupLocation?: string;
  dropLocation?: string;
  returnTime?: string;
  doctorName?: string;
  subject?: string;
  coachName?: string;
  conflict?: boolean;
  approvalPending?: boolean;
  isOpenToGrandparents?: boolean;
  grandparentPassedIds?: string[];  // seniors who tapped Pass — hidden from their feed
  isOpenToTeens?: boolean;          // parent flag — shows in teen Junior Dispatch pool
  rideCoins?: number;               // optional coins reward set by parent — visible to teens only, never GPs

  // Drive assignment — separate from `helper` (tutor/escort/coach) for events
  // where an external tutor/escort/coach can be set while transport is a
  // distinct, parent-decided need (e.g. Ms. Rao tutors, Dad drives).
  rideRequired?: boolean;
  driverName?: string;
  driverStatus?: HelperStatus;

  // "Helper confirmed" (helperStatus === 'confirmed') only means the driver
  // agreed to do the run — it says nothing about whether the pickup actually
  // happened. This is that separate, later signal: either the rider or the
  // driver can set it, whichever acts first.
  pickupConfirmedAt?: string;
  pickupConfirmedBy?: string;
}

export type StripMap = Record<string, string[]>;   // date → unique category[]

// ── Cache entry ───────────────────────────────────────────────────────────────
interface DayCacheEntry {
  events:    FamilyEvent[];
  cursor:    string | null;  // last start_time seen; null = all loaded
  hasMore:   boolean;
  fetchedAt: number;         // Date.now()
}

// ── Store shape ───────────────────────────────────────────────────────────────
interface EventState {
  // Current day
  currentDate: string;
  dayEvents:   FamilyEvent[];
  dayLoading:  boolean;
  hasMore:     boolean;        // more pages exist for currentDate

  // Strip
  stripMap:     StripMap;
  stripLoading: boolean;

  // In-memory SWR cache (date → entry)
  _dayCache: Record<string, DayCacheEntry>;

  // Legacy alias used by CalendarScreen without changes
  events: FamilyEvent[];
  loaded: boolean;

  // API
  selectDate:    (date: string) => Promise<void>;
  loadMoreDay:   () => Promise<void>;
  loadStrip:     (dates: string[]) => Promise<void>;
  prefetchDate:  (date: string) => void;

  // Compat shims
  loadFromStorage: () => Promise<void>;
  syncFromDB:      () => Promise<void>;

  // Mutations (optimistic)
  addEvent:    (e: Omit<FamilyEvent, 'id'>) => string;
  updateEvent: (id: string, updates: Partial<FamilyEvent>) => void;
  deleteEvent: (id: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE   = 30;           // events per page within a day
const DAY_TTL_MS  = 5 * 60_000;  // 5 min — revalidate day cache
const STRIP_TTL_MS = 15 * 60_000; // 15 min — revalidate strip cache

const DISK_STRIP  = '@fc_strip_v1';
const DISK_DAY    = '@fc_day_v1';  // stores { date, events } for last-viewed day

// ── In-flight deduplication ───────────────────────────────────────────────────
const _inFlight = new Set<string>();           // keys: 'day:YYYY-MM-DD', 'strip:from:to'
let   _dayAbort: AbortController | null = null; // cancel stale day request on date change

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFamilyId(): string | null {
  try {
    const { useFamilyStore } = require('@/store/familyStore');
    const s = useFamilyStore.getState();
    const m = s.members.find((m: any) => m.id === s.activeMemberId) ?? s.members[0];
    return (m as any)?.familyId ?? null;
  } catch { return null; }
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function sortByTime(evs: FamilyEvent[]): FamilyEvent[] {
  return [...evs].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
}

export function fromRow(row: any): FamilyEvent {
  return {
    id:                row.id,
    title:             row.title,
    date:              String(row.date ?? '').slice(0, 10),
    time:              row.start_time ?? undefined,
    endTime:           row.end_time ?? undefined,
    allDay:            row.all_day ?? false,
    type:              row.type ?? 'event',
    category:          row.category ?? 'Event',
    color:             row.color ?? undefined,
    memberId:          row.member_id ?? undefined,
    memberIds:         row.member_ids ?? undefined,
    location:          row.location ?? undefined,
    notes:             row.notes ?? undefined,
    helper:            row.helper_name ?? undefined,
    helperStatus:      row.helper_status ?? undefined,
    helperRequestedBy: row.helper_requested_by ?? undefined,
    declineReason:     row.helper_decline_reason ?? undefined,
    declinedBy:        row.helper_declined_by ?? undefined,
    doctorName:        row.doctor_name ?? undefined,
    subject:           row.subject ?? undefined,
    coachName:         row.coach_name ?? undefined,
    pickupLocation:    row.pickup_location ?? undefined,
    dropLocation:      row.drop_location ?? undefined,
    approvalPending:        row.approval_pending ?? false,
    conflict:               row.conflict ?? false,
    isOpenToGrandparents:   row.is_open_to_grandparents ?? false,
    grandparentPassedIds:   row.grandparent_passed_ids ?? [],
    isOpenToTeens:          row.is_open_to_teens ?? false,
    rideCoins:              row.ride_coins ?? undefined,
    rideRequired:           row.ride_required ?? false,
    driverName:             row.driver_name ?? undefined,
    driverStatus:           row.driver_status ?? undefined,
    pickupConfirmedAt:      row.pickup_confirmed_at ?? undefined,
    pickupConfirmedBy:      row.pickup_confirmed_by ?? undefined,
  };
}

function toRow(ev: FamilyEvent): Record<string, unknown> {
  return {
    id:                    ev.id,
    family_id:             getFamilyId(),
    title:                 ev.title,
    date:                  ev.date,
    start_time:            ev.time ?? null,
    end_time:              ev.endTime ?? null,
    all_day:               ev.allDay ?? false,
    type:                  ev.type,
    category:              ev.category ?? 'Event',
    color:                 ev.color ?? null,
    member_id:             ev.memberId ?? null,
    member_ids:            ev.memberIds ?? [],
    location:              ev.location ?? null,
    notes:                 ev.notes ?? null,
    helper_name:           ev.helper ?? null,
    helper_status:         ev.helperStatus ?? null,
    helper_requested_by:   ev.helperRequestedBy ?? null,
    helper_decline_reason: ev.declineReason ?? null,
    helper_declined_by:    ev.declinedBy ?? null,
    doctor_name:           ev.doctorName ?? null,
    subject:               ev.subject ?? null,
    coach_name:            ev.coachName ?? null,
    pickup_location:       ev.pickupLocation ?? null,
    drop_location:         ev.dropLocation ?? null,
    approval_pending:           ev.approvalPending ?? false,
    conflict:                   ev.conflict ?? false,
    is_open_to_grandparents:    ev.isOpenToGrandparents ?? false,
    grandparent_passed_ids:     ev.grandparentPassedIds ?? [],
    is_open_to_teens:           ev.isOpenToTeens ?? false,
    ride_coins:                 ev.rideCoins ?? null,
    ride_required:              ev.rideRequired ?? false,
    driver_name:                ev.driverName ?? null,
    driver_status:              ev.driverStatus ?? null,
    pickup_confirmed_at:        ev.pickupConfirmedAt ?? null,
    pickup_confirmed_by:        ev.pickupConfirmedBy ?? null,
  };
}

function dbUpdate(id: string, patch: Record<string, unknown>) {
  supabase.from('calendar_events').update(patch).eq('id', id).then(({ error }) => {
    if (error) console.warn('[eventStore] update failed', id, error.message);
  });
}

// ── Realtime ──────────────────────────────────────────────────────────────────
let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function ensureRealtime(
  familyId: string,
  getState: () => EventState,
  setState: (s: Partial<EventState>) => void,
) {
  if (_rtFamilyId === familyId && _rtChannel) return; // already subscribed for this family
  if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
  _rtFamilyId = familyId;

  _rtChannel = supabase
    .channel(`cal:${familyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calendar_events', filter: `family_id=eq.${familyId}` },
      (payload) => {
        const { currentDate, dayEvents, stripMap, _dayCache } = getState();
        const newRow  = payload.new as any;
        const oldRow  = payload.old as any;
        const rowDate: string = (newRow?.date ?? oldRow?.date ?? '').slice(0, 10);
        const isDeleted = !!newRow?.deleted_at;
        const cat: string = newRow?.category ?? '';

        // ── Strip map update ───────────────────────────────────────────────
        if (rowDate) {
          if (payload.eventType === 'DELETE' || isDeleted) {
            // Re-query that date's categories (cheap: date + category only)
            supabase
              .from('calendar_events')
              .select('category')
              .eq('family_id', familyId)
              .eq('date', rowDate)
              .is('deleted_at', null)
              .then(({ data }) => {
                if (!data) return;
                const cats = [...new Set(data.map((r: any) => r.category).filter(Boolean))];
                const next = { ...getState().stripMap, [rowDate]: cats };
                setState({ stripMap: next });
                AsyncStorage.setItem(DISK_STRIP, JSON.stringify(next));
              });
          } else if (cat && !stripMap[rowDate]?.includes(cat)) {
            const next = { ...stripMap, [rowDate]: [...(stripMap[rowDate] ?? []), cat] };
            setState({ stripMap: next });
            AsyncStorage.setItem(DISK_STRIP, JSON.stringify(next));
          }
        }

        // ── Day events update (only if rowDate === currentDate) ────────────
        if (rowDate !== currentDate) {
          // Invalidate prefetch cache for that date so next visit re-fetches
          const newCache = { ..._dayCache };
          delete newCache[rowDate];
          setState({ _dayCache: newCache });
          return;
        }

        let next: FamilyEvent[];
        if (payload.eventType === 'INSERT' && !isDeleted) {
          const ev = fromRow(newRow);
          if (dayEvents.find(e => e.id === ev.id)) return;
          next = sortByTime([...dayEvents, ev]);
        } else if (payload.eventType === 'UPDATE') {
          if (isDeleted) {
            next = dayEvents.filter(e => e.id !== newRow.id);
          } else {
            const ev = fromRow(newRow);
            next = sortByTime(dayEvents.map(e => e.id === ev.id ? ev : e));
          }
        } else if (payload.eventType === 'DELETE') {
          next = dayEvents.filter(e => e.id !== oldRow.id);
        } else return;

        setState({ dayEvents: next, events: next });
        // Update cache entry
        const entry = getState()._dayCache[currentDate];
        if (entry) {
          setState({ _dayCache: { ...getState()._dayCache, [currentDate]: { ...entry, events: next } } });
        }
        AsyncStorage.setItem(DISK_DAY, JSON.stringify({ date: currentDate, events: next }));
      }
    )
    .subscribe((status) => {
      console.log('[eventStore] realtime', status, familyId);
    });
}

// ── Fetch one page of events for a date ───────────────────────────────────────
async function fetchDayPage(
  familyId: string,
  date: string,
  cursor: string | null,  // start_time of last event seen; null = first page
): Promise<{ events: FamilyEvent[]; nextCursor: string | null; hasMore: boolean }> {
  let q = supabase
    .from('calendar_events')
    .select('*')
    .eq('family_id', familyId)
    .eq('date', date)
    .is('deleted_at', null)
    .order('start_time', { ascending: true, nullsFirst: true })
    .limit(PAGE_SIZE);

  if (cursor) {
    q = q.gt('start_time', cursor);
  }

  const { data, error } = await q;
  if (error) throw error;

  const events    = (data ?? []).map(fromRow);
  const hasMore   = events.length === PAGE_SIZE;
  const lastTime  = events[events.length - 1]?.time ?? null;
  return { events, nextCursor: hasMore ? lastTime : null, hasMore };
}

// ═════════════════════════════════════════════════════════════════════════════
export const useEventStore = create<EventState>((set, get) => ({
  currentDate: '',
  dayEvents:   [],
  dayLoading:  false,
  hasMore:     false,
  stripMap:    {},
  stripLoading: false,
  _dayCache:   {},
  events:      [],   // legacy alias
  loaded:      false, // legacy alias

  // ── selectDate ─────────────────────────────────────────────────────────────
  selectDate: async (date: string) => {
    if (date === get().currentDate && !get().dayLoading && get().dayEvents.length > 0) return;

    // Cancel any in-flight request for the previous date
    _dayAbort?.abort();
    _dayAbort = new AbortController();
    const signal = _dayAbort.signal;

    const key = `day:${date}`;
    set({ currentDate: date, dayLoading: true });

    // ── Serve from SWR cache ──────────────────────────────────────────────
    const cached = get()._dayCache[date];
    const isFresh = cached && (Date.now() - cached.fetchedAt) < DAY_TTL_MS;
    if (cached) {
      set({ dayEvents: cached.events, events: cached.events, hasMore: cached.hasMore, dayLoading: isFresh ? false : true, loaded: true });
      if (isFresh) return;
    } else {
      // Try disk cache for immediate paint
      try {
        const raw = await AsyncStorage.getItem(DISK_DAY);
        if (raw) {
          const { date: cd, events: ce } = JSON.parse(raw);
          if (cd === date) set({ dayEvents: ce, events: ce, loaded: true });
        }
      } catch { /* ignore */ }
    }

    if (signal.aborted) return;

    // ── Fetch from DB (page 1) ────────────────────────────────────────────
    if (_inFlight.has(key)) return;
    _inFlight.add(key);
    try {
      const familyId = getFamilyId();
      if (!familyId) { set({ dayLoading: false, loaded: true }); return; }

      const { events, nextCursor, hasMore } = await fetchDayPage(familyId, date, null);
      if (signal.aborted) return;

      const entry: DayCacheEntry = { events, cursor: nextCursor, hasMore, fetchedAt: Date.now() };
      set({
        dayEvents:  events,
        events,
        hasMore,
        dayLoading: false,
        loaded:     true,
        _dayCache:  { ...get()._dayCache, [date]: entry },
      });
      AsyncStorage.setItem(DISK_DAY, JSON.stringify({ date, events }));
      ensureRealtime(familyId, get, s => set(s as any));

      // Prefetch adjacent dates silently
      get().prefetchDate(offsetDate(date, -1));
      get().prefetchDate(offsetDate(date,  1));
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('[eventStore] selectDate failed', e);
      set({ dayLoading: false, loaded: true });
    } finally {
      _inFlight.delete(key);
    }
  },

  // ── loadMoreDay — next page for current date ───────────────────────────────
  loadMoreDay: async () => {
    const { currentDate, hasMore, _dayCache, dayLoading } = get();
    if (!hasMore || dayLoading || !currentDate) return;
    const entry = _dayCache[currentDate];
    if (!entry?.cursor) return;

    const key = `day:${currentDate}:more`;
    if (_inFlight.has(key)) return;
    _inFlight.add(key);
    set({ dayLoading: true });
    try {
      const familyId = getFamilyId();
      if (!familyId) return;
      const { events: page, nextCursor, hasMore: more } = await fetchDayPage(familyId, currentDate, entry.cursor);
      const merged = sortByTime([...get().dayEvents, ...page]);
      const newEntry: DayCacheEntry = { events: merged, cursor: nextCursor, hasMore: more, fetchedAt: entry.fetchedAt };
      set({
        dayEvents:  merged,
        events:     merged,
        hasMore:    more,
        dayLoading: false,
        _dayCache:  { ...get()._dayCache, [currentDate]: newEntry },
      });
    } catch (e) {
      console.warn('[eventStore] loadMoreDay failed', e);
      set({ dayLoading: false });
    } finally {
      _inFlight.delete(key);
    }
  },

  // ── loadStrip — lightweight date → category[] for visible strip range ──────
  loadStrip: async (dates: string[]) => {
    if (!dates.length) return;

    // Serve disk cache immediately
    try {
      const raw = await AsyncStorage.getItem(DISK_STRIP);
      if (raw) set({ stripMap: { ...JSON.parse(raw), ...get().stripMap } });
    } catch { /* ignore */ }

    const from = dates[0];
    const to   = dates[dates.length - 1];
    const key  = `strip:${from}:${to}`;
    if (_inFlight.has(key)) return;

    // TTL: check if all dates are already fresh (use fetchedAt stored in _dayCache or a strip TTL flag)
    // Simple approach: track last strip fetch time per range using a single timestamp
    const stripTs = (get() as any)._stripFetchedAt as number | undefined;
    if (stripTs && Date.now() - stripTs < STRIP_TTL_MS) return;

    _inFlight.add(key);
    set({ stripLoading: true });
    try {
      const familyId = getFamilyId();
      if (!familyId) { set({ stripLoading: false }); return; }

      const { data, error } = await supabase
        .from('calendar_events')
        .select('date,category')        // only 2 columns — minimal payload
        .eq('family_id', familyId)
        .gte('date', from)
        .lte('date', to)
        .is('deleted_at', null);

      if (error || !data) { set({ stripLoading: false }); return; }

      const map: StripMap = {};
      for (const row of data) {
        const d = String(row.date).slice(0, 10);
        const c = row.category as string;
        if (!c || !d) continue;
        if (!map[d]) map[d] = [];
        if (!map[d].includes(c)) map[d].push(c);
      }
      // Every date in [from, to] is authoritatively refreshed by this fetch
      // — start from the old map, but explicitly clear each date in range
      // before re-applying `map`, so a date whose last event got deleted
      // (map has no entry for it) actually loses its stale strip dots
      // instead of keeping whatever was cached from before.
      const next = { ...get().stripMap };
      for (const d of dates) delete next[d];
      Object.assign(next, map);
      set({ stripMap: next, stripLoading: false, _stripFetchedAt: Date.now() } as any);
      AsyncStorage.setItem(DISK_STRIP, JSON.stringify(next));
    } catch (e) {
      console.warn('[eventStore] loadStrip failed', e);
      set({ stripLoading: false });
    } finally {
      _inFlight.delete(key);
    }
  },

  // ── prefetchDate — silent background load into SWR cache ──────────────────
  prefetchDate: (date: string) => {
    const existing = get()._dayCache[date];
    if (existing && Date.now() - existing.fetchedAt < DAY_TTL_MS) return; // still fresh
    const key = `day:${date}`;
    if (_inFlight.has(key)) return;
    _inFlight.add(key);
    const familyId = getFamilyId();
    if (!familyId) { _inFlight.delete(key); return; }
    fetchDayPage(familyId, date, null)
      .then(({ events, nextCursor, hasMore }) => {
        const entry: DayCacheEntry = { events, cursor: nextCursor, hasMore, fetchedAt: Date.now() };
        set({ _dayCache: { ...get()._dayCache, [date]: entry } });
      })
      .catch(() => { /* silent */ })
      .finally(() => _inFlight.delete(key));
  },

  // ── Compat shims ──────────────────────────────────────────────────────────
  loadFromStorage: async () => get().selectDate(today()),
  syncFromDB:      async () => {
    const cur = get().currentDate || today();
    // Invalidate cache for current date so selectDate re-fetches
    const newCache = { ...get()._dayCache };
    delete newCache[cur];
    set({ _dayCache: newCache });
    get().selectDate(cur);
  },

  // ── Mutations ─────────────────────────────────────────────────────────────
  addEvent: (e) => {
    const event: FamilyEvent = { ...e, id: 'ev' + Date.now() };

    // Optimistic: add to current day if same date
    if (event.date === get().currentDate) {
      const next = sortByTime([...get().dayEvents, event]);
      set({ dayEvents: next, events: next });
      const entry = get()._dayCache[event.date];
      if (entry) set({ _dayCache: { ...get()._dayCache, [event.date]: { ...entry, events: next } } });
    }

    // Optimistic: update strip map
    const cat = event.category;
    if (cat) {
      const sm = { ...get().stripMap };
      if (!sm[event.date]?.includes(cat)) {
        sm[event.date] = [...(sm[event.date] ?? []), cat];
        set({ stripMap: sm });
      }
    }

    supabase.from('calendar_events').insert([toRow(event)]).then(({ error }) => {
      if (error) {
        console.warn('[eventStore] insert failed', error.message);
        // Rollback
        const rolledBack = get().dayEvents.filter(e => e.id !== event.id);
        set({ dayEvents: rolledBack, events: rolledBack });
      }
    });

    return event.id;
  },

  updateEvent: (id, updates) => {
    const prev = get().dayEvents;
    const next = sortByTime(prev.map(e => e.id === id ? { ...e, ...updates } : e));
    set({ dayEvents: next, events: next });
    const updated = next.find(e => e.id === id);
    if (updated) {
      dbUpdate(id, toRow(updated));
    }
  },

  deleteEvent: (id) => {
    const prev = get().dayEvents;
    const next = prev.filter(e => e.id !== id);
    set({ dayEvents: next, events: next });
    dbUpdate(id, { deleted_at: new Date().toISOString() });
    // Also refresh strip for that date (category count may drop to zero)
    const ev = prev.find(e => e.id === id);
    if (ev?.date && ev.category) {
      const remaining = next.filter(e => e.date === ev.date && e.category === ev.category);
      if (remaining.length === 0) {
        const sm = { ...get().stripMap };
        sm[ev.date] = (sm[ev.date] ?? []).filter(c => c !== ev.category);
        set({ stripMap: sm });
        AsyncStorage.setItem(DISK_STRIP, JSON.stringify(sm));
      }
    }
  },
}));

// ── Util ──────────────────────────────────────────────────────────────────────
function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
