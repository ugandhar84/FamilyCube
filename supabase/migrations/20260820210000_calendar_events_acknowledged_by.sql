-- A plain multi-member event attendee (not the named driver/helper — e.g.
-- a sibling riding along, or a second kid on a shared appointment) had no
-- way to signal "I've seen this and I know I'm going" — no badge, no
-- acknowledge action, unlike the driver/helper roles which already have a
-- full accept/decline/reassign flow. See docs/product_requirements_role_matrix.html
-- scenario 2.5 and docs/requirements_vs_code_gaps.html Ref 2.5.

alter table public.calendar_events
  add column if not exists acknowledged_by text[] not null default '{}';
