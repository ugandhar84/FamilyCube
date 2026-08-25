-- activity_log (renamed from calendar_event_history by
-- 20260829010000 — a plain table rename, which carries policies forward
-- unchanged) has had its SELECT and INSERT policies broken since creation:
-- `members.id = auth.uid()::text`, the same legacy pattern already fixed
-- everywhere else in this schema via current_user_family_id(). This table
-- was created the day after the mass-repoint migration (20260818194500)
-- and was never included in it. Confirmed live client usage:
-- lib/activityLog.ts, features/tasks/components/ChoreHistorySheet.tsx,
-- store/choreStore.ts, store/eventStore.ts all read/write this table — the
-- entire event/chore history-log feature has been silently non-functional
-- (deny-all) for every real user since it shipped.
DROP POLICY IF EXISTS "family members read calendar_event_history" ON public.activity_log;
DROP POLICY IF EXISTS "family members insert calendar_event_history" ON public.activity_log;

-- family_id here is uuid — current_user_family_id() already returns uuid,
-- compare directly (uuid = text has no implicit operator, confirmed live).
CREATE POLICY "family members read activity_log"
  ON public.activity_log FOR SELECT
  USING (family_id = public.current_user_family_id());

CREATE POLICY "family members insert activity_log"
  ON public.activity_log FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id());
