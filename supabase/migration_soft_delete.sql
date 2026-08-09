-- Soft delete: accounts are marked for deletion and permanently purged after 30 days.
-- Logging back in within 30 days restores the account automatically.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;
