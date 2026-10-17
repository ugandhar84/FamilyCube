-- QA findings: at the table level a kid could delete any family event and could mark their own kid_request approved.
-- The apps already hide both from kids; make the database say the same.
create or replace function public.active_member_is_minor() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select role in ('child', 'kid', 'teenager') from public.members where id::text = public.resolve_active_member_id()), false)
$$;

drop policy if exists "calendar_events_delete" on public.calendar_events;
create policy "calendar_events_delete" on public.calendar_events for delete
  using (family_id = public.current_user_family_id()::text and not public.active_member_is_minor());

-- A kid/teen may still edit or cancel their own pending request, but cannot set it to approved/declined.
drop policy if exists "family members update kid_requests" on public.kid_requests;
create policy "family members update kid_requests" on public.kid_requests for update
  using (family_id = public.current_user_family_id())
  with check (
    family_id = public.current_user_family_id()
    and (not public.active_member_is_minor() or status in ('pending', 'cancelled'))
  );
