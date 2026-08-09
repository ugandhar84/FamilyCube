-- Track explicit content edits separately from activity-based updated_at
-- updated_at changes on every UPDATE (likes, comments, flags) so it cannot
-- be used as an edit indicator. These two columns are the source of truth.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS is_edited  boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz;
