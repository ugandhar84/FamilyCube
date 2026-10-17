-- Sticky notes were created with permissive "using (true)" policies, so anyone holding the public anon key could
-- read or write every family's notes. Scope them to the caller's own family, and to who a note was shared with.
drop policy if exists "family members can read sticky notes" on family_sticky_notes;
drop policy if exists "family members can write sticky notes" on family_sticky_notes;
drop policy if exists "family members can delete sticky notes" on family_sticky_notes;

-- Read: my family, and either I wrote it, it is for everyone (no recipients), or I am a recipient.
create policy "sticky_notes_select" on family_sticky_notes for select
  using (
    family_id = public.current_user_family_id()::text
    and (
      author_id in (select public.current_user_member_ids())
      or coalesce(array_length(recipient_ids, 1), 0) = 0
      or recipient_ids && array(select public.current_user_member_ids())
    )
  );

-- Write: only into my own family, and only as myself.
create policy "sticky_notes_insert" on family_sticky_notes for insert
  with check (
    family_id = public.current_user_family_id()::text
    and author_id in (select public.current_user_member_ids())
  );

-- Delete: the author, or any parent in the family.
create policy "sticky_notes_delete" on family_sticky_notes for delete
  using (
    family_id = public.current_user_family_id()::text
    and (
      author_id in (select public.current_user_member_ids())
      or exists (
        select 1 from public.members
        where auth_user_id = auth.uid() and role = 'parent' and family_id::text = family_sticky_notes.family_id
      )
    )
  );
