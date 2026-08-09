/**
 * MilestonesSlice — bond-day milestones (7-day, 30-day, 100-day, etc.).
 *
 * Milestones are inserted server-side by a cron job and read here for display
 * on the Home screen's TogethernessBadge. The addMilestone action exists for
 * manual or client-triggered milestones (e.g. user-defined achievements).
 *
 * Records are ordered newest-first (highest day_count first) so callers can
 * find the most recent milestone without sorting.
 */
import { StateCreator } from 'zustand';
import { supabase } from '@/lib/supabase';
import { dbg, dbgSupabase } from '@/lib/debug';
import type { Milestone } from '@/lib/types';
import { dedup } from '../utils';

const TAG = 'MilestonesSlice';

export interface MilestonesSlice {
  // ── State ──────────────────────────────────────────────────────
  /** Milestone records keyed by petId; ordered by day_count descending. */
  milestones: Record<string, Milestone[]>;

  // ── Actions ────────────────────────────────────────────────────
  /** Fetches all milestones for a pet; dedup-guarded so concurrent renders fire one query. */
  fetchMilestones: (petId: string) => Promise<void>;
  /** Inserts a milestone and prepends it to the petId bucket in the local store. */
  addMilestone: (milestone: Omit<Milestone, 'id' | 'created_at'>) => Promise<void>;
}

export const createMilestonesSlice: StateCreator<MilestonesSlice, [], [], MilestonesSlice> = (set, _get) => ({
  milestones: {},

  fetchMilestones: async (petId) => {
    return dedup(`milestones:${petId}`, async () => {
      dbg(TAG, 'fetchMilestones →', petId);
      try {
        const { data, error } = await supabase
          .from('milestones')
          .select('id,pet_id,day_count,title,achieved_at,created_at')
          .eq('pet_id', petId)
          .order('day_count', { ascending: false });

        if (error) { dbgSupabase('fetchMilestones', error); return; }
        set((s) => ({ milestones: { ...s.milestones, [petId]: (data as unknown as Milestone[]) ?? [] } }));
      } catch (e: any) {
        dbgSupabase('fetchMilestones', { message: e.message });
      }
    });
  },

  addMilestone: async (milestone) => {
    dbg(TAG, 'addMilestone →', milestone.title);
    try {
      const { data, error } = await supabase
        .from('milestones')
        .insert(milestone)
        .select()
        .single();

      if (error) { dbgSupabase('addMilestone', error); return; }
      set((s) => ({
        milestones: {
          ...s.milestones,
          [milestone.pet_id]: [data as Milestone, ...(s.milestones[milestone.pet_id] ?? [])],
        },
      }));
    } catch (e: any) {
      dbgSupabase('addMilestone', { message: e.message });
    }
  },
});
