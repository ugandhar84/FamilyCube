-- Live QA finding: "Pass" behaves three inconsistent ways across roles.
-- A grandparent's Pass on an open ride is remembered permanently (this
-- column, grandparent_passed_ids) — but a teen's Pass on the SAME kind of
-- open pickup is pure local React state (TeenView.tsx's passedPickups
-- useState), never persisted at all. Closing and reopening the app, or
-- switching devices, brings the passed ride right back for a teen, while
-- a grandparent's pass sticks. Adding the same column for teens so the
-- behavior is symmetric.
alter table public.calendar_events
  add column if not exists teen_passed_ids jsonb default '[]'::jsonb;

comment on column public.calendar_events.teen_passed_ids is
  'Teen member ids who tapped Pass on this open pickup — hidden from their own pool going forward. Symmetric with grandparent_passed_ids.';
