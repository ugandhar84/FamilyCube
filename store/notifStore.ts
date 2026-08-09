import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';
import type { NotificationLog } from '@/lib/types';


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

  fetchUnreadCount: async (userId: string) => {
    const { count } = await supabase
      .from('notification_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    set({ unreadCount: count ?? 0 });
  },

  fetchAll: async (userId: string) => {
    const [countRes, dataRes] = await Promise.all([
      supabase
        .from('notification_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false),
      supabase
        .from('notification_logs')
        .select('id,user_id,type,title,body,data,read,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    const unreadCount = countRes.count ?? 0;
    set({
      unreadCount,
      notifications: (dataRes.data as NotificationLog[]) ?? [],
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
