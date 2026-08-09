-- ── Prevent duplicate active playdates between the same pet pair ─────────────
-- An "active" chat is one that isn't declined/cancelled. We enforce at DB level
-- that only ONE non-terminal chat can exist per pet pair at a time.

-- Partial unique index: only one active (negotiating/agreed) chat per pet pair.
-- Terminal statuses (declined, cancelled, completed) are excluded so a new
-- playdate can be initiated after the previous one ends.
CREATE UNIQUE INDEX IF NOT EXISTS uq_playdate_chats_active_pair
  ON playdate_chats (
    LEAST(from_pet_id::text, to_pet_id::text),
    GREATEST(from_pet_id::text, to_pet_id::text)
  )
  WHERE status IN ('negotiating', 'agreed');

-- Partial unique index on playdate_requests: only one pending/accepted request
-- per ordered pair at a time (the existing upsert conflict target handles this,
-- but an index makes it explicit and faster).
CREATE UNIQUE INDEX IF NOT EXISTS uq_playdate_requests_active_pair
  ON playdate_requests (from_pet_id, to_pet_id)
  WHERE status IN ('pending', 'accepted');

-- Clean up stale duplicate chats — keep only the most recent per pet pair
-- where duplicates exist in active statuses (safe one-time cleanup).
DELETE FROM playdate_chats
WHERE id NOT IN (
  SELECT DISTINCT ON (
    LEAST(from_pet_id::text, to_pet_id::text),
    GREATEST(from_pet_id::text, to_pet_id::text),
    status
  ) id
  FROM playdate_chats
  WHERE status IN ('negotiating', 'agreed')
  ORDER BY
    LEAST(from_pet_id::text, to_pet_id::text),
    GREATEST(from_pet_id::text, to_pet_id::text),
    status,
    created_at DESC
)
AND status IN ('negotiating', 'agreed');

NOTIFY pgrst, 'reload schema';
