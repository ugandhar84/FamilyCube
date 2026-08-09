/**
 * CareSlice — daily care state: mood logs, feeding logs, checklists, grooming, and streaks.
 *
 * All collections are keyed by petId (or petId:date for per-day records) so the
 * store can hold data for multiple pets simultaneously without collisions.
 *
 * Design notes:
 *  - fetchFeedingLogs uses a petId:date composite key (BUG-22 fix) so switching
 *    dates never shows stale logs from the previous day.
 *  - toggleChecklistItem optimistically updates the local list and rolls back on DB error.
 *  - touchStreak is called automatically after addMoodLog and toggleChecklistItem
 *    (mark-complete) so callers don't need to remember to update the streak.
 *  - fetchGroomingSummary is a single round-trip for all pets × all types to avoid
 *    N×M queries when the Home screen renders grooming chips for a multi-pet household.
 */
import { StateCreator } from 'zustand';
import { supabase } from '@/lib/supabase';
import { dbg, dbgSupabase } from '@/lib/debug';
import { todayLocal } from '@/lib/dates';
import { touchCareStreak } from '@/lib/db/streak';
import { computeCareProgress } from '@/lib/careProgress';
import { awardCareCoins, onCareDayComplete } from '@/lib/db/careCoins';
import type {
  MoodLog,
  FeedingLog,
  ChecklistItem,
  GroomingLog,
} from '@/lib/types';
import { dedup } from '../utils';

const TAG = 'CareSlice';

export interface CareSlice {
  // ── State ──────────────────────────────────────────────────────
  /** Recent mood logs keyed by petId. Up to 30 entries, ordered newest-first. */
  moodLogs: Record<string, MoodLog[]>;
  /** Feeding logs keyed by "petId:date" to prevent stale cross-day data. */
  feedingLogs: Record<string, FeedingLog[]>;
  /** Daily checklist items keyed by petId. */
  checklist: Record<string, ChecklistItem[]>;
  /** Grooming logs for the past 90 days, keyed by petId, newest-first. */
  groomingLogs: Record<string, GroomingLog[]>;
  /** Last done_at per grooming type per pet — one DB round-trip covers all pets × types. */
  groomingSummary: Record<string, Record<string, string>>;
  /** User-configured grooming interval in days per type per pet (from pet_groom_settings). */
  groomSettings: Record<string, Record<string, number>>;
  /** Current care streak (consecutive days with at least one logged care action) per petId. */
  streaks: Record<string, number>;
  /** DB-persisted daily care scores keyed by "petId:date" → 0–100. Loaded on app start; upserted after each care action. */
  dailyScores: Record<string, number>;
  /** Placeholder for future activity-feed state — not yet wired to a DB table. */
  feeds: Record<string, any[]>;

  // ── Computed ───────────────────────────────────────────────────
  /** Returns today's mood log for the pet, or null when none has been logged yet. */
  todaysMood: (petId: string) => MoodLog | null;

  // ── Mood ───────────────────────────────────────────────────────
  /** Fetches the last 30 mood logs up to today; dedup-guarded per petId. */
  fetchMoodLogs: (petId: string) => Promise<void>;
  /** Inserts a mood log and prepends it to the local list; also touches the care streak. */
  addMoodLog: (log: Omit<MoodLog, 'id' | 'created_at'>) => Promise<void>;
  /** Prepends a mood log to the local list without a DB insert (used by realtime push). */
  addMoodLogToStore: (log: MoodLog) => void;

  // ── Feeding ────────────────────────────────────────────────────
  /** Fetches feeding logs for the given date; keyed by petId:date to avoid cross-day stale data. */
  fetchFeedingLogs: (petId: string, date: string) => Promise<void>;
  /** Inserts a feeding log and prepends it to the petId:date bucket. */
  addFeedingLog: (log: Omit<FeedingLog, 'id'>) => Promise<void>;

  // ── Checklist ──────────────────────────────────────────────────
  /** Fetches checklist items for one pet on one date, ordered by due_time. */
  fetchChecklist: (petId: string, date: string) => Promise<void>;
  /** Optimistically toggles a checklist item; rolls back if the DB update fails. */
  toggleChecklistItem: (itemId: string, completed: boolean, userId: string) => Promise<void>;

  // ── Grooming ───────────────────────────────────────────────────
  /** Fetches the past 90 days of grooming logs for one pet. */
  fetchGroomingLogs: (petId: string) => Promise<void>;
  /** One round-trip for all provided petIds — collapses to last done_at per type per pet. */
  fetchGroomingSummary: (petIds: string[]) => Promise<void>;
  /** Loads user-configured grooming intervals from pet_groom_settings for all petIds. */
  fetchGroomSettings: (petIds: string[]) => Promise<void>;
  /** Inserts a grooming log and prepends it to the petId bucket. */
  addGroomingLog: (log: Omit<GroomingLog, 'id'>) => Promise<void>;

  // ── Streak ─────────────────────────────────────────────────────
  /** Upserts today's care streak entry and updates the local streaks map. */
  touchStreak: (petId: string) => Promise<void>;

  // ── Daily care scores ──────────────────────────────────────────
  /** Fetches today's (and optionally recent) DB-stored scores for the given petIds. */
  fetchDailyCareScores: (petIds: string[], date?: string) => Promise<void>;
  /** Computes the current score from store state and upserts it to daily_care_scores. */
  saveCareScore: (petId: string, species?: string | null, userId?: string | null) => Promise<void>;

  // ── Feeds ──────────────────────────────────────────────────────
  /** Placeholder for future activity-feed fetch — currently a no-op. */
  fetchFeeds: (petId: string) => Promise<void>;
}

export const createCareSlice: StateCreator<CareSlice, [], [], CareSlice> = (set, get) => ({
  moodLogs: {},
  feedingLogs: {},
  checklist: {},
  groomingLogs: {},
  groomingSummary: {},
  groomSettings: {},
  streaks: {},
  dailyScores: {},
  feeds: {},

  // ── Computed ──────────────────────────────────────────────────────────────

  todaysMood: (petId) => {
    const today = todayLocal();
    return get().moodLogs[petId]?.find((l) => l.date === today) ?? null;
  },

  // ── Mood ──────────────────────────────────────────────────────────────────

  fetchMoodLogs: async (petId) => {
    return dedup(`moodLogs:${petId}`, async () => {
      dbg(TAG, 'fetchMoodLogs →', petId);
      try {
        const today = todayLocal();
        const { data, error } = await supabase
          .from('mood_logs')
          .select('id,pet_id,mood_label,mood_score,notes,photo_url,date,created_at')
          .eq('pet_id', petId)
          .lte('date', today)
          .order('created_at', { ascending: false })
          .limit(30);

        if (error) { dbgSupabase('fetchMoodLogs', error); return; }
        dbg(TAG, `fetchMoodLogs ← ${data?.length ?? 0} entries`);
        set((s) => ({ moodLogs: { ...s.moodLogs, [petId]: (data as MoodLog[]) ?? [] } }));
      } catch (e: any) {
        dbgSupabase('fetchMoodLogs', { message: e.message });
      }
    });
  },

  addMoodLog: async (log) => {
    dbg(TAG, 'addMoodLog →', log.mood_label);
    try {
      const { data, error } = await supabase
        .from('mood_logs')
        .insert(log)
        .select()
        .single();

      if (error) { dbgSupabase('addMoodLog', error); return; }
      dbg(TAG, 'addMoodLog ← ok');
      set((s) => ({
        moodLogs: {
          ...s.moodLogs,
          [log.pet_id]: [data as MoodLog, ...(s.moodLogs[log.pet_id] ?? [])],
        },
      }));
      get().touchStreak(log.pet_id).catch(() => {});
      get().saveCareScore(log.pet_id).catch(() => {});
      if (log.scanned_by) awardCareCoins(log.scanned_by, 'care_mood', log.pet_id);
    } catch (e: any) {
      dbgSupabase('addMoodLog', { message: e.message });
    }
  },

  addMoodLogToStore: (log) => {
    set((s) => ({
      moodLogs: {
        ...s.moodLogs,
        [log.pet_id]: [log, ...(s.moodLogs[log.pet_id] ?? [])],
      },
    }));
  },

  // ── Feeding ───────────────────────────────────────────────────────────────

  fetchFeedingLogs: async (petId, date) => {
    return dedup(`feedingLogs:${petId}:${date}`, async () => {
      dbg(TAG, 'fetchFeedingLogs →', petId, date);
      try {
        const { data, error } = await supabase
          .from('feeding_logs')
          .select('*, profiles(full_name, avatar_url)')
          .eq('pet_id', petId)
          .eq('date', date)
          .order('fed_at', { ascending: false });

        if (error) { dbgSupabase('fetchFeedingLogs', error); return; }
        // Key by petId:date so switching dates never serves stale data (BUG-22)
        const key = `${petId}:${date}`;
        set((s) => ({ feedingLogs: { ...s.feedingLogs, [key]: (data as FeedingLog[]) ?? [] } }));
      } catch (e: any) {
        dbgSupabase('fetchFeedingLogs', { message: e.message });
      }
    });
  },

  addFeedingLog: async (log) => {
    dbg(TAG, 'addFeedingLog →', log.meal_type);
    try {
      const { data, error } = await supabase
        .from('feeding_logs')
        .insert(log)
        .select()
        .single();

      if (error) { dbgSupabase('addFeedingLog', error); return; }
      const key = `${log.pet_id}:${log.date}`;
      set((s) => ({
        feedingLogs: {
          ...s.feedingLogs,
          [key]: [data as FeedingLog, ...(s.feedingLogs[key] ?? [])],
        },
      }));
      get().saveCareScore(log.pet_id).catch(() => {});
      if (log.fed_by && log.meal_type !== 'water') awardCareCoins(log.fed_by, 'care_meal', log.pet_id);
    } catch (e: any) {
      dbgSupabase('addFeedingLog', { message: e.message });
    }
  },

  // ── Checklist ─────────────────────────────────────────────────────────────

  fetchChecklist: async (petId, date) => {
    return dedup(`checklist:${petId}:${date}`, async () => {
      dbg(TAG, 'fetchChecklist →', petId, date);
      try {
        const { data, error } = await supabase
          .from('daily_checklist')
          .select('id,pet_id,date,type,label,due_time,completed,completed_by,completed_at,created_at')
          .eq('pet_id', petId)
          .eq('date', date)
          .order('due_time', { ascending: true });

        if (error) { dbgSupabase('fetchChecklist', error); return; }
        set((s) => ({ checklist: { ...s.checklist, [petId]: (data as unknown as ChecklistItem[]) ?? [] } }));
      } catch (e: any) {
        dbgSupabase('fetchChecklist', { message: e.message });
      }
    });
  },

  toggleChecklistItem: async (itemId, completed, userId) => {
    dbg(TAG, 'toggleChecklistItem →', itemId, completed);
    // Optimistic update: flip immediately, rollback full item snapshot on DB error
    let rollbackPetId = '';
    let rollbackItem: ChecklistItem | null = null;
    set((s) => {
      for (const [petId, list] of Object.entries(s.checklist)) {
        const item = list.find(i => i.id === itemId);
        if (item) {
          rollbackPetId = petId;
          rollbackItem = item;
          const optimistic = {
            ...item, completed,
            completed_by: completed ? userId : null,
            completed_at: completed ? new Date().toISOString() : null,
          } as ChecklistItem;
          return { checklist: { ...s.checklist, [petId]: list.map(i => i.id === itemId ? optimistic : i) } };
        }
      }
      return {};
    });

    try {
      const { data, error } = await supabase
        .from('daily_checklist')
        .update({
          completed,
          completed_by: completed ? userId : null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', itemId)
        .select()
        .single();

      if (error) {
        dbgSupabase('toggleChecklistItem', error);
        // Rollback full item snapshot so completed_by/completed_at are also restored
        set((s) => {
          if (!rollbackPetId || !rollbackItem) return {};
          const list = s.checklist[rollbackPetId]?.map((item) =>
            item.id === itemId ? rollbackItem! : item
          ) ?? [];
          return { checklist: { ...s.checklist, [rollbackPetId]: list } };
        });
        return;
      }
      const updated = data as ChecklistItem;
      set((s) => {
        const list = s.checklist[updated.pet_id]?.map((item) =>
          item.id === itemId ? updated : item
        ) ?? [];
        return { checklist: { ...s.checklist, [updated.pet_id]: list } };
      });
      // Touch streak and save score whenever a care item is marked complete
      if (completed) {
        get().touchStreak(updated.pet_id).catch(() => {});
        get().saveCareScore(updated.pet_id, undefined, userId).catch(() => {});
        if (updated.type === 'walk') awardCareCoins(userId, 'care_walk', updated.pet_id);
      }
    } catch (e: any) {
      dbgSupabase('toggleChecklistItem', { message: e.message });
    }
  },

  // ── Grooming ──────────────────────────────────────────────────────────────

  fetchGroomingLogs: async (petId) => {
    return dedup(`groomingLogs:${petId}`, async () => {
      dbg(TAG, 'fetchGroomingLogs →', petId);
      try {
        const now = new Date();
        const since = new Date(now); since.setDate(since.getDate() - 90);
        const { data, error } = await supabase
          .from('grooming_logs')
          .select('id,pet_id,type,notes,done_at,done_by,photo_url')
          .eq('pet_id', petId)
          .gte('done_at', since.toISOString())
          .lte('done_at', now.toISOString())
          .order('done_at', { ascending: false })
          .limit(100);

        if (error) { dbgSupabase('fetchGroomingLogs', error); return; }
        set((s) => ({ groomingLogs: { ...s.groomingLogs, [petId]: (data as GroomingLog[]) ?? [] } }));
      } catch (e: any) {
        dbgSupabase('fetchGroomingLogs', { message: e.message });
      }
    });
  },

  // Single DB round-trip for ALL pets × ALL types — returns last done_at per pet per type.
  fetchGroomingSummary: async (petIds) => {
    if (!petIds.length) return;
    return dedup(`groomSummary:${petIds.sort().join(',')}`, async () => {
      dbg(TAG, 'fetchGroomingSummary →', petIds);
      try {
        const { data, error } = await supabase
          .from('grooming_logs')
          .select('pet_id,type,done_at')
          .in('pet_id', petIds)
          .order('done_at', { ascending: false });

        if (error) { dbgSupabase('fetchGroomingSummary', error); return; }

        // Collapse to { petId: { type: lastDoneAt } }
        const summary: Record<string, Record<string, string>> = {};
        for (const row of (data ?? []) as { pet_id: string; type: string; done_at: string }[]) {
          if (!summary[row.pet_id]) summary[row.pet_id] = {};
          // rows are newest-first so first occurrence per type is the most recent
          if (!summary[row.pet_id][row.type]) summary[row.pet_id][row.type] = row.done_at;
        }
        dbg(TAG, 'fetchGroomingSummary ←', Object.keys(summary).length, 'pets');
        set((s) => ({ groomingSummary: { ...s.groomingSummary, ...summary } }));
      } catch (e: any) {
        dbgSupabase('fetchGroomingSummary', { message: e.message });
      }
    });
  },

  fetchGroomSettings: async (petIds) => {
    if (!petIds.length) return;
    return dedup(`groomSettings:${petIds.sort().join(',')}`, async () => {
      try {
        const { data, error } = await supabase
          .from('pet_groom_settings')
          .select('pet_id,type,interval_days')
          .in('pet_id', petIds);
        if (error) { dbgSupabase('fetchGroomSettings', error); return; }
        const settings: Record<string, Record<string, number>> = {};
        for (const row of (data ?? []) as { pet_id: string; type: string; interval_days: number }[]) {
          if (!settings[row.pet_id]) settings[row.pet_id] = {};
          settings[row.pet_id][row.type] = row.interval_days;
        }
        set((s) => ({ groomSettings: { ...s.groomSettings, ...settings } }));
      } catch (e: any) {
        dbgSupabase('fetchGroomSettings', { message: e.message });
      }
    });
  },

  addGroomingLog: async (log) => {
    dbg(TAG, 'addGroomingLog →', log.type);
    try {
      const { data, error } = await supabase
        .from('grooming_logs')
        .insert(log)
        .select()
        .single();

      if (error) { dbgSupabase('addGroomingLog', error); return; }
      set((s) => ({
        groomingLogs: {
          ...s.groomingLogs,
          [log.pet_id]: [data as GroomingLog, ...(s.groomingLogs[log.pet_id] ?? [])],
        },
        // Update summary so the attention card disappears immediately
        groomingSummary: {
          ...s.groomingSummary,
          [log.pet_id]: {
            ...(s.groomingSummary[log.pet_id] ?? {}),
            [log.type]: log.done_at,
          },
        },
      }));
      if (log.done_by) awardCareCoins(log.done_by, 'care_groom', log.pet_id);
    } catch (e: any) {
      dbgSupabase('addGroomingLog', { message: e.message });
    }
  },

  // ── Streak ────────────────────────────────────────────────────────────────

  touchStreak: async (petId) => {
    const newStreak = await touchCareStreak(petId);
    set((s) => ({ streaks: { ...s.streaks, [petId]: newStreak } }));
  },

  // ── Daily care scores ─────────────────────────────────────────────────────

  fetchDailyCareScores: async (petIds, date) => {
    if (!petIds.length) return;
    const day = date ?? todayLocal();
    return dedup(`dailyCareScores:${petIds.sort().join(',')}:${day}`, async () => {
      dbg(TAG, 'fetchDailyCareScores →', petIds.length, 'pets', day);
      try {
        const { data, error } = await supabase
          .from('daily_care_scores')
          .select('pet_id, date, score')
          .in('pet_id', petIds)
          .eq('date', day);
        if (error) { dbgSupabase('fetchDailyCareScores', error); return; }
        const updates: Record<string, number> = {};
        for (const row of (data ?? []) as { pet_id: string; date: string; score: number }[]) {
          updates[`${row.pet_id}:${row.date}`] = row.score;
        }
        set((s) => ({ dailyScores: { ...s.dailyScores, ...updates } }));
        dbg(TAG, 'fetchDailyCareScores ←', Object.keys(updates).length, 'scores');
      } catch (e: any) {
        dbgSupabase('fetchDailyCareScores', { message: e.message });
      }
    });
  },

  saveCareScore: async (petId, species, userId) => {
    const today = todayLocal();
    const state = get();
    const score = Math.round(
      computeCareProgress({
        petId,
        today,
        species,
        checklist:   state.checklist,
        feedingLogs: state.feedingLogs,
        moodLogs:    state.moodLogs,
      }) * 100,
    );
    const key = `${petId}:${today}`;
    set((s) => ({ dailyScores: { ...s.dailyScores, [key]: score } }));
    try {
      const { error } = await supabase
        .from('daily_care_scores')
        .upsert({ pet_id: petId, date: today, score, updated_at: new Date().toISOString() },
          { onConflict: 'pet_id,date' });
      if (error) dbgSupabase('saveCareScore', error);
      else dbg(TAG, 'saveCareScore ←', petId, score);
    } catch (e: any) {
      dbgSupabase('saveCareScore', { message: e.message });
    }
    // Fire care coin awards (non-blocking)
    if (userId) onCareDayComplete(userId, petId, score).catch(() => {});
  },

  // ── Feeds ─────────────────────────────────────────────────────────────────

  fetchFeeds: async (petId) => {
    return dedup(`feeds:${petId}`, async () => {
      dbg(TAG, 'fetchFeeds →', petId);
      // Placeholder — wire up when feed table is defined
      set((s) => ({ feeds: { ...s.feeds, [petId]: s.feeds[petId] ?? [] } }));
    });
  },
});
