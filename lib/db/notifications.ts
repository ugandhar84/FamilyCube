import { supabase } from '@/lib/supabase';
import { useNotifStore } from '@/store/notifStore';

export async function deleteNotifications(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('notification_logs').delete().in('id', ids);
  if (error) throw error;
  // Re-fetch to get accurate count after delete (some deleted may have been unread)
  const { data: { user } } = await supabase.auth.getUser();
  if (user) useNotifStore.getState().fetchUnreadCount(user.id).catch(() => {});
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  // Count how many are actually unread before the update so the decrement is exact.
  const { count: unreadCount } = await supabase
    .from('notification_logs')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('read', false);
  const { error } = await supabase.from('notification_logs').update({ read: true }).in('id', ids);
  if (error) {
    console.error('[notifications] markRead failed:', error.message, error.code);
    // Reconcile badge from DB so it doesn't drift
    const { data: { user } } = await supabase.auth.getUser();
    if (user) useNotifStore.getState().fetchUnreadCount(user.id).catch(() => {});
    return;
  }
  if (unreadCount) useNotifStore.getState().decrement(unreadCount);
}

export async function markNotificationsUnread(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('notification_logs').update({ read: false }).in('id', ids);
  if (error) throw error;
  // Re-fetch for accuracy
  const { data: { user } } = await supabase.auth.getUser();
  if (user) useNotifStore.getState().fetchUnreadCount(user.id).catch(() => {});
}

export async function markAllNotificationsRead(userId: string, types?: string[]): Promise<void> {
  let q = supabase.from('notification_logs').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (types?.length) q = q.in('type', types);
  const { error } = await q;
  if (error) throw error;
  // If marking a subset by type, re-fetch for exact count; otherwise zero out
  if (types?.length) {
    useNotifStore.getState().fetchUnreadCount(userId).catch(() => {});
  } else {
    useNotifStore.getState().setUnreadCount(0);
  }
}
