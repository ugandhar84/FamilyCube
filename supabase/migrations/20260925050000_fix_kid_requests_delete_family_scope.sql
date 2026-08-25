-- 20260828000000 fixed a real data-loss bug (kid deleting a partially-
-- approved request) but its family-scoping clause regressed to the legacy
-- broken pattern: `members.id = auth.uid()::text` — members.id is a text
-- PK that is never equal to auth.uid() (a real auth UUID), for ANY member,
-- PIN-only or not. This has made kid_requests DELETE deny-all for
-- everyone since that migration, confirmed via
-- store/kidRequestStore.ts:280's delete() call always failing RLS
-- silently. Every other policy in this schema that needed this exact
-- check was already repointed to current_user_family_id() in
-- 20260818194500 — this one was missed since it was rewritten afterward
-- for an unrelated reason and reintroduced the old pattern.
DROP POLICY IF EXISTS "family members delete kid_requests" ON public.kid_requests;

-- family_id on this table is uuid (not text like members.id) —
-- current_user_family_id() already returns uuid, so compare directly
-- rather than casting to text (uuid = text has no implicit operator).
CREATE POLICY "family members delete kid_requests"
  ON public.kid_requests FOR DELETE
  USING (
    family_id = public.current_user_family_id()
    AND status = 'pending'
    AND responded_at IS NULL
  );
