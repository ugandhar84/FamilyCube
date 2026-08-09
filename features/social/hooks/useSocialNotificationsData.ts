import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { markNotificationsRead, deleteNotifications } from '@/lib/db';
import { useNotifStore } from '@/store/notifStore';
import { showAlert } from '@/components/AppAlert';
import {
  SOCIAL_TYPES, Notif, MyPet,
  myPetIdFromNotif, navigateForNotif,
} from '@/features/social/components/SocialCard';

const PAGE = 50;

export function useSocialNotificationsData(
  user: any,
  hiddenTypes: Set<string>,
  typeFilter: string,
  petFilter: string | null,
  listRef: React.RefObject<any>,
  chatEnabled: boolean,
) {
  const [notifs,      setNotifs]      = useState<Notif[]>([]);
  const [readIds,     setReadIds]     = useState<Set<string>>(new Set());
  const [myPets,      setMyPets]      = useState<MyPet[]>([]);
  const [chatPetMap,  setChatPetMap]  = useState<Map<string,string>>(new Map());
  const [postPetMap,  setPostPetMap]  = useState<Map<string,string>>(new Map());
  const [actorPetMap, setActorPetMap] = useState<Map<string,{ name: string; emoji: string }>>(new Map());
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef   = useRef<string | null>(null);
  const lastLoadRef = useRef(0);

  const buildMaps = useCallback(async (notifList: Notif[], myIds: Set<string>) => {
    const orphanChatIds  = new Set<string>();
    const orphanPostIds  = new Set<string>();
    const orphanActorIds = new Set<string>();
    for (const n of notifList) {
      const d = n.data ?? {};
      if (!Object.values(d).some(v => typeof v === 'string' && myIds.has(v)) && d.chat_id) orphanChatIds.add(d.chat_id as string);
      if (['post_like', 'post_comment', 'post_comment_reply', 'mention', 'new_post'].includes(n.type) && d.post_id) orphanPostIds.add(d.post_id as string);
      if (!d.actor_name && d.actor_pet_id) orphanActorIds.add(d.actor_pet_id as string);
    }
    const [chatRows, postRows, actorRows] = await Promise.all([
      orphanChatIds.size  ? supabase.from('playdate_chats').select('id,from_owner_id,from_pet_id,to_owner_id,to_pet_id').in('id',[...orphanChatIds]).then(r => r.data ?? []) : Promise.resolve([]),
      orphanPostIds.size  ? supabase.from('social_posts').select('id,pet_id').in('id',[...orphanPostIds]).then(r => r.data ?? []) : Promise.resolve([]),
      orphanActorIds.size ? supabase.from('pets').select('id,name,emoji').in('id',[...orphanActorIds]).then(r => r.data ?? []) : Promise.resolve([]),
    ]);
    const cMap     = new Map<string,string>();
    const pMap     = new Map<string,string>();
    const actorMap = new Map<string,{ name: string; emoji: string }>();
    for (const c of chatRows  as any[]) { const pid = c.from_owner_id === (user?.id ?? '') ? c.from_pet_id : c.to_pet_id; if (pid) cMap.set(c.id, pid); }
    for (const p of postRows  as any[]) { if (p.pet_id && myIds.has(p.pet_id)) pMap.set(p.id, p.pet_id); }
    for (const p of actorRows as any[]) actorMap.set(p.id, { name: p.name, emoji: p.emoji });
    return { cMap, pMap, actorMap };
  }, [user?.id]);

  const load = useCallback(async (spinner = true) => {
    if (!user) return;
    if (spinner && notifs.length === 0) setLoading(true);
    const [{ data: nData }, { data: pData }] = await Promise.all([
      supabase.from('notification_logs').select('id,user_id,type,title,body,data,read,created_at').eq('user_id', user.id).in('type', SOCIAL_TYPES).order('created_at', { ascending: false }).limit(PAGE),
      supabase.from('pets').select('id,name,emoji,accent_color,avatar_url').eq('owner_id', user.id),
    ]);
    const pets      = (pData as MyPet[]) ?? [];
    const notifList = (nData as Notif[]) ?? [];
    const myIds     = new Set(pets.map(p => p.id));
    const { cMap, pMap, actorMap } = await buildMaps(notifList, myIds);
    cursorRef.current = notifList.length > 0 ? notifList[notifList.length - 1].created_at : null;
    setHasMore(notifList.length === PAGE);
    setNotifs(notifList);
    setMyPets(pets);
    setChatPetMap(cMap); setPostPetMap(pMap); setActorPetMap(actorMap);
    setReadIds(prev => {
      if (!prev.size) return prev;
      const keep = new Set([...prev].filter(id => notifList.some(r => r.id === id && !r.read)));
      return keep.size !== prev.size ? keep : prev;
    });
    lastLoadRef.current = Date.now();
    setLoading(false); setRefreshing(false);
  }, [user?.id, buildMaps]);

  const loadMore = useCallback(async () => {
    if (!user || !hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    const { data: nData } = await supabase.from('notification_logs').select('id,user_id,type,title,body,data,read,created_at').eq('user_id', user.id).in('type', SOCIAL_TYPES).order('created_at', { ascending: false }).lt('created_at', cursorRef.current!).limit(PAGE);
    const newNotifs = (nData as Notif[]) ?? [];
    if (newNotifs.length) cursorRef.current = newNotifs[newNotifs.length - 1].created_at;
    setHasMore(newNotifs.length === PAGE);
    const myIds = new Set(myPets.map(p => p.id));
    const { cMap, pMap, actorMap } = await buildMaps(newNotifs, myIds);
    setNotifs(prev => { const seen = new Set(prev.map(n => n.id)); return [...prev, ...newNotifs.filter(n => !seen.has(n.id))]; });
    setChatPetMap(prev => new Map([...prev, ...cMap]));
    setPostPetMap(prev => new Map([...prev, ...pMap]));
    setActorPetMap(prev => new Map([...prev, ...actorMap]));
    setLoadingMore(false);
  }, [user?.id, hasMore, loadingMore, myPets, buildMaps]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    if (Date.now() - lastLoadRef.current < 60_000) return;
    load(false);
  }, [load]));

  const unreadCountStore = useNotifStore(s => s.unreadCount);
  const prevUnreadRef = useRef(unreadCountStore);
  useEffect(() => {
    if (unreadCountStore > prevUnreadRef.current) { prevUnreadRef.current = unreadCountStore; load(false); }
    else prevUnreadRef.current = unreadCountStore;
  }, [unreadCountStore, load]);

  const myPetIdSet = useMemo(() => new Set(myPets.map(p => p.id)), [myPets]);

  const filtered = useMemo(() => {
    let list = notifs.filter(n => !hiddenTypes.has(n.type));
    if (typeFilter !== 'all') list = typeFilter === 'playdate' ? list.filter(n => n.type.startsWith('playdate')) : list.filter(n => n.type === typeFilter);
    if (petFilter) list = list.filter(n => myPetIdFromNotif(n, myPetIdSet, chatPetMap, postPetMap) === petFilter);
    return list;
  }, [notifs, typeFilter, petFilter, myPetIdSet, chatPetMap, postPetMap, hiddenTypes]);

  const typeCounts = useMemo(() => {
    const c: Record<string,number> = { all: 0 };
    for (const n of notifs) {
      if (n.read || readIds.has(n.id)) continue;
      c['all']++;
      const b = n.type.startsWith('playdate') ? 'playdate' : n.type;
      c[b] = (c[b] ?? 0) + 1;
    }
    return c;
  }, [notifs, readIds]);

  const myPetCounts = useMemo(() => {
    const c: Record<string,number> = {};
    for (const n of notifs) {
      if (n.read || readIds.has(n.id)) continue;
      const pid = myPetIdFromNotif(n, myPetIdSet, chatPetMap, postPetMap);
      if (pid) c[pid] = (c[pid] ?? 0) + 1;
    }
    return c;
  }, [notifs, readIds, myPetIdSet, chatPetMap, postPetMap]);

  const allIds = useMemo(() => filtered.map(n => n.id), [filtered]);

  // ── Data mutations ─────────────────────────────────────────────────────────

  const markRead = useCallback((ids: string[]) => {
    setReadIds(prev => new Set([...prev, ...ids]));
    markNotificationsRead(ids);
  }, []);

  const markAllRead = useCallback(async () => {
    const ids = notifs.filter(n => !n.read && !readIds.has(n.id)).map(n => n.id);
    if (!ids.length) return;
    markRead(ids);
  }, [notifs, readIds, markRead]);

  const removeNotifs = useCallback((ids: string[]) => {
    setNotifs(prev => prev.filter(n => !ids.includes(n.id)));
    deleteNotifications(ids);
  }, []);

  const openNotif = useCallback((n: Notif) => {
    if (!n.read && !readIds.has(n.id)) markRead([n.id]);
    navigateForNotif(n, chatEnabled);
  }, [readIds, chatEnabled, markRead]);

  const confirmDelete = useCallback((selectedIds: Set<string>, onDone: () => void) => {
    if (!selectedIds.size) return;
    showAlert('Delete notifications', `Remove ${selectedIds.size} notification${selectedIds.size > 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { removeNotifs([...selectedIds]); onDone(); } },
    ]);
  }, [removeNotifs]);

  return {
    notifs, readIds, myPets, chatPetMap, postPetMap, actorPetMap,
    loading, refreshing, setRefreshing, hasMore, loadingMore,
    filtered, typeCounts, myPetCounts, allIds, myPetIdSet,
    totalUnread: typeCounts['all'] ?? 0,
    load, loadMore,
    markRead, markAllRead, removeNotifs, openNotif, confirmDelete,
  };
}
