-- Memory keepsake composer now supports mixed photo/video slots (up to a
-- 2-minute video, muted-autoplay in the feed) instead of photos only.
-- media_types is a parallel array to photo_urls (index-for-index — url[i]
-- is a video iff media_types[i] = 'video'); a single-media post's type
-- lives at media_types[0]. NOT tracked per-column on photo_url itself
-- since that column predates this feature and stays photo-only for
-- backward compatibility with any code that hasn't been updated yet.
alter table public.family_memories
  add column if not exists media_types text[] not null default '{}';

comment on column public.family_memories.media_types is 'Parallel array to photo_urls/photo_url ordering — ''photo'' or ''video'' per slot. Empty/missing entries default to ''photo'' for backward compatibility with rows written before this column existed.';
