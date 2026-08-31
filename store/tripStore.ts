/**
 * tripStore — Pick-up Radar "En Route" trips.
 *
 * A trip is family-wide, not driver-only: the requester (whoever the ride
 * is for), any other kid/teen, and every parent all see the same live
 * progress on their own Hub, synced via Supabase realtime — not just the
 * driver's own device. AsyncStorage caches the last-known trips so they
 * survive an app reload before the realtime channel reconnects.
 *
 * Multiple trips CAN be active at once for a family — e.g. two parents each
 * independently driving to pick up a different kid at the same time. The
 * DB (`trips` table) has never enforced a one-active-trip-per-family limit;
 * that used to be a client-side assumption only (`activeTrip: Trip | null`),
 * which meant a second parent dispatching their own trip would silently
 * clobber the first parent's trip on every device's local state. The store
 * now tracks a list, keyed by trip id, so concurrent trips from different
 * drivers coexist correctly. The one real constraint kept is per-DRIVER:
 * the same person can't sanely be "en route" to two places at once.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useFamilyStore } from '@/store/familyStore';

export interface Trip {
  id: string;
  familyId: string;
  driverMemberId: string;
  pickupMemberId?: string;
  etaMinutes: number;
  startedAt: string;       // ISO
  completedAt?: string;    // ISO
  overdueAlertSent: boolean;
  // Real gap fixed: reassign_event's "close out the prior driver's trip"
  // side effect used to match on driver_member_id alone, so reassigning
  // one event's driver could silently complete that same driver's
  // genuinely unrelated in-progress trip for a DIFFERENT event. Optional
  // — the manual "dispatch now" flow (no specific linked event) leaves
  // this unset, same as before; the "Up Next" ride-linked dispatch sets
  // it to the real calendar event id.
  eventId?: string;
}

interface TripRow {
  id: string;
  family_id: string;
  driver_member_id: string;
  pickup_member_id: string | null;
  eta_minutes: number;
  started_at: string;
  completed_at: string | null;
  overdue_alert_sent: boolean;
  event_id: string | null;
}

function fromRow(row: TripRow): Trip {
  return {
    id: row.id,
    familyId: row.family_id,
    driverMemberId: row.driver_member_id,
    pickupMemberId: row.pickup_member_id ?? undefined,
    etaMinutes: row.eta_minutes,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    overdueAlertSent: row.overdue_alert_sent,
    eventId: row.event_id ?? undefined,
  };
}

const DISK_TRIP = '@fc_active_trip_v1';

interface TripState {
  // Every currently-active (completed_at IS NULL) trip for the family —
  // zero, one, or more. `activeTrip` below is a derived convenience getter
  // for the common single-trip case; callers that need to distinguish
  // between concurrent trips (e.g. per-driver effects, multi-banner
  // rendering) should read `activeTrips` directly.
  activeTrips: Trip[];
  // Convenience: the most-recently-started active trip, or null. Kept for
  // callers that only ever cared about "the" trip — behaves identically to
  // the old `activeTrip` field when at most one trip is active.
  activeTrip: Trip | null;
  loaded: boolean;

  loadFromStorage: (familyId: string) => Promise<void>;
  dispatch: (params: {
    familyId: string; driverMemberId: string;
    pickupMemberId?: string; etaMinutes: number; eventId?: string;
  }) => Promise<void>;
  updateEta: (tripId: string, etaMinutes: number) => Promise<void>;
  markOverdueAlertSent: (tripId: string) => Promise<void>;
  complete: (tripId: string) => Promise<void>;
}

function deriveActiveTrip(trips: Trip[]): Trip | null {
  if (trips.length === 0) return null;
  return [...trips].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

function persist(trips: Trip[]) {
  AsyncStorage.setItem(DISK_TRIP, JSON.stringify(trips));
}

function memberName(memberId: string | undefined | null): string | undefined {
  if (!memberId) return undefined;
  return useFamilyStore.getState().members.find(m => m.id === memberId)?.name;
}

// Everyone who should see a trip's live progress, per this file's own header
// comment — the requester, any other kid/teen, and every parent — minus the
// driver themselves (they don't need a push about their own trip). Was:
// dispatch/overdue only ever posted to family chat (invisible if the app is
// backgrounded/closed); this adds a real push+persisted notification
// alongside that existing broadcast, not instead of it.
function tripRecipientIds(driverMemberId: string): string[] {
  return useFamilyStore.getState().members
    .filter(m => m.id !== driverMemberId)
    .map(m => m.id);
}

function notifyTrip(
  type: 'trip_started' | 'trip_overdue',
  familyId: string,
  driverMemberId: string,
  payload: Record<string, unknown>,
) {
  const memberIds = tripRecipientIds(driverMemberId);
  if (!memberIds.length) return;
  supabase.functions.invoke('family-notifier', {
    body: { type, familyId, memberIds, payload, persist: true, excludeMemberId: driverMemberId },
  }).catch(e => console.warn('[tripStore] notify failed:', e?.message));
}

let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function ensureRealtime(familyId: string, set: (fn: (s: TripState) => Partial<TripState>) => void) {
  if (_rtFamilyId === familyId && _rtChannel) return;
  if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
  // Same hot-reload defensive sweep as choreStore.ts's/familyStore.ts's/
  // kidRequestStore.ts's ensureRealtime — this store was missing it
  // entirely (confirmed via audit as the least defensive channel setup of
  // its siblings), leaving it exposed to the dev-mode "cannot add
  // postgres_changes callbacks ... after subscribe()" crash a prior session
  // fixed everywhere else.
  const staleTopic = `realtime:trips:${familyId}`;
  const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
  if (stale.length > 0) stale.forEach(c => supabase.removeChannel(c));
  _rtFamilyId = familyId;

  try {
    _rtChannel = supabase
      .channel(`trips:${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as TripRow | undefined;
          if (!row) return;
          const trip = fromRow(row as TripRow);

          set((state) => {
            // Patch just the ONE trip that changed, keyed by id — never
            // replace the whole list off a single row. A prior version did
            // `set({ activeTrip: next })` on every insert/update, which meant
            // any OTHER family member starting their own trip would overwrite
            // (and appear to delete) everyone else's view of an unrelated,
            // still-running trip.
            const withoutThis = state.activeTrips.filter(t => t.id !== trip.id);
            const nextTrips = trip.completedAt ? withoutThis : [...withoutThis, trip];
            persist(nextTrips);
            return { activeTrips: nextTrips, activeTrip: deriveActiveTrip(nextTrips) };
          });
        }
      )
      .subscribe((status) => {
        console.log(`[tripStore] realtime trips:${familyId} subscribe status=${status}`);
        // Same fix as choreStore.ts's/eventStore.ts's ensureRealtime — this
        // store had NO status handling at all, meaning a dead socket (most
        // plausibly here: the driving parent backgrounding the app mid-trip
        // — exactly the scenario this feature exists for) would silently
        // stop every other family member's ETA/completion updates with no
        // recovery short of a manual Hub reload. Clearing on a terminal bad
        // status makes the next ensureRealtime() call actually resubscribe.
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[tripStore] realtime trips:${familyId} unhealthy (${status}) — clearing so the next load resubscribes`);
          if (_rtFamilyId === familyId) { _rtChannel = null; _rtFamilyId = ''; }
        }
      });
  } catch (e: any) {
    console.warn('[tripStore] ensureRealtime subscribe failed', e?.message ?? e);
  }
}

export const useTripStore = create<TripState>((set, get) => ({
  activeTrips: [],
  activeTrip: null,
  loaded: false,

  loadFromStorage: async (familyId) => {
    try {
      const raw = await AsyncStorage.getItem(DISK_TRIP);
      if (raw) {
        const cached: Trip[] = JSON.parse(raw);
        set({ activeTrips: cached, activeTrip: deriveActiveTrip(cached) });
      }
    } catch {}

    ensureRealtime(familyId, set);

    const { data } = await supabase
      .from('trips')
      .select('*')
      .eq('family_id', familyId)
      .is('completed_at', null)
      .order('started_at', { ascending: true });

    const trips = (data ?? []).map(row => fromRow(row as TripRow));
    set({ activeTrips: trips, activeTrip: deriveActiveTrip(trips), loaded: true });
    persist(trips);
  },

  dispatch: async ({ familyId, driverMemberId, pickupMemberId, etaMinutes, eventId }) => {
    // Same-driver guard only: one person can't sanely be "en route" to two
    // places simultaneously. A DIFFERENT driver dispatching their own trip
    // while this one is active is a normal two-parent scenario and must NOT
    // be blocked — that's the whole point of this being a list now.
    const existing = get().activeTrips.find(t => t.driverMemberId === driverMemberId);
    if (existing) return;

    const id = `trip_${Date.now()}`;
    const startedAt = new Date().toISOString();
    const optimistic: Trip = {
      id, familyId, driverMemberId, pickupMemberId, etaMinutes, startedAt,
      overdueAlertSent: false, eventId,
    };
    const nextTrips = [...get().activeTrips, optimistic];
    set({ activeTrips: nextTrips, activeTrip: deriveActiveTrip(nextTrips) });
    persist(nextTrips);

    await supabase.from('trips').insert({
      id, family_id: familyId, driver_member_id: driverMemberId,
      pickup_member_id: pickupMemberId ?? null, eta_minutes: etaMinutes,
      started_at: startedAt, event_id: eventId ?? null,
    });

    notifyTrip('trip_started', familyId, driverMemberId, {
      tripId: id,
      driverName: memberName(driverMemberId) ?? 'A parent',
      kidName: memberName(pickupMemberId) ?? 'the kids',
      etaMinutes,
    });
  },

  updateEta: async (tripId, etaMinutes) => {
    const trips = get().activeTrips;
    const idx = trips.findIndex(t => t.id === tripId);
    if (idx === -1) return;
    const nextTrips = trips.map(t => t.id === tripId ? { ...t, etaMinutes } : t);
    set({ activeTrips: nextTrips, activeTrip: deriveActiveTrip(nextTrips) });
    persist(nextTrips);
    await supabase.from('trips').update({ eta_minutes: etaMinutes }).eq('id', tripId);
  },

  markOverdueAlertSent: async (tripId) => {
    const trips = get().activeTrips;
    const trip = trips.find(t => t.id === tripId);
    if (!trip || trip.overdueAlertSent) return;
    const nextTrips = trips.map(t => t.id === tripId ? { ...t, overdueAlertSent: true } : t);
    set({ activeTrips: nextTrips, activeTrip: deriveActiveTrip(nextTrips) });
    persist(nextTrips);
    await supabase.from('trips').update({ overdue_alert_sent: true }).eq('id', tripId);

    notifyTrip('trip_overdue', trip.familyId, trip.driverMemberId, {
      tripId: trip.id,
      driverName: memberName(trip.driverMemberId) ?? 'The driver',
      kidName: memberName(trip.pickupMemberId) ?? 'the kids',
      etaMinutes: trip.etaMinutes,
    });
  },

  complete: async (tripId) => {
    const trips = get().activeTrips;
    if (!trips.some(t => t.id === tripId)) return;
    const nextTrips = trips.filter(t => t.id !== tripId);
    set({ activeTrips: nextTrips, activeTrip: deriveActiveTrip(nextTrips) });
    persist(nextTrips);
    await supabase.from('trips').update({ completed_at: new Date().toISOString() }).eq('id', tripId);
  },
}));
