/**
 * Supabase Realtime subscriptions for high-frequency tables.
 *
 * Covers feeding_logs, daily_checklist, grooming_logs, appointments, and vaccines —
 * the tables that family members mutate concurrently. When a change arrives the
 * Zustand store is patched in-place so every subscriber re-renders immediately
 * without a manual pull-to-refresh or page reload.
 *
 * One Supabase channel per pet (key "daily:<petId>") multiplexes all five table
 * listeners. A guard prevents duplicate subscriptions if the calling component
 * re-mounts before the previous cleanup runs.
 *
 * Usage:
 *   subscribeToDaily(petId)         — call on mount or active-pet change
 *   unsubscribeFromDaily(petId)     — call on unmount or active-pet change cleanup
 *   unsubscribeAll()                — call on sign-out so the channel map is cleared
 */

import { supabase } from './supabase';
import { usePetStore } from '@/store/petStore';

const _channels = new Map<string, ReturnType<typeof supabase.channel>>();

// ─── feeding_logs ─────────────────────────────────────────────────────────────
// INSERT triggers a re-fetch rather than a direct store prepend because the row
// needs a profiles join (fed_by name + avatar) that the raw payload doesn't carry.
// UPDATE and DELETE are handled in-place using the petId:date composite store key.

function handleFeedingChange(petId: string, payload: any) {
  const { eventType, new: next, old } = payload;
  const store = usePetStore.getState();

  if (eventType === 'INSERT') {
    const date: string = next?.date;
    if (!date) return;
    // Optimistically prepend the raw row so it appears in Done immediately,
    // then re-fetch in the background to fill in the profiles join (fed_by name/avatar).
    // Dedup check prevents a double-prepend if addFeedingLog already added it.
    usePetStore.setState(s => {
      const key = `${petId}:${date}`;
      const cur = s.feedingLogs[key] ?? [];
      if (cur.some((f: any) => f.id === next.id)) {
        // Row already in store (optimistic from addFeedingLog) — just refresh profiles join
        setTimeout(() => store.fetchFeedingLogs(petId, date), 500);
        return {};
      }
      // Family member's insert — prepend then background-refresh for profiles join
      setTimeout(() => store.fetchFeedingLogs(petId, date), 500);
      return { feedingLogs: { ...s.feedingLogs, [key]: [next, ...cur] } };
    });
    return;
  }

  const rec = eventType === 'DELETE' ? old : next;
  const date: string = rec?.date;
  if (!date) return;
  const key = `${petId}:${date}`;

  if (eventType === 'UPDATE') {
    usePetStore.setState(s => {
      const cur = s.feedingLogs[key] ?? [];
      return { feedingLogs: { ...s.feedingLogs, [key]: cur.map((f: any) => f.id === next.id ? { ...f, ...next } : f) } };
    });
  } else if (eventType === 'DELETE') {
    usePetStore.setState(s => {
      const cur = s.feedingLogs[key] ?? [];
      return { feedingLogs: { ...s.feedingLogs, [key]: cur.filter((f: any) => f.id !== old.id) } };
    });
  }
}

// ─── daily_checklist ─────────────────────────────────────────────────────────
// No joins needed — all required fields are on the row itself.
// INSERT deduplicates against the optimistic update so toggling never appears twice.

function handleChecklistChange(petId: string, payload: any) {
  const { eventType, new: next, old } = payload;

  if (eventType === 'INSERT') {
    usePetStore.setState(s => {
      const cur = s.checklist[petId] ?? [];
      if (cur.some((i: any) => i.id === next.id)) {
        // Row already added optimistically — background refetch to sync completed_by profile join
        setTimeout(() => usePetStore.getState().fetchChecklist?.(petId, next.date), 500);
        return {};
      }
      return { checklist: { ...s.checklist, [petId]: [...cur, next] } };
    });
  } else if (eventType === 'UPDATE') {
    usePetStore.setState(s => {
      const cur = s.checklist[petId] ?? [];
      return { checklist: { ...s.checklist, [petId]: cur.map((i: any) => i.id === next.id ? { ...i, ...next } : i) } };
    });
  } else if (eventType === 'DELETE') {
    usePetStore.setState(s => {
      const cur = s.checklist[petId] ?? [];
      return { checklist: { ...s.checklist, [petId]: cur.filter((i: any) => i.id !== old.id) } };
    });
  }
}

// ─── grooming_logs ────────────────────────────────────────────────────────────

function handleGroomingChange(petId: string, payload: any) {
  const { eventType, new: next, old } = payload;

  if (eventType === 'INSERT') {
    usePetStore.setState(s => {
      const cur = s.groomingLogs[petId] ?? [];
      if (cur.some((g: any) => g.id === next.id)) return {};
      return { groomingLogs: { ...s.groomingLogs, [petId]: [next, ...cur] } };
    });
  } else if (eventType === 'UPDATE') {
    usePetStore.setState(s => {
      const cur = s.groomingLogs[petId] ?? [];
      return { groomingLogs: { ...s.groomingLogs, [petId]: cur.map((g: any) => g.id === next.id ? { ...g, ...next } : g) } };
    });
  } else if (eventType === 'DELETE') {
    usePetStore.setState(s => {
      const cur = s.groomingLogs[petId] ?? [];
      return { groomingLogs: { ...s.groomingLogs, [petId]: cur.filter((g: any) => g.id !== old.id) } };
    });
  }
}

// ─── appointments ─────────────────────────────────────────────────────────────

function handleAppointmentChange(petId: string, payload: any) {
  const { eventType, new: next, old } = payload;

  if (eventType === 'INSERT') {
    usePetStore.setState(s => {
      const cur = s.appointments[petId] ?? [];
      if (cur.some((a: any) => a.id === next.id)) return {};
      return { appointments: { ...s.appointments, [petId]: [...cur, next].sort((a: any, b: any) => a.scheduled_at < b.scheduled_at ? -1 : 1) } };
    });
  } else if (eventType === 'UPDATE') {
    usePetStore.setState(s => {
      const cur = s.appointments[petId] ?? [];
      // Remove if no longer upcoming (cancelled / completed)
      const updated = cur
        .map((a: any) => a.id === next.id ? { ...a, ...next } : a)
        .filter((a: any) => a.status === 'upcoming');
      return { appointments: { ...s.appointments, [petId]: updated } };
    });
  } else if (eventType === 'DELETE') {
    usePetStore.setState(s => {
      const cur = s.appointments[petId] ?? [];
      return { appointments: { ...s.appointments, [petId]: cur.filter((a: any) => a.id !== old.id) } };
    });
  }
}

// ─── vaccines ─────────────────────────────────────────────────────────────────
// Always triggers a full re-fetch rather than patching in-place because
// days_until_due and status are computed client-side from next_due at fetch time
// and cannot be cheaply derived from the raw realtime payload.

function handleVaccineChange(petId: string) {
  usePetStore.getState().fetchVaccines(petId);
}

// ─── mood_logs ────────────────────────────────────────────────────────────────
// Patch in-place; INSERT deduplicates against any optimistic update.
// The raw payload carries all required fields (no joins needed for TodayScreen).

function handleMoodChange(petId: string, payload: any) {
  const { eventType, new: next, old } = payload;

  if (eventType === 'INSERT') {
    usePetStore.setState(s => {
      const cur = s.moodLogs[petId] ?? [];
      if (cur.some((m: any) => m.id === next.id)) return {};
      return { moodLogs: { ...s.moodLogs, [petId]: [next, ...cur] } };
    });
  } else if (eventType === 'UPDATE') {
    usePetStore.setState(s => {
      const cur = s.moodLogs[petId] ?? [];
      return { moodLogs: { ...s.moodLogs, [petId]: cur.map((m: any) => m.id === next.id ? { ...m, ...next } : m) } };
    });
  } else if (eventType === 'DELETE') {
    usePetStore.setState(s => {
      const cur = s.moodLogs[petId] ?? [];
      return { moodLogs: { ...s.moodLogs, [petId]: cur.filter((m: any) => m.id !== old.id) } };
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function _buildChannel(petId: string) {
  const key = `daily:${petId}`;
  return supabase.channel(key)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feeding_logs',    filter: `pet_id=eq.${petId}` }, (p) => handleFeedingChange(petId, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_checklist', filter: `pet_id=eq.${petId}` }, (p) => handleChecklistChange(petId, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grooming_logs',   filter: `pet_id=eq.${petId}` }, (p) => handleGroomingChange(petId, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mood_logs',       filter: `pet_id=eq.${petId}` }, (p) => handleMoodChange(petId, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments',    filter: `pet_id=eq.${petId}` }, (p) => handleAppointmentChange(petId, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vaccines',        filter: `pet_id=eq.${petId}` }, () => handleVaccineChange(petId))
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Channel dropped — remove stale entry and resubscribe after a short delay
        _channels.delete(key);
        setTimeout(() => { if (!_channels.has(key)) subscribeToDaily(petId); }, 2_000);
      }
    });
}

export function subscribeToDaily(petId: string) {
  const key = `daily:${petId}`;
  if (_channels.has(key)) return; // already subscribed
  _channels.set(key, _buildChannel(petId));
}

export function unsubscribeFromDaily(petId: string) {
  const key = `daily:${petId}`;
  const ch = _channels.get(key);
  if (ch) { supabase.removeChannel(ch); _channels.delete(key); }
}

export function unsubscribeAll() {
  for (const ch of _channels.values()) supabase.removeChannel(ch);
  _channels.clear();
}
