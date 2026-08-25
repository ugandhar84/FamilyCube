import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';
import type { NotificationLog } from '@/lib/types';
import { useFamilyStore } from '@/store/familyStore';

// Was querying notification_logs by user_id — that table has zero writers
// for real Family Cube notifications (confirmed: always empty). Every real
// quest/chore/reward/help/kid-request/grocery notification is actually
// written by family-notifier to the separate `notifications` table, keyed
// by member_id, not user_id — the panel/badge was reading a permanently
// empty table the whole time (live-reported: "i didn't see anything under
// the notification screen"). Keeps the external fetchAll(userId)/
// fetchUnreadCount(userId) signatures unchanged (many call sites) — userId
// is now unused internally, the active member id is resolved here instead.
function rowToNotificationLog(r: any): NotificationLog {
  return {
    id: r.id,
    user_id: r.member_id ?? '',
    type: r.type,
    title: r.title,
    body: r.body ?? r.message ?? '',
    data: r.data ?? r.meta ?? {},
    read: r.read ?? false,
    created_at: r.created_at ?? r.timestamp,
  };
}


interface NotifState {
  unreadCount: number;
  /** Cached alert notifications (non-social). Null = not yet fetched. */
  notifications: NotificationLog[] | null;
  setUnreadCount: (n: number) => void;
  increment: () => void;
  decrement: (by?: number) => void;
  reset: () => void;
  fetchUnreadCount: (userId: string) => Promise<void>;
  /** Fetch both count + rows in a single pass. Called on login / foreground. */
  fetchAll: (userId: string) => Promise<void>;
  /** Mark local cached rows as read (optimistic). */
  markCachedRead: (ids: string[]) => void;
  /** Prepend a new row (realtime INSERT). */
  prependNotification: (row: NotificationLog) => void;
  /** Remove rows from the cache (after delete). */
  removeCachedNotifs: (ids: string[]) => void;
}

export const useNotifStore = create<NotifState>((set, get) => ({
  unreadCount: 0,
  notifications: null,

  setUnreadCount: (n) => set({ unreadCount: Math.max(0, n) }),

  increment: () => {
    const next = get().unreadCount + 1;
    set({ unreadCount: next });
    Notifications.setBadgeCountAsync(next).catch(() => {});
  },

  decrement: (by = 1) => {
    const next = Math.max(0, get().unreadCount - by);
    set({ unreadCount: next });
    Notifications.setBadgeCountAsync(next).catch(() => {});
  },

  reset: () => set({ unreadCount: 0, notifications: null }),

  fetchUnreadCount: async (_userId: string) => {
    const memberId = useFamilyStore.getState().activeMemberId;
    if (!memberId) { set({ unreadCount: 0 }); return; }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('read', false);
    set({ unreadCount: count ?? 0 });
  },

  fetchAll: async (_userId: string) => {
    const memberId = useFamilyStore.getState().activeMemberId;
    if (!memberId) { set({ unreadCount: 0, notifications: [] }); return; }
    const [countRes, dataRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', memberId)
        .eq('read', false),
      supabase
        .from('notifications')
        .select('id,member_id,type,title,body,message,data,meta,read,created_at,timestamp')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    const unreadCount = countRes.count ?? 0;
    set({
      unreadCount,
      notifications: (dataRes.data ?? []).map(rowToNotificationLog),
    });
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  },

  markCachedRead: (ids: string[]) => {
    const idSet = new Set(ids);
    const prev = get().notifications;
    if (!prev) return;
    set({
      notifications: prev.map(n => idSet.has(n.id) ? { ...n, read: true } : n),
    });
  },

  prependNotification: (row: NotificationLog) => {
    const prev = get().notifications ?? [];
    set({ notifications: [row, ...prev] });
  },

  removeCachedNotifs: (ids: string[]) => {
    const idSet = new Set(ids);
    const prev = get().notifications;
    if (!prev) return;
    set({ notifications: prev.filter(n => !idSet.has(n.id)) });
  },
}));
