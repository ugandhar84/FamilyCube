-- Adds a review-queue status to family_recipes so kids can contribute a
-- recipe for a parent to approve before it appears in the shared book
-- [live-requested: "in the family recipie book kids can contribute
-- meaning add to the book and send to the parents to review approve"].
-- Parent-created recipes stay 'approved' (visible immediately, same as
-- today); kid/teen-created recipes default to 'pending' and only show in
-- the book once a parent approves them. Existing rows (created before
-- this column existed) are backfilled to 'approved' so nothing already
-- in a family's book disappears.

alter table public.family_recipes
  add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved'));

update public.family_recipes set status = 'approved' where status is null;

create index if not exists family_recipes_status_idx
  on public.family_recipes (family_id, status);
