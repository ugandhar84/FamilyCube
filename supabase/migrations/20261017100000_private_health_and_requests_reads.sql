-- QA findings: at the table level a grandparent could read every family medication row, a kid could read the titles of
-- a parent's medical records, and any kid could read other kids' requests. The apps already hide these; the database now
-- agrees. Parents keep full family access; everyone else sees only their own rows (or rows addressed to them).
-- A session with no resolvable active member keeps the old family-wide behaviour so legacy sessions are not locked out.
create or replace function public.active_member_sees_whole_family() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select role = 'parent' from public.members where id::text = public.resolve_active_member_id()), true)
$$;

drop policy if exists "family_medications_select" on public.family_medications;
create policy "family_medications_select" on public.family_medications for select
  using (family_id = (current_user_family_id())::text
         and (public.active_member_sees_whole_family() or member_id::text = public.resolve_active_member_id()));

drop policy if exists "medical_records_select" on public.medical_records;
drop policy if exists "medrec_family_select" on public.medical_records;
create policy "medical_records_select" on public.medical_records for select
  using (family_id = (current_user_family_id())::text
         and (public.active_member_sees_whole_family() or member_id::text = public.resolve_active_member_id()));

drop policy if exists "family members read kid_requests" on public.kid_requests;
create policy "family members read kid_requests" on public.kid_requests for select
  using (family_id = current_user_family_id()
         and (public.active_member_sees_whole_family()
              or from_member_id::text = public.resolve_active_member_id()
              or to_member_id::text = public.resolve_active_member_id()
              or assigned_helper::text = public.resolve_active_member_id()
              or (coalesce(open_to_gp, false) and exists (select 1 from public.members g where g.id::text = public.resolve_active_member_id() and g.role = 'grandparent'))));
