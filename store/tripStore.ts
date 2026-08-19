/**
 * tripStore — Pick-up Radar "En Route" trips.
 *
 * A trip is family-wide, not driver-only: the requester (whoever the ride
 * is for), any other kid/teen, and every parent all see the same live
 * progress on their own Hub, synced via Supabase realtime — not just the
 * driver's own device. AsyncStorage caches the last-known trip so it
 * survives an app reload before the realtime channel reconnects.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export interface Trip {
  id: string;
  familyId: string;
  driverMemberId: string;
  pickupMemberId?: string;
  etaMinutes: number;
  startedAt: string;       // ISO
  completedAt?: string;    // ISO
  overdueAlertSent: boolean;
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
  };
}

const DISK_TRIP = '@fc_active_trip_v1';

interface TripState {
  // Null = no active trip. At most one active (completed_at IS NULL) trip
  // per family is expected — dispatching a new one while another is active
  // isn't a flow the UI currently offers.
  activeTrip: Trip | null;
  loaded: boolean;

  loadFromStorage: (familyId: string) => Promise<void>;
  dispatch: (params: {
    familyId: string; driverMemberId: string;
    pickupMemberId?: string; etaMinutes: number;
  }) => Promise<void>;
  updateEta: (etaMinutes: number) => Promise<void>;
  markOverdueAlertSent: () => Promise<void>;
  complete: () => Promise<void>;
}

let _rtChannel: ReturnType<typeof supabase.channel> | null = null;
let _rtFamilyId = '';

function ensureRealtime(familyId: string, set: (s: Partial<TripState>) => void) {
  if (_rtFamilyId === familyId && _rtChannel) return;
  if (_rtChannel) { supabase.removeChannel(_rtChannel); _rtChannel = null; }
  _rtFamilyId = familyId;

  _rtChannel = supabase
    .channel(`trips:${familyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trips', filter: `family_id=eq.${familyId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as TripRow | undefined;
        if (!row) return;
        const trip = fromRow(row as TripRow);
        const next = trip.completedAt ? null : trip;
        set({ activeTrip: next });
        AsyncStorage.setItem(DISK_TRIP, JSON.stringify(next));
      }
    )
    .subscribe();
}

export const useTripStore = create<TripState>((set, get) => ({
  activeTrip: null,
  loaded: false,

  loadFromStorage: async (familyId) => {
    try {
      const raw = await AsyncStorage.getItem(DISK_TRIP);
      if (raw) set({ activeTrip: JSON.parse(raw) });
    } catch {}

    ensureRealtime(familyId, set);

    const { data } = await supabase
      .from('trips')
      .select('*')
      .eq('family_id', familyId)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const trip = data ? fromRow(data as TripRow) : null;
    set({ activeTrip: trip, loaded: true });
    AsyncStorage.setItem(DISK_TRIP, JSON.stringify(trip));
  },

  dispatch: async ({ familyId, driverMemberId, pickupMemberId, etaMinutes }) => {
    const id = `trip_${Date.now()}`;
    const startedAt = new Date().toISOString();
    const optimistic: Trip = {
      id, familyId, driverMemberId, pickupMemberId, etaMinutes, startedAt,
      overdueAlertSent: false,
    };
    set({ activeTrip: optimistic });
    AsyncStorage.setItem(DISK_TRIP, JSON.stringify(optimistic));

    await supabase.from('trips').insert({
      id, family_id: familyId, driver_member_id: driverMemberId,
      pickup_member_id: pickupMemberId ?? null, eta_minutes: etaMinutes,
      started_at: startedAt,
    });
  },

  updateEta: async (etaMinutes) => {
    const trip = get().activeTrip;
    if (!trip) return;
    const next = { ...trip, etaMinutes };
    set({ activeTrip: next });
    AsyncStorage.setItem(DISK_TRIP, JSON.stringify(next));
    await supabase.from('trips').update({ eta_minutes: etaMinutes }).eq('id', trip.id);
  },

  markOverdueAlertSent: async () => {
    const trip = get().activeTrip;
    if (!trip || trip.overdueAlertSent) return;
    const next = { ...trip, overdueAlertSent: true };
    set({ activeTrip: next });
    AsyncStorage.setItem(DISK_TRIP, JSON.stringify(next));
    await supabase.from('trips').update({ overdue_alert_sent: true }).eq('id', trip.id);
  },

  complete: async () => {
    const trip = get().activeTrip;
    if (!trip) return;
    set({ activeTrip: null });
    AsyncStorage.setItem(DISK_TRIP, JSON.stringify(null));
    await supabase.from('trips').update({ completed_at: new Date().toISOString() }).eq('id', trip.id);
  },
}));
