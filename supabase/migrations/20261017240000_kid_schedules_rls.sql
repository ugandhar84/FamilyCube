-- kid_schedules' policies compared members.id to auth.uid(), but a member's id is not the auth user id (members.auth_user_id
-- is), so no write ever passed and no school schedule or holiday was ever saved to the database. Use the same family check
-- as the rest of the app; only a parent may change a schedule.
drop policy if exists kid_schedules_select on public.kid_schedules;
drop policy if exists kid_schedules_insert on public.kid_schedules;
drop policy if exists kid_schedules_update on public.kid_schedules;
drop policy if exists kid_schedules_delete on public.kid_schedules;

create policy kid_schedules_select on public.kid_schedules for select
  using (family_id = current_user_family_id()::text);

create policy kid_schedules_insert on public.kid_schedules for insert
  with check (
    family_id = current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = resolve_active_member_id() and m.role = 'parent')
  );

create policy kid_schedules_update on public.kid_schedules for update
  using (family_id = current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = resolve_active_member_id() and m.role = 'parent'))
  with check (family_id = current_user_family_id()::text);

create policy kid_schedules_delete on public.kid_schedules for delete
  using (family_id = current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = resolve_active_member_id() and m.role = 'parent'));
