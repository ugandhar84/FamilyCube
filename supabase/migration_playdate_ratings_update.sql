-- Allow a rater to update their own pet rating (needed for upsert via service role + good hygiene)
-- playdate_host_ratings already has this policy; add the equivalent for playdate_ratings.
-- Run once: psql $DATABASE_URL < supabase/migration_playdate_ratings_update.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'playdate_ratings'
      AND policyname = 'rater can update own pet rating'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "rater can update own pet rating"
        ON playdate_ratings FOR UPDATE
        USING (
          rater_pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
        )
    $policy$;
  END IF;
END;
$$;
