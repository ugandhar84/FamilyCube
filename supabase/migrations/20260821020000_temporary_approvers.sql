-- Scenarios 9.2/9.3 — Temporary-approver / caregiver-mode delegation.
--
-- A bounded, explicit, auto-expiring grant of chore/quest APPROVAL
-- capability to a non-parent member (typically Senior/GP, or a Teen) —
-- e.g. a single-parent household where the sole parent is unreachable, or
-- both parents traveling and GP is the only adult present. Deliberately
-- narrow: this table only records WHO can approve and UNTIL WHEN — it
-- never grants full parent role, member management, or financial-threshold
-- overrides. See store/temporaryApproverStore.ts and choreStore.ts's
-- canApprove() for how it's consumed.
--
-- A grant is "active" purely as a point-in-time computation
-- (now < expires_at AND revoked_at IS NULL) — nothing needs to run a sweep
-- job to expire it; it just stops being active the instant expires_at
-- passes, and every canApprove()/isActiveApprover() check re-evaluates
-- that live, not from a cached "active" flag.

CREATE TABLE IF NOT EXISTS public.temporary_approvers (
  id                    text PRIMARY KEY,
  family_id             text NOT NULL,
  granted_to_member_id  text NOT NULL,
  granted_by_member_id  text NOT NULL,
  expires_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_temporary_approvers_family ON public.temporary_approvers(family_id);
CREATE INDEX IF NOT EXISTS idx_temporary_approvers_grantee ON public.temporary_approvers(granted_to_member_id);

ALTER TABLE public.temporary_approvers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS temporary_approvers_select ON public.temporary_approvers;
CREATE POLICY temporary_approvers_select ON public.temporary_approvers
  FOR SELECT
  USING (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS temporary_approvers_insert ON public.temporary_approvers;
CREATE POLICY temporary_approvers_insert ON public.temporary_approvers
  FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS temporary_approvers_update ON public.temporary_approvers;
CREATE POLICY temporary_approvers_update ON public.temporary_approvers
  FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS temporary_approvers_delete ON public.temporary_approvers;
CREATE POLICY temporary_approvers_delete ON public.temporary_approvers
  FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- Idempotent add-to-publication, matching the pattern established in
-- 20260820121500_realtime_members_kidrequests_pqa.sql — ALTER PUBLICATION
-- ... ADD TABLE fails outright if the table is already a member, so guard
-- it with an existence check rather than a bare statement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'temporary_approvers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.temporary_approvers;
  END IF;
END $$;
