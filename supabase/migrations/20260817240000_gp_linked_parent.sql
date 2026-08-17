-- Which parent a grandparent belongs to (e.g. Mary -> Priya, since Mary is
-- Priya's mother, not Alex's) — purely informational/labeling today (both
-- parents already correctly see and can approve either side's GP-sponsored
-- quests via the shared safety-review queue), used to show "whose parent"
-- a GP is on review cards and the Sponsor Quest form.
alter table public.members
  add column if not exists linked_parent_id text references public.members(id) on delete set null;
