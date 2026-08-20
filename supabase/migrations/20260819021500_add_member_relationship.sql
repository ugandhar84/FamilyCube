-- Adds a purely descriptive relationship label (e.g. "Mother", "Stepson",
-- "Grandmother"), separate from `role` and `sub_role`. `role` continues to
-- drive permissions/RBAC everywhere in the app — this column never gates
-- anything, it only describes how a member relates to the family for
-- display purposes (roster cards, family tree).
alter table members
  add column if not exists relationship text;
