-- Adds multi-photo support to family_memories, so a memory post can carry
-- up to a small carousel of photos (matching the social feed's PostMedia
-- carousel pattern) instead of the single photo_url column already there.
-- photo_url stays as the first photo for any old rows / simpler readers.
alter table family_memories
  add column if not exists photo_urls text[];
