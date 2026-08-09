import { supabase } from '@/lib/supabase';

// ── Production feed query ──────────────────────────────────────────────────────
// Single round-trip per page — no secondary subscriptions fetch.
// All tabs (For You / Following / Pinned) filter client-side from this data.

export const FEED_PAGE_SIZE = 15;

const FEED_SELECT = `
  id, pet_id, author_id, caption, overlay_caption, photo_url, photo_urls, media_type, video_url, video_thumbnail_url,
  is_public, is_media_blocked, caption_overlay, fit_frame, likes_count, comments_count,
  created_at, updated_at, is_edited, edited_at,
  pets ( id, name, emoji, accent_color, species, breed, avatar_url, followers_count, owner_id ),
  author:profiles ( full_name, handle )
`;

export interface FeedPage {
  posts: any[];
  hasMore: boolean;
  page: number;
}

export async function fetchFeedPage(page: number): Promise<FeedPage> {
  const from = page * FEED_PAGE_SIZE;
  const to   = from + FEED_PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from('social_posts')
    .select(FEED_SELECT)
    .eq('is_public', true)
    .eq('is_flagged', false)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const rows = (data ?? []) as any[];
  return {
    posts: rows.map(r => ({ ...r, pet: r.pets ?? null })),
    hasMore: rows.length === FEED_PAGE_SIZE,
    page,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  pet_id: string;
  author_id: string;
  caption: string | null;
  photo_url: string | null;
  is_public: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string | null;
  is_edited: boolean;
  edited_at: string | null;
  pets?: { name: string; emoji: string; accent_color: string | null; avatar_url: string | null; owner_id: string };
  profiles?: { full_name: string | null };
}

const POST_COLS = `
  id, pet_id, author_id, caption, overlay_caption, photo_url, photo_urls, media_type, video_url, video_thumbnail_url,
  is_public, is_media_blocked, caption_overlay, fit_frame, likes_count, comments_count,
  created_at, updated_at, is_edited, edited_at,
  pets(id, name, emoji, accent_color, avatar_url, followers_count, owner_id),
  profiles!social_posts_author_id_fkey(full_name, handle)
`;

const PAGE_SIZE = 20;

/** Cursor-based: returns PAGE_SIZE posts older than `cursor` (ISO timestamp). */
export async function getFeedPage(
  cursor?: string,
): Promise<{ posts: SocialPost[]; nextCursor: string | null }> {
  let q = supabase
    .from('social_posts')
    .select(POST_COLS)
    .eq('is_public', true)
    .eq('is_flagged', false)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const posts = rows.map(r => ({
    ...r,
    pet:    r.pets    ?? null,
    author: r.profiles ?? null,
  })) as unknown as SocialPost[];
  const nextCursor = posts.length === PAGE_SIZE
    ? posts[posts.length - 1].created_at
    : null;

  return { posts, nextCursor };
}

/** Following feed — only posts from pets the user follows */
export async function getFollowingFeedPage(
  followedPetIds: string[],
  cursor?: string,
): Promise<{ posts: SocialPost[]; nextCursor: string | null }> {
  if (followedPetIds.length === 0) return { posts: [], nextCursor: null };

  let q = supabase
    .from('social_posts')
    .select(POST_COLS)
    .in('pet_id', followedPetIds)
    .eq('is_public', true)
    .eq('is_flagged', false)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) throw error;

  const rows2 = (data ?? []) as any[];
  const posts = rows2.map(r => ({
    ...r,
    pet:    r.pets    ?? null,
    author: r.profiles ?? null,
  })) as unknown as SocialPost[];
  const nextCursor = posts.length === PAGE_SIZE
    ? posts[posts.length - 1].created_at
    : null;

  return { posts, nextCursor };
}

