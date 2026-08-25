-- notifications had SELECT/INSERT/UPDATE policies but no DELETE policy at
-- all — with RLS enabled, a client-side DELETE with no matching policy is
-- silently blocked (0 rows affected, no error surfaced), so "Clear all"/
-- per-row delete in the notification panel looked like it worked (optimistic
-- local removal) but never actually removed the row from the DB
-- (live-reported: "delete from here should actually delete it").
--
-- Also repoints the existing SELECT/INSERT/UPDATE policies off the broken
-- `id = auth.uid()::text` check (members.id has never equaled auth.uid() for
-- anyone — see 20260818192700's own header) onto
-- public.current_user_family_id(), the same real, working pattern every
-- other table was repointed to in 20260818194500. This table was missed by
-- that migration.
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;

CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (family_id = public.current_user_family_id()::text);

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);

CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  USING (family_id = public.current_user_family_id()::text);
