-- One-shot guards for the two previously-missing master-flow nudges added
-- to chore-deadline-notifier. Same reasoning as chore_notified_at-style
-- columns elsewhere this session: without a stamp, a 15-minute cron would
-- re-fire the same nudge every single run once a chore crosses the
-- threshold, instead of firing it exactly once.
--
-- pool_urgent_notified_at — the genuinely new one: an open/pooled chore
-- (is_pool=true, unclaimed) due within 30 minutes gets one urgent
-- broadcast to its eligible pool + a parent alert.
--
-- origination_approval_nudge_at / origination_approval_escalated_at — NOT
-- the same thing as the pre-existing approval_escalated_at column
-- (20260908140000_chore_approval_escalation.sql), which already covers a
-- DIFFERENT spec moment: a kid's SUBMITTED WORK sitting unreviewed at
-- pending_approval (step 6 — chore-auto-approve edge function, confirmed
-- working, 24h nudge/escalate + 48h auto-approve fallback). This pair
-- covers a NEW, previously fully-missing moment: a chore that hasn't even
-- been APPROVED TO EXIST yet — pending_parent_approval (a GP-sponsored
-- quest awaiting the parent's initial yes/no) or pending_kid_proposal (a
-- kid's own proposal awaiting the same) — step 2 in the spec, not step 6.
-- Naming them "origination_*" specifically to avoid any confusion with
-- the existing, unrelated approval_escalated_at column.
alter table public.chore_tasks
  add column if not exists pool_urgent_notified_at timestamptz,
  add column if not exists origination_approval_nudge_at timestamptz,
  add column if not exists origination_approval_escalated_at timestamptz;

comment on column public.chore_tasks.pool_urgent_notified_at is
  'Set once chore-deadline-notifier fires the "still unclaimed, due soon" broadcast for this pooled chore — prevents re-firing on every 15-min cron pass while it stays unclaimed.';
comment on column public.chore_tasks.origination_approval_nudge_at is
  'Set once chore-deadline-notifier fires the approval-cutoff nudge (~15h into a 24h window) for a pending_parent_approval/pending_kid_proposal chore — a NEW chore awaiting its first yes/no, distinct from the pre-existing approval_escalated_at (submitted-work review cutoff, chore-auto-approve).';
comment on column public.chore_tasks.origination_approval_escalated_at is
  'Set once chore-deadline-notifier escalates an unanswered origination approval to the co-parent (~24h into the window).';
