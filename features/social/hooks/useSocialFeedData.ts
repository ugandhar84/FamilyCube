import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFollowedPetIds } from '@/lib/db/follows';

export function useSocialFeedData(userId: string | null, activePetId: string | null) {
  const [followedPetIds, setFollowedPetIds] = useState<Set<string>>(new Set());
  const [pinnedPostIds, setPinnedPostIds] = useState<Set<string>>(new Set());
  const [freshFollowersCount, setFreshFollowersCount] = useState<number | null>(null);
  const [freshFollowingCount, setFreshFollowingCount] = useState<number | null>(null);

  const loadFollows = useCallback(async (_uid: string, petId?: string) => {
    const pid = petId ?? activePetId;
    if (!pid) return;
    const ids = await getFollowedPetIds(pid).catch(() => []);
    setFollowedPetIds(new Set(ids));
    setFreshFollowingCount(ids.length);
  }, [activePetId]);

  const loadFollowerCount = useCallback(async (_uid: string, petId?: string) => {
    const pid = petId ?? activePetId;
    if (!pid) return;
    const { count } = await supabase
      .from('pet_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_pet_id', pid);
    if (count !== null) setFreshFollowersCount(count);
  }, [activePetId]);

  const loadPins = useCallback(async (uid: string) => {
    const { data } = await supabase.from('post_pins').select('post_id').eq('user_id', uid).limit(500);
    if (data) setPinnedPostIds(new Set<string>(data.map((r: any) => r.post_id)));
  }, []);

  const togglePin = useCallback(async (postId: string) => {
    if (!userId) return;
    const isPinned = pinnedPostIds.has(postId);
    setPinnedPostIds(prev => {
      const next = new Set(prev);
      if (isPinned) next.delete(postId); else next.add(postId);
      return next;
    });
    if (isPinned) {
      await supabase.from('post_pins').delete().eq('user_id', userId).eq('post_id', postId);
    } else {
      await supabase.from('post_pins').upsert({ user_id: userId, post_id: postId }, { onConflict: 'user_id,post_id' });
    }
  }, [userId, pinnedPostIds]);

  return {
    followedPetIds, pinnedPostIds,
    freshFollowersCount, freshFollowingCount,
    setFreshFollowersCount, setFreshFollowingCount,
    loadFollows, loadFollowerCount, loadPins, togglePin,
  };
}
