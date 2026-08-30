-- family_memories_delete only checked family_id — ANY signed-in family
-- member (kid, teen, senior, parent) could delete ANY other member's
-- posted memory, no matter who posted it. Live-flagged: "if one pasted the
-- memories should other can have delete option?" — a private family
-- keepsake album shouldn't let a kid delete a parent's photo post (or vice
-- versa). Restrict to: the poster themselves (created_by matches the
-- caller's own member id), or any parent (moderation/cleanup role, same
-- "parent can act across the whole family" pattern chore_tasks' own RLS
-- already uses).
drop policy if exists "family_memories_delete" on public.family_memories;

create policy "family_memories_delete" on public.family_memories for delete
  using (
    family_id = public.current_user_family_id()::text
    and (
      created_by in (select public.current_user_member_ids())
      or exists (
        select 1 from public.members
        where auth_user_id = auth.uid()
          and role = 'parent'
          and family_id::text = family_memories.family_id
      )
    )
  );
