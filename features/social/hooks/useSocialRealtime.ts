import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { checkVideoVisibility, pauseAllVideos } from '@/lib/videoVisibility';
import type { Post } from '@/features/social/types';

const SOCIAL_NOTIF_TYPES = [
  'playdate_request', 'playdate_accepted', 'playdate_proposal', 'playdate_counter_proposal',
  'chat_message', 'post_like', 'post_comment', 'follow', 'mention', 'family_update', 'new_post',
];

interface Deps {
  activePetId: string | null;
  userId: string | null;
  rtId: string;
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  setSocialUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  loadIncomingRequests: () => Promise<void>;
  loadPlaydateChats: () => Promise<void>;
}

export function useSocialRealtime({
  activePetId, userId, rtId,
  setPosts, setSocialUnreadCount,
  loadIncomingRequests, loadPlaydateChats,
}: Deps) {

  // Feed realtime: new/updated posts and comments
  useEffect(() => {
    if (!activePetId) return;
    let active = true;
    const channel = supabase
      .channel(`social-feed-${activePetId}-${rtId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_posts' },
        async (payload) => {
          if (!payload.new?.is_public) return;
          const { data } = await supabase
            .from('social_posts')
            .select('*, pets(id,name,emoji,accent_color,species,breed,avatar_url,followers_count,owner_id), author:profiles(full_name,handle)')
            .eq('id', payload.new.id).single();
          if (!active || !data) return;
          const newPost: Post = {
            ...data, pet: (data as any).pets, author: (data as any).author,
            liked: false, showComments: false, comments: [], commentsLoaded: false,
          };
          setPosts(prev => prev.some(p => p.id === newPost.id) ? prev : [newPost, ...prev]);
        },
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'social_posts' },
        (payload) => {
          const updatedId = payload.new?.id;
          const updatedAt = payload.new?.updated_at;
          if (!updatedId || !updatedAt) return;
          setPosts(prev => {
            const found = prev.some(p => p.id === updatedId);
            if (!found) return prev;
            const updated = prev.map(p =>
              p.id !== updatedId ? p : {
                ...p, updated_at: updatedAt,
                likes_count: payload.new.likes_count ?? p.likes_count,
                comments_count: payload.new.comments_count ?? p.comments_count,
              },
            );
            return [...updated].sort((a, b) =>
              new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime(),
            );
          });
        },
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments' },
        async (payload) => {
          const postId = payload.new?.post_id;
          if (!postId) return;
          const { data: c } = await supabase
            .from('post_comments')
            .select('*, profiles(full_name, handle, avatar_url), pets(name, emoji, accent_color, avatar_url)')
            .eq('id', payload.new.id).single();
          if (!active || !c || !c.profiles) return;
          const newComment = { ...c, author: c.profiles, pet: c.pets ?? null };
          const bumpedAt = new Date().toISOString();
          setPosts(prev => {
            const updated = prev.map(p => {
              if (p.id !== postId) return p;
              if (!p.commentsLoaded) return { ...p, updated_at: bumpedAt };
              const existing = p.comments ?? [];
              if (existing.some(x => x.id === newComment.id)) return { ...p, updated_at: bumpedAt };
              const optIdx = existing.findIndex(x => x.id?.startsWith('lc_') && x.author_id === newComment.author_id);
              const newComments = optIdx >= 0
                ? existing.map((x, i) => i === optIdx ? newComment : x)
                : [newComment, ...existing];
              return { ...p, comments: newComments, updated_at: bumpedAt };
            });
            return [...updated].sort((a, b) =>
              new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime(),
            );
          });
        },
      )
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [activePetId]);

  // Playdates realtime: requests, chats, notifications
  useEffect(() => {
    if (!userId || !activePetId) return;
    const ch = supabase
      .channel(`social-playdates-rt-${activePetId}-${rtId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'playdate_requests', filter: `from_pet_id=eq.${activePetId}` },
        () => { loadIncomingRequests(); loadPlaydateChats(); },
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'playdate_requests', filter: `to_pet_id=eq.${activePetId}` },
        () => loadIncomingRequests(),
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'playdate_requests', filter: `to_pet_id=eq.${activePetId}` },
        () => { loadIncomingRequests(); loadPlaydateChats(); },
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'playdate_chats', filter: `to_owner_id=eq.${userId}` },
        () => { loadIncomingRequests(); loadPlaydateChats(); },
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'playdate_chats', filter: `to_owner_id=eq.${userId}` },
        () => loadPlaydateChats(),
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'playdate_chats', filter: `from_owner_id=eq.${userId}` },
        () => loadPlaydateChats(),
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_logs', filter: `user_id=eq.${userId}` },
        (p) => {
          const type = (p.new as any)?.type as string | undefined;
          if (type && SOCIAL_NOTIF_TYPES.includes(type)) {
            setSocialUnreadCount(prev => prev + 1);
          }
          if (type?.startsWith('playdate')) { loadIncomingRequests(); loadPlaydateChats(); }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activePetId, loadIncomingRequests, loadPlaydateChats]);

  // Video visibility: pause on blur, resume on focus
  useFocusEffect(useCallback(() => {
    const t = setTimeout(() => checkVideoVisibility(), 300);
    return () => {
      clearTimeout(t);
      pauseAllVideos();
    };
  }, []));

  // AppState: pause when app goes background
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setTimeout(() => checkVideoVisibility(), 300);
      else pauseAllVideos();
    });
    return () => sub.remove();
  }, []);
}
