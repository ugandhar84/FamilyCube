import { supabase } from '@/lib/supabase';

// ── Pet-level follows (primary system) ───────────────────────────────────────

export async function followPet(followerPetId: string, followingPetId: string): Promise<void> {
  const { error } = await supabase.from('pet_follows').upsert(
    { follower_pet_id: followerPetId, following_pet_id: followingPetId },
    { onConflict: 'follower_pet_id,following_pet_id' },
  );
  if (error) throw error;
}

export async function unfollowPet(followerPetId: string, followingPetId: string): Promise<void> {
  const { error } = await supabase.from('pet_follows')
    .delete().eq('follower_pet_id', followerPetId).eq('following_pet_id', followingPetId);
  if (error) throw error;
}

export async function getFollowedPetIds(followerPetId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('pet_follows').select('following_pet_id').eq('follower_pet_id', followerPetId).limit(2000);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.following_pet_id as string);
}

// ── User-level follows (legacy — kept for migration period) ──────────────────

/** IDs of owners this user follows */
export async function getFollowedUserIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('following_user_id')
    .eq('follower_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.following_user_id as string);
}

/** IDs of users who follow this owner */
export async function getFollowerUserIds(ownerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('follower_id')
    .eq('following_user_id', ownerId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.follower_id as string);
}

/** How many users follow this owner */
export async function getFollowerCount(ownerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_follows')
    .select('id', { count: 'exact', head: true })
    .eq('following_user_id', ownerId);
  if (error) throw error;
  return count ?? 0;
}

export async function followUser(followerId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.from('user_follows').upsert(
    { follower_id: followerId, following_user_id: targetUserId },
    { onConflict: 'follower_id,following_user_id' },
  );
  if (error) throw error;
}

export async function unfollowUser(followerId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.from('user_follows')
    .delete().eq('follower_id', followerId).eq('following_user_id', targetUserId);
  if (error) throw error;
}
