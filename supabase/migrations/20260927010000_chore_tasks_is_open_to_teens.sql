-- Teen-pool routing for chores, mirroring the existing invite_grandparents
-- column exactly. Previously chore-deadline-notifier's pool-urgent-broadcast
-- query selected chore_tasks.is_open_to_teens assuming it already existed —
-- it only ever existed on calendar_events, so every invocation of that
-- function threw before running ANY of its logic (deadline reminders,
-- check-in nudges, auto-release, origination-approval escalation). This adds
-- the real column instead of just patching the crash, since a teen-pool
-- concept for chores was clearly intended (the notifier's own token-fanout
-- logic already branches on it) but never actually built end-to-end.
alter table public.chore_tasks
  add column if not exists is_open_to_teens boolean not null default false;

comment on column public.chore_tasks.is_open_to_teens is
  'Parent-flagged: this pool chore is also open to teens, alongside/instead of invite_grandparents. Mirrors that column''s semantics.';
