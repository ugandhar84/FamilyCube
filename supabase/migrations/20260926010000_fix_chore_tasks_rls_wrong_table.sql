-- 20260925112000_chore_tasks_approver_only_write.sql's own comment claims
-- it mirrors bounty_claims' policy shape, but it actually introduced a
-- DIFFERENT, wrong pattern: every policy on chore_tasks (SELECT, INSERT,
-- UPDATE, DELETE) checks membership via `public.family_members`
-- (owner_id, no family_id column at all — confirmed live via
-- information_schema.columns) instead of the real current_user_family_id()
-- helper bounty_claims' own policies actually use. family_members has
-- zero rows for every user, so `family_id in (select family_id from
-- family_members where owner_id = auth.uid())` is unconditionally false —
-- this silently blocked ALL chore reads/writes through the real client
-- the moment this migration was applied. Live-reported: a chore created
-- directly in the DB never appeared in the app's own chore list even
-- after a forced resync.
--
-- current_user_family_id() (`select family_id from public.members where
-- id = resolve_active_member_id()`) is used instead of a raw
-- `auth_user_id = auth.uid()` match on public.members directly — the
-- latter would resolve to the WRONG family on a shared device mid PIN-
-- switch, since auth_user_id is identical for every member profile under
-- one login; resolve_active_member_id() is what correctly tracks which
-- profile is actually active right now.
--
-- Re-creates the exact same policy shapes from 20260925112000, with only
-- the membership-lookup corrected.

drop policy if exists "chore_tasks family read" on public.chore_tasks;

create policy "chore_tasks family read"
  on public.chore_tasks for select
  using (
    family_id = public.current_user_family_id()::text
    and (
      category_type is distinct from 'parent_only_quest'
      or exists (
        select 1 from public.members
        where id = public.resolve_active_member_id()
          and role = 'parent'
      )
    )
  );

drop policy if exists "chore_tasks_insert" on public.chore_tasks;

create policy "chore_tasks_insert"
  on public.chore_tasks for insert
  with check (
    family_id = public.current_user_family_id()::text
  );

drop policy if exists "chore_tasks_update" on public.chore_tasks;

create policy "chore_tasks_update"
  on public.chore_tasks for update
  using (
    family_id = public.current_user_family_id()::text
    and (
      status not in ('approved', 'auto_approved', 'completed', 'declined', 'redo_requested')
      or assigned_to_id = public.resolve_active_member_id()
      or sponsor_user_id = public.resolve_active_member_id()
      or public.is_approver()
    )
  )
  with check (
    family_id = public.current_user_family_id()::text
    and (
      status not in ('approved', 'auto_approved', 'completed', 'declined', 'redo_requested')
      or assigned_to_id = public.resolve_active_member_id()
      or sponsor_user_id = public.resolve_active_member_id()
      or public.is_approver()
    )
  );

drop policy if exists "chore_tasks_delete" on public.chore_tasks;

create policy "chore_tasks_delete"
  on public.chore_tasks for delete
  using (
    family_id = public.current_user_family_id()::text
    and (
      created_by_id = public.resolve_active_member_id()
      or sponsor_user_id = public.resolve_active_member_id()
      or assigned_to_id = public.resolve_active_member_id()
      or public.is_approver()
    )
  );
