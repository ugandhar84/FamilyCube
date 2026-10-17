-- Adds an explicit assignee to homeowner_notes, separate from created_by
-- [live-requested: "should be able to assign to the persons, show dropdown
-- of these persons"] — until now the Add/Edit forms only displayed the
-- creator's name as a static "Assigned to" label with no way to actually
-- pick a different family member. Nullable + backfilled to created_by so
-- every existing row keeps its current (implicit) assignee unchanged.

alter table public.homeowner_notes add column if not exists assigned_to text references public.members(id) on delete set null;

update public.homeowner_notes set assigned_to = created_by where assigned_to is null;

create index if not exists homeowner_notes_assigned_to_idx on public.homeowner_notes(assigned_to);
