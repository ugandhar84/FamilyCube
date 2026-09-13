-- Driving Reports was scoped parent-only-for-kid-drivers at launch
-- (20260966000000_driving_trips.sql) — live-requested correction: everyone
-- should be able to see their OWN trips (parents included, not just kids),
-- while a parent can additionally see anyone's (co-parent or kid). A kid
-- still cannot see a sibling's or a parent's trips — only their own.
drop policy if exists driving_trips_select on driving_trips;

create policy driving_trips_select on driving_trips
  for select using (
    family_id = (current_user_family_id())::text
    and (
      member_id = resolve_active_member_id()
      or exists (
        select 1 from public.members
        where members.id = resolve_active_member_id() and members.role = 'parent'
      )
    )
  );
