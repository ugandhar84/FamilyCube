-- Fix RLS policies for kid_requests.
--
-- Family model: members are invitation-based, NOT Supabase auth users.
-- auth.uid() maps to the PARENT who authenticated. Kids operate under the
-- parent's session. All policies scope to family_id derived from the
-- authenticated member's family — never from from_member_id directly.
--
-- Security guarantees:
--   - No row is readable by anyone outside the same family
--   - No row can be inserted into a family the authenticated user doesn't belong to
--   - No row can be updated/deleted by users from other families
--   - auth.uid() is always checked against members.id (the parent's member record)

-- ── Drop old broken policies ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "kid insert own requests"              ON public.kid_requests;
DROP POLICY IF EXISTS "kid delete own pending requests"      ON public.kid_requests;
DROP POLICY IF EXISTS "family members read kid_requests"     ON public.kid_requests;
DROP POLICY IF EXISTS "family members update kid_requests"   ON public.kid_requests;
DROP POLICY IF EXISTS "family members insert kid_requests"   ON public.kid_requests;
DROP POLICY IF EXISTS "family members delete kid_requests"   ON public.kid_requests;

-- ── Recreate all four policies cleanly ───────────────────────────────────────

-- SELECT: only members of the same family can read requests
CREATE POLICY "family members read kid_requests"
  ON public.kid_requests FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

-- INSERT: authenticated parent can create requests for any kid in their family
-- (kids run under the parent's auth session; from_member_id is the kid's member id)
CREATE POLICY "family members insert kid_requests"
  ON public.kid_requests FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

-- UPDATE: only family members can update (approve/decline/assign)
CREATE POLICY "family members update kid_requests"
  ON public.kid_requests FOR UPDATE
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

-- DELETE: only family members can delete, and only pending requests
CREATE POLICY "family members delete kid_requests"
  ON public.kid_requests FOR DELETE
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
    AND status = 'pending'
  );
