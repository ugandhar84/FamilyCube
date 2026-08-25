import { supabase } from '@/lib/supabase';
import { useNotifStore } from '@/store/notifStore';
import { useFamilyStore } from '@/store/familyStore';

// Was notification_logs/user_id throughout — that table has zero real
// writers for Family Cube; the actual table (family-notifier's own insert
// target, confirmed via direct query) is `notifications`, scoped by
// member_id. fetchUnreadCount/fetchAll's own userId param is now a no-op
// internally (they resolve the active member id themselves) but kept for
// call-site compatibility, so passing user.id here is harmless — the
// argument is simply ignored downstream.

export async function deleteNotifications(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('notifications').delete().in('id', ids);
  if (error) throw error;
  // Re-fetch to get accurate count after delete (some deleted may have been unread)
  useNotifStore.getState().fetchUnreadCount('').catch(() => {});
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  // Count how many are actually unread before the update so the decrement is exact.
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('read', false);
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', ids);
  if (error) {
    console.error('[notifications] markRead failed:', error.message, error.code);
    // Reconcile badge from DB so it doesn't drift
    useNotifStore.getState().fetchUnreadCount('').catch(() => {});
    return;
  }
  if (unreadCount) useNotifStore.getState().decrement(unreadCount);
}

export async function markNotificationsUnread(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('notifications').update({ read: false }).in('id', ids);
  if (error) throw error;
  // Re-fetch for accuracy
  useNotifStore.getState().fetchUnreadCount('').catch(() => {});
}

export async function markAllNotificationsRead(_userId: string, types?: string[]): Promise<void> {
  const memberId = useFamilyStore.getState().activeMemberId;
  if (!memberId) return;
  let q = supabase.from('notifications').update({ read: true }).eq('member_id', memberId).eq('read', false);
  if (types?.length) q = q.in('type', types);
  const { error } = await q;
  if (error) throw error;
  // If marking a subset by type, re-fetch for exact count; otherwise zero out
  if (types?.length) {
    useNotifStore.getState().fetchUnreadCount('').catch(() => {});
  } else {
    useNotifStore.getState().setUnreadCount(0);
  }
}
