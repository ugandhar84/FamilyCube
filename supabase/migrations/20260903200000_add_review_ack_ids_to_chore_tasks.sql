-- "Recently Approved" on the parent Hub had no way to clear an item short
-- of waiting out its 7-day dispute window — a parent who'd already seen and
-- accepted an approval still had it sitting in their list every time they
-- opened the Hub. Tracking who's dismissed it (per-parent, not global) lets
-- one parent clear their own view without hiding it from a co-parent who
-- hasn't looked yet — same per-viewer pattern gp_withdrawn_ids already uses.
alter table public.chore_tasks
  add column if not exists review_ack_ids jsonb not null default '[]'::jsonb;

comment on column public.chore_tasks.review_ack_ids is
  'Member ids of parents who dismissed this chore from their own "Recently Approved" list — per-viewer, does not affect the 7-day window for other parents.';
