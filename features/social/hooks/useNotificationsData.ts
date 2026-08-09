import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { format, parseISO, isToday, isYesterday, isThisWeek, differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { markNotificationsRead, markNotificationsUnread, deleteNotifications, markAllNotificationsRead } from '@/lib/db';
import { upsertChecklistItem, insertFeedingLog } from '@/lib/db/daily';
import { useNotifStore } from '@/store/notifStore';
import { usePetStore } from '@/store/petStore';
import { useShallow } from 'zustand/react/shallow';
import { useRouter } from 'expo-router';
import { savePetNote } from '@/lib/db/journal';
import { ALERT_NAV } from '@/features/social/components/NotifCard';
import type { NotificationLog } from '@/lib/types';


export type FlatItem =
  | { kind: 'header'; title: string }
  | { kind: 'notif'; item: NotificationLog };

function dateGroup(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d))     return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    if (isThisWeek(d))  return 'This Week';
    if (differenceInCalendarDays(new Date(), d) <= 30) return 'This Month';
    return format(d, 'MMMM yyyy');
  } catch { return 'Earlier'; }
}

export function useNotificationsData(
  user: any,
  hiddenTypes: Set<string>,
  petFilter: string,
  listRef: React.RefObject<any>,
  dateFilter: string = 'all',
) {
  const router = useRouter();
  const { pets } = usePetStore(useShallow(s => ({ pets: s.pets })));
  const cachedNotifs   = useNotifStore(s => s.notifications);
  const markCachedRead = useNotifStore(s => s.markCachedRead);

  const [notifs,      setNotifs]      = useState<NotificationLog[]>(cachedNotifs ?? []);
  const [readIds,     setReadIds]     = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading,     setLoading]     = useState(cachedNotifs === null);
  const [refreshing,  setRefreshing]  = useState(false);
  const lastLoadRef = useRef(0);

  const load = useCallback(async (showSpinner = true) => {
    if (!user) return;
    if (showSpinner && notifs.length === 0) setLoading(true);
    const { data, error } = await supabase
      .from('notification_logs')
      .select('id,user_id,type,title,body,data,read,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error && error.code !== 'PGRST205') console.warn('notifications:load', error);
    const rows = (data as NotificationLog[]) ?? [];
    lastLoadRef.current = Date.now();
    setNotifs(rows);
    useNotifStore.setState({ notifications: rows });
    setReadIds(prev => {
      if (!prev.size) return prev;
      const keep = new Set([...prev].filter(id => rows.some(r => r.id === id && !r.read)));
      return keep.size !== prev.size ? keep : prev;
    });
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (cachedNotifs && cachedNotifs !== notifs) setNotifs(cachedNotifs);
  }, [cachedNotifs]);

  // Direct realtime subscription for the notifications screen — prepends new rows
  // instantly without waiting for the global store bridge or a pull-to-refresh.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notif-screen-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_logs', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotificationLog;
          setNotifs(prev => {
            if (prev.some(n => n.id === row.id)) return prev; // already prepended via store bridge
            return [row, ...prev];
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    if (Date.now() - lastLoadRef.current > 10_000) load(false);
  }, [load]));

  const ORDER = ['Today','Yesterday','This Week','This Month'];

  const availableGroups = useMemo(() => {
    let list = notifs.filter(n => !hiddenTypes.has(n.type));
    if (petFilter !== 'all') list = list.filter(n => (n.data as any)?.pet_id === petFilter);
    const seen = new Set<string>();
    for (const n of list) seen.add(dateGroup(n.created_at));
    return [...seen].sort((a, b) => {
      const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      return ai !== -1 ? -1 : bi !== -1 ? 1 : 0;
    });
  }, [notifs, petFilter, hiddenTypes]);

  const sections = useMemo(() => {
    let list = notifs.filter(n => !hiddenTypes.has(n.type));
    if (petFilter !== 'all') list = list.filter(n => (n.data as any)?.pet_id === petFilter);
    if (dateFilter !== 'all') list = list.filter(n => dateGroup(n.created_at) === dateFilter);
    const groups: Record<string, NotificationLog[]> = {};
    for (const n of list) { const g = dateGroup(n.created_at); (groups[g] ??= []).push(n); }
    return Object.keys(groups)
      .sort((a, b) => { const ai = ORDER.indexOf(a), bi = ORDER.indexOf(b); if (ai !== -1 && bi !== -1) return ai - bi; return ai !== -1 ? -1 : bi !== -1 ? 1 : 0; })
      .map(k => ({ title: k, data: groups[k] }));
  }, [notifs, petFilter, dateFilter, hiddenTypes]);

  const allIds = useMemo(() => sections.flatMap(s => s.data.map(n => n.id)), [sections]);

  const unreadCount = useMemo(
    () => sections.flatMap(s => s.data).filter(n => !n.read && !readIds.has(n.id)).length,
    [sections, readIds],
  );

  const flatItems = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const s of sections) {
      out.push({ kind: 'header', title: s.title });
      for (const n of s.data) out.push({ kind: 'notif', item: n });
    }
    return out;
  }, [sections]);

  // ── Data mutations ─────────────────────────────────────────────────────────

  const markRead = useCallback(async (ids: string[]) => {
    setReadIds(prev => new Set([...prev, ...ids]));
    await markNotificationsRead(ids);
    markCachedRead(ids);
  }, []);

  const markUnread = useCallback((ids: string[]) => {
    setReadIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    setNotifs(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: false } : n));
    markNotificationsUnread(ids);
  }, []);

  const removeNotifs = useCallback((ids: string[]) => {
    setNotifs(prev => prev.filter(n => !ids.includes(n.id)));
    useNotifStore.getState().removeCachedNotifs(ids);
    deleteNotifications(ids);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const unreadIds = notifs.filter(n => !n.read).map(n => n.id);
    setReadIds(prev => new Set([...prev, ...unreadIds]));
    markCachedRead(unreadIds);
    await markAllNotificationsRead(user.id);
  }, [user?.id, notifs]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const openNotif = useCallback((item: NotificationLog) => {
    if (!item.read && !readIds.has(item.id)) markRead([item.id]);
    if (item.type === 'lost_alert' || item.type === 'pet_found') {
      toggleExpanded(item.id);
    } else {
      const d = item.data as any;
      if (d?.pet_id) usePetStore.getState().setActivePet(d.pet_id);
      if (item.type === 'feeding_reminder' || item.type === 'walk_reminder') {
        router.push({ pathname: '/(tabs)/care', params: { section: 'daily' } } as any);
      } else if (item.type === 'birthday_notif' || item.type === 'memorial_notif') {
        router.push({ pathname: '/(tabs)/care', params: { section: 'notes' } } as any);
      } else if (item.type === 'family_update') {
        router.push({ pathname: '/(tabs)/connect', params: { tab: 'Family' } } as any);
      } else if (['post_like', 'post_comment', 'post_comment_reply', 'mention', 'new_post'].includes(item.type)) {
        const openComments = ['post_comment', 'post_comment_reply', 'mention'].includes(item.type) ? '1' : '0';
        if (d?.post_id) {
          const focusId = d?.comment_id ?? (item.type === 'post_comment_reply' ? d?.reply_to_comment_id : null);
          router.push({ pathname: '/post/[id]', params: { id: d.post_id, open_comments: openComments, ...(focusId ? { focus_comment_id: focusId } : {}) } } as any);
        } else if (d?.actor_pet_id) {
          router.push({ pathname: '/pet/[id]', params: { id: d.actor_pet_id } } as any);
        } else {
          router.push('/(tabs)/social-notifications' as any);
        }
      } else if (item.type === 'follow') {
        if (d?.actor_pet_id) {
          router.push({ pathname: '/pet/[id]', params: { id: d.actor_pet_id } } as any);
        } else {
          router.push('/(tabs)/social-notifications' as any);
        }
      } else if (item.type?.startsWith('playdate')) {
        const reqId = d?.request_id;
        const chatId = d?.chat_id;
        if (chatId) {
          router.push({ pathname: '/playdate-chat/[chatId]', params: { chatId } } as any);
        } else if (reqId) {
          router.push({ pathname: '/playdate/[id]', params: { id: reqId } } as any);
        } else {
          router.push('/my-playdates' as any);
        }
      } else if (ALERT_NAV[item.type]) {
        router.push(ALERT_NAV[item.type] as any);
      } else {
        router.push('/(tabs)/notifications' as any);
      }
    }
  }, [readIds, router]);

  // Tracks in-flight care actions to prevent double-taps producing duplicate writes
  const pendingCareIds = useRef<Set<string>>(new Set());

  const handleCareAction = useCallback(async (item: NotificationLog, markDoneInline: boolean) => {
    if (pendingCareIds.current.has(item.id)) return;

    if (!item.read && !readIds.has(item.id)) markRead([item.id]);
    const petId = (item.data as any)?.pet_id ?? pets[0]?.id;
    if (petId) usePetStore.getState().setActivePet(petId);

    if (!markDoneInline || item.type === 'mood_reminder') {
      router.push(item.type === 'mood_reminder'
        ? '/ai/mood-camera' as any
        : { pathname: '/(tabs)/care', params: { section: 'today' } } as any);
      return;
    }

    if (!petId || !user?.id) return;

    pendingCareIds.current.add(item.id);
    // Remove from local state AND DB immediately so it never comes back on the next load()
    removeNotifs([item.id]);

    try {
      const notifDate  = parseISO(item.created_at);
      const isOldNotif = !isToday(notifDate);
      const today      = format(new Date(), 'yyyy-MM-dd');
      if (isOldNotif) {
        const dayLabel = format(notifDate, 'EEE MMM d');
        const activity = item.type === 'walk_reminder' ? 'walk' : 'feeding';
        await savePetNote(petId, user.id, `${activity === 'walk' ? '🦮' : '🍽️'} ${activity.charAt(0).toUpperCase() + activity.slice(1)} logged (from missed reminder on ${dayLabel})`);
      } else if (item.type === 'walk_reminder') {
        await upsertChecklistItem({ pet_id: petId, date: today, type: 'walk', label: 'Walk', completed: true, completed_by: user.id, completed_at: new Date().toISOString() });
      } else if (item.type === 'feeding_reminder') {
        const h = new Date().getHours();
        const meal_type = h < 11 ? 'breakfast' : h < 15 ? 'lunch' : 'dinner';
        // Guard: only insert if no feeding log for this pet/date/meal already exists
        const { count } = await supabase
          .from('feeding_logs')
          .select('id', { count: 'exact', head: true })
          .eq('pet_id', petId)
          .eq('date', today)
          .eq('meal_type', meal_type);
        if ((count ?? 0) === 0) {
          await insertFeedingLog({ pet_id: petId, fed_by: user.id, meal_type, date: today, fed_at: new Date().toISOString() });
        }
      }
    } catch { /* care write failed — notification already removed, that's fine */ }
    finally {
      pendingCareIds.current.delete(item.id);
    }
  }, [readIds, pets, user?.id, router, markRead, removeNotifs]);

  return {
    notifs, readIds, expandedIds, loading, refreshing, setRefreshing,
    sections, flatItems, allIds, unreadCount, pets, availableGroups,
    load, markRead, markUnread, removeNotifs, markAllRead, openNotif, handleCareAction,
  };
}
