-- Round 6 QA finding: a multi-item kid_request (grocery/supplies) stays
-- status='pending' until EVERY item has been decided (see kidRequestStore.ts
-- approveItems/rejectItems — allDone only flips status once no item is left
-- 'pending'). That means a parent can approve one item of a 2-item request
-- and the request itself still reads as 'pending', which let a kid tap
-- delete (KidModals.tsx's delete button + this DELETE policy both gate on
-- status='pending') and permanently destroy the parent's already-recorded
-- approval — item statuses, approvedBy, approvedAt, parentNote — with no
-- trace anywhere else in the schema. Reproduced live in QA against the
-- isolated test family before this fix.
--
-- responded_at is set on the FIRST item decision, before status changes
-- (see approveItems/rejectItems: `respondedAt: now` is unconditional), so
-- it's the correct invariant here: nothing has been decided yet.
DROP POLICY IF EXISTS "family members delete kid_requests" ON public.kid_requests;

CREATE POLICY "family members delete kid_requests"
  ON public.kid_requests FOR DELETE
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
    AND status = 'pending'
    AND responded_at IS NULL
  );
