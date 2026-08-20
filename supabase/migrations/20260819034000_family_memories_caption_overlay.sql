-- Adds caption_overlay, mirroring the social feed's Post.caption_overlay:
-- when true, the caption renders as a gradient overlay on the photo itself
-- (PostMedia's captionOverlay prop) instead of as a separate text block
-- below the image.
alter table family_memories
  add column if not exists caption_overlay boolean not null default false;
