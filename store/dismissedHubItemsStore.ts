/**
 * dismissedHubItemsStore — DB-backed dismiss state for the Kid Hub's
 * "Needs You" list (see supabase/migrations/20260925010000_dismissed_hub_items.sql).
 *
 * Replaces KidView.tsx's old dismissedReplies/dismissedActions/
 * dismissedRideIds — three separate useState<Set<string>> + AsyncStorage
 * pairs, device-local only. This is a real table now: dismissals survive a
 * reinstall and sync across a shared/second device.
 *
 * Deliberately its own small table/store, not a column on members —
 * dismissals are an unbounded append-only set of item ids, not a single
 * per-member preference value like notification_prefs, so it doesn't fit
 * familyStore.ts's fromRow/toRow-on-members pattern.
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface DismissedHubItemsState {
  memberId: string | null;
  dismissedIds: Set<string>;
  loaded: boolean;
  // Loads this member's dismissed item ids. Safe to call again on member
  // switch — resets local state first so a second kid on a shared device
  // never briefly sees the previous kid's dismissals.
  load: (memberId: string) => Promise<void>;
  // Optimistic: updates local state immediately so the banner/row
  // disappears instantly, then writes through to the DB in the background.
  dismissItem: (itemId: string) => void;
}

export const useDismissedHubItemsStore = create<DismissedHubItemsState>((set, get) => ({
  memberId: null,
  dismissedIds: new Set(),
  loaded: false,

  load: async (memberId: string) => {
    if (get().memberId === memberId && get().loaded) return; // already loaded for this member
    set({ memberId, dismissedIds: new Set(), loaded: false });
    const { data, error } = await supabase
      .from('dismissed_hub_items')
      .select('item_id')
      .eq('member_id', memberId);
    if (error) {
      console.warn('[dismissedHubItemsStore] load failed', error.message);
      set({ loaded: true });
      return;
    }
    // Member may have switched again while this request was in flight.
    if (get().memberId !== memberId) return;
    set({ dismissedIds: new Set((data ?? []).map(r => r.item_id as string)), loaded: true });
  },

  dismissItem: (itemId: string) => {
    const { memberId, dismissedIds } = get();
    if (!memberId || dismissedIds.has(itemId)) return;
    set({ dismissedIds: new Set([...dismissedIds, itemId]) });
    supabase
      .from('dismissed_hub_items')
      .insert({ member_id: memberId, item_id: itemId })
      .then(({ error }) => {
        // unique(member_id, item_id) — a duplicate insert (double-tap,
        // race with another device) is expected and harmless; anything
        // else is worth a warning since the dismissal silently won't
        // survive a reinstall/second device if the write never lands.
        if (error && error.code !== '23505') {
          console.warn('[dismissedHubItemsStore] dismiss write failed', error.message);
        }
      });
  },
}));
