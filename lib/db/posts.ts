import { supabase } from '@/lib/supabase';

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function createPost(payload: {
  pet_id: string; author_id: string; caption?: string | null;
  photo_url?: string | null; is_public: boolean;
  media_type?: 'photo' | 'video'; video_url?: string | null; video_thumbnail_url?: string | null;
}) {
  const { data, error } = await supabase.from('social_posts').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updatePost(id: string, payload: {
  caption?: string | null; photo_url?: string | null;
  media_type?: 'photo' | 'video'; video_url?: string | null; video_thumbnail_url?: string | null;
}) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('social_posts')
    .update({ ...payload, is_edited: true, edited_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePost(postId: string, authorId: string): Promise<void> {
  const { error } = await supabase.from('social_posts')
    .delete().eq('id', postId).eq('author_id', authorId);
  if (error) throw error;
}

export async function incrementLikes(postId: string, delta: 1 | -1): Promise<void> {
  const { error } = await supabase.rpc('increment_post_likes', { p_post_id: postId, p_delta: delta });
  if (error) throw error;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(postId: string, limit = 30) {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id,post_id,author_id,pet_id,body,created_at,profiles(full_name,handle,avatar_url),pets(name,emoji,accent_color,avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function addComment(payload: {
  post_id: string; author_id: string; pet_id: string; body: string;
}) {
  const { data, error } = await supabase.from('post_comments').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id: string, userId: string): Promise<void> {
  const { error } = await supabase.from('post_comments').delete()
    .eq('id', id)
    .eq('author_id', userId);
  if (error) throw error;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function insertNotification(payload: {
  user_id: string; title: string; body: string; type: string;
  read: boolean; data?: Record<string, any>;
}): Promise<void> {
  const { error } = await supabase.from('notification_logs').insert(payload);
  if (error) throw error;
}

// Upsert a notification using a dedup_key — only one entry per (user, key).
// Use for likes ('like:<post_id>'), follows, and chat messages ('chat:<chat_id>').
export async function upsertNotification(payload: {
  user_id: string; title: string; body: string; type: string;
  read: boolean; data?: Record<string, any>; dedup_key: string;
}): Promise<void> {
  const { error } = await supabase
    .from('notification_logs')
    .upsert(payload, { onConflict: 'user_id,dedup_key' });
  if (error) throw error;
}

// Remove a dedup notification (e.g. on unlike or unfollow).
export async function deleteNotificationByDedup(userId: string, dedupKey: string): Promise<void> {
  const { error } = await supabase
    .from('notification_logs')
    .delete()
    .eq('user_id', userId)
    .eq('dedup_key', dedupKey);
  if (error) throw error;
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function insertEventRsvp(payload: {
  event_id: string; user_id: string; status?: string;
}): Promise<void> {
  // event_rsvps has UNIQUE(event_id, user_id) — no pet_id column exists on this table.
  const { error } = await supabase.from('event_rsvps').upsert(payload, { onConflict: 'event_id,user_id' });
  if (error) throw error;
}

export async function deleteEventRsvp(userId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from('event_rsvps').delete().eq('user_id', userId).eq('event_id', eventId);
  if (error) throw error;
}

export async function deleteEventRsvpByUser(userId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from('event_rsvps').delete().eq('user_id', userId).eq('event_id', eventId);
  if (error) throw error;
}

export async function insertCommunityEvent(payload: Record<string, any>) {
  const { data, error } = await supabase.from('community_events').insert(payload).select().single();
  if (error) throw error;
  return data;
}
