/**
 * HealthSlice — health records: appointments, vaccines, vet visits, weight logs, and allergies.
 *
 * All collections are keyed by petId so the store can hold data for multiple pets
 * simultaneously. Each fetch is dedup-guarded so concurrent callers get one shared
 * promise instead of duplicate DB round-trips.
 *
 * Vaccine status (overdue / due_soon / up_to_date) and days_until_due are computed
 * client-side at fetch time from the next_due date, so the UI never needs to derive
 * them inline — just read `vaccine.status`.
 */
import { StateCreator } from 'zustand';
import { supabase } from '@/lib/supabase';
import { differenceInDays, parseISO } from 'date-fns';
import { dbg, dbgSupabase } from '@/lib/debug';
import { todayLocal } from '@/lib/dates';
import type { Vaccine, VetVisit, WeightLog } from '@/lib/types';
import { getUpcomingAppointments, type Appointment } from '@/lib/db/appointments';
import { dedup } from '../utils';

const TAG = 'HealthSlice';

export interface HealthSlice {
  // ── State ──────────────────────────────────────────────────────
  /** Upcoming appointments keyed by petId; fetched via getUpcomingAppointments helper. */
  appointments: Record<string, Appointment[]>;
  /** Vaccine records keyed by petId; each entry has computed status and days_until_due. */
  vaccines: Record<string, Vaccine[]>;
  /** Past vet visit records keyed by petId; only visits up to today are fetched. */
  vetVisits: Record<string, VetVisit[]>;
  /** Last 12 weight entries keyed by petId; sorted ascending for sparkline rendering. */
  weightLogs: Record<string, WeightLog[]>;
  /** Allergy records keyed by petId — placeholder, not yet populated by a live query. */
  allergies: Record<string, any[]>;
  /** Medication records keyed by petId — reserved for future use. */
  medications: Record<string, any[]>;

  // ── Actions ────────────────────────────────────────────────────
  /** Fetches upcoming appointments via getUpcomingAppointments; dedup-guarded per petId. */
  fetchAppointments: (petId: string) => Promise<void>;
  /** Fetches vaccines ordered by next_due and augments each with a derived status field. */
  fetchVaccines: (petId: string) => Promise<void>;
  /** Inserts a vaccine and appends it to the petId bucket; status is set by a follow-up fetch. */
  addVaccine: (vaccine: Omit<Vaccine, 'id' | 'created_at' | 'status' | 'days_until_due'>) => Promise<void>;
  /** Fetches vet visits up to and including today, newest-first. */
  fetchVetVisits: (petId: string) => Promise<void>;
  /** Fetches the last 12 weight entries ordered oldest-first for chart rendering. */
  fetchWeightLogs: (petId: string) => Promise<void>;
  /** Placeholder — will fetch allergy records when the allergies table is wired up. */
  fetchAllergies: (petId: string) => Promise<void>;
}

export const createHealthSlice: StateCreator<HealthSlice, [], [], HealthSlice> = (set, _get) => ({
  appointments: {},
  vaccines: {},
  vetVisits: {},
  weightLogs: {},
  allergies: {},
  medications: {},

  // ── Appointments ─────────────────────────────────────────────────────────

  fetchAppointments: async (petId) => {
    return dedup(`appointments:${petId}`, async () => {
      try {
        const appts = await getUpcomingAppointments(petId);
        set((s) => ({ appointments: { ...s.appointments, [petId]: appts } }));
      } catch (e: any) {
        dbgSupabase('fetchAppointments', { message: e.message });
      }
    });
  },

  // ── Vaccines ──────────────────────────────────────────────────────────────

  fetchVaccines: async (petId) => {
    return dedup(`vaccines:${petId}`, async () => {
      dbg(TAG, 'fetchVaccines →', petId);
      try {
        const { data, error } = await supabase
          .from('vaccines')
          .select('id,pet_id,name,last_given,next_due,vet_name,notes,created_at')
          .eq('pet_id', petId)
          .order('next_due', { ascending: true });

        if (error) { dbgSupabase('fetchVaccines', error); return; }

        const vaccines = ((data as unknown as Vaccine[]) ?? []).map((v) => {
          if (!v.next_due) return { ...v, status: 'up_to_date' as const };
          const days = differenceInDays(parseISO(v.next_due), new Date());
          return {
            ...v,
            days_until_due: days,
            status: days < 0 ? 'overdue' : days <= 30 ? 'due_soon' : 'up_to_date',
          } as Vaccine;
        });

        dbg(TAG, `fetchVaccines ← ${vaccines.length} vaccines`);
        set((s) => ({ vaccines: { ...s.vaccines, [petId]: vaccines } }));
      } catch (e: any) {
        dbgSupabase('fetchVaccines', { message: e.message });
      }
    });
  },

  addVaccine: async (vaccine) => {
    dbg(TAG, 'addVaccine →', vaccine.name);
    try {
      const { data, error } = await supabase
        .from('vaccines')
        .insert(vaccine)
        .select()
        .single();

      if (error) { dbgSupabase('addVaccine', error); return; }
      set((s) => ({
        vaccines: {
          ...s.vaccines,
          [vaccine.pet_id]: [...(s.vaccines[vaccine.pet_id] ?? []), data as Vaccine],
        },
      }));
    } catch (e: any) {
      dbgSupabase('addVaccine', { message: e.message });
    }
  },

  // ── Vet Visits ────────────────────────────────────────────────────────────

  fetchVetVisits: async (petId) => {
    return dedup(`vetVisits:${petId}`, async () => {
      dbg(TAG, 'fetchVetVisits →', petId);
      try {
        const today = todayLocal();
        const { data, error } = await supabase
          .from('vet_visits')
          .select('id,pet_id,visit_date,reason,diagnosis,prescription,vet_name,clinic_name,notes,created_at')
          .eq('pet_id', petId)
          .lte('visit_date', today)
          .order('visit_date', { ascending: false });

        if (error) { dbgSupabase('fetchVetVisits', error); return; }
        set((s) => ({ vetVisits: { ...s.vetVisits, [petId]: (data as unknown as VetVisit[]) ?? [] } }));
      } catch (e: any) {
        dbgSupabase('fetchVetVisits', { message: e.message });
      }
    });
  },

  // ── Weight Logs ───────────────────────────────────────────────────────────

  fetchWeightLogs: async (petId) => {
    return dedup(`weightLogs:${petId}`, async () => {
      dbg(TAG, 'fetchWeightLogs →', petId);
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('weight_logs')
          .select('id,pet_id,weight_kg,notes,logged_at')
          .eq('pet_id', petId)
          .lte('logged_at', now)
          .order('logged_at', { ascending: true })
          .limit(12);

        if (error) { dbgSupabase('fetchWeightLogs', error); return; }
        set((s) => ({ weightLogs: { ...s.weightLogs, [petId]: (data as WeightLog[]) ?? [] } }));
      } catch (e: any) {
        dbgSupabase('fetchWeightLogs', { message: e.message });
      }
    });
  },

  // ── Allergies ─────────────────────────────────────────────────────────────

  fetchAllergies: async (petId) => {
    return dedup(`allergies:${petId}`, async () => {
      dbg(TAG, 'fetchAllergies →', petId);
      // Placeholder — wire up when allergies table is defined
      set((s) => ({ allergies: { ...s.allergies, [petId]: s.allergies[petId] ?? [] } }));
    });
  },
});
