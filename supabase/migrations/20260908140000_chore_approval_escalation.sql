-- QA punch list #4 — "Parent never answered in time" was entirely missing:
-- chore-auto-approve fired silently at the 24h approval_window_expires_at
-- cutoff and paid out unconditionally, with no nudge to anyone first and
-- no escalation path — the exact opposite of the master-flow spec, which
-- wants a nudge, then a real human decision from a co-parent, not a quiet
-- auto-pay. Per explicit product direction: auto-approve stops being the
-- ONLY outcome — at the 24h cutoff the chore instead escalates (flagged
-- urgent, every parent pushed, "Approve it now" / "Too late — offer
-- another day" is the parent's call), and only falls back to auto-approve
-- as a genuine last resort at 48h total if the escalation itself also goes
-- unanswered — so a kid in an otherwise fully unresponsive household still
-- isn't stuck waiting forever, but the common case is now a real decision,
-- not a silent timeout.
--
-- approval_escalated_at gates the one-time escalation nudge so a 15-minute
-- cron doesn't re-push the same chore every tick — set once, at 24h, and
-- checked before the 48h auto-approve fallback fires.

ALTER TABLE public.chore_tasks
  ADD COLUMN IF NOT EXISTS approval_escalated_at timestamptz;

COMMENT ON COLUMN public.chore_tasks.approval_escalated_at IS
  'Set once when a pending_approval chore''s 24h approval window lapses and it escalates to all parents (urgent flag + push) instead of silently auto-approving. Gates the one-time nudge and the 48h auto-approve fallback — see chore-auto-approve edge function.';
