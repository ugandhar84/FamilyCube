-- Real gap found by a deep exploratory QA trace of Events & Rides: the
-- calendar_events_select RLS policy grants full assignee access to
-- whoever's NAME matches driver_name/helper_name — proven live to let an
-- unrelated, same-named grandparent (e.g. two "Praveena"s across two
-- different test families, or plausibly two same-named relatives in one
-- real family) get full access to another member's private event they
-- have no actual connection to. driver_id/helper_id columns already exist
-- specifically to avoid this exact class of fragility (the same id-vs-name
-- lesson already applied elsewhere this session), but every event-
-- assignment RPC (reassign_event, assign_event_role, claim_event_slot,
-- decline_event_assignment) has only ever written the name columns —
-- confirmed live: 86 rows have helper_name set, only 3 have helper_id.
--
-- Fix, in order: (1) backfill the id columns for existing rows where the
-- name uniquely identifies one member (confirmed both live values do);
-- (2) update every assignment RPC to also write the id going forward;
-- (3) switch the RLS clause to match on id instead of name. Name columns
-- are kept alongside the ids — client code reads driverName/helperName
-- directly for display, so removing them isn't needed to close this bug.

-- Step 1: one-time backfill for existing rows, only where unambiguous.
update public.calendar_events ce
set driver_id = m.id
from public.members m
where ce.driver_name is not null
  and ce.driver_id is null
  and m.name = ce.driver_name
  and m.family_id::text = ce.family_id
  and (select count(*) from public.members m2 where m2.name = ce.driver_name and m2.family_id::text = ce.family_id) = 1;

update public.calendar_events ce
set helper_id = m.id
from public.members m
where ce.helper_name is not null
  and ce.helper_id is null
  and m.name = ce.helper_name
  and m.family_id::text = ce.family_id
  and (select count(*) from public.members m2 where m2.name = ce.helper_name and m2.family_id::text = ce.family_id) = 1;

-- Step 2: update every assignment RPC to also write the id column.
create or replace function public.reassign_event(p_event_id text, p_new_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member_name text;
  v_status text;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_prior_driver_id text;
  v_event_family text;
  v_actor_family text;
  v_new_member_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;
  select family_id into v_new_member_family from public.members where id = p_new_member_id;
  if v_new_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_new_member_id, p_event_id;
  end if;

  select name into v_member_name from public.members where id = p_new_member_id;
  v_status := case when p_new_member_id = p_actor_id then 'confirmed' else 'pending' end;

  if p_role = 'driver' then
    select member_id into v_prior_driver_id
    from public.event_participants
    where event_id = p_event_id and role = 'driver'
    limit 1;
  end if;

  delete from public.event_participants where event_id = p_event_id and role = p_role;

  insert into public.event_participants (event_id, member_id, member_name, role, status, responded_at)
    values (p_event_id, p_new_member_id, v_member_name, p_role, v_status, case when v_status = 'confirmed' then now() else null end)
    returning * into v_row;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_id = p_new_member_id, driver_status = v_status, ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;

    if v_prior_driver_id is not null and v_prior_driver_id <> p_new_member_id then
      update public.trips
        set completed_at = now()
        where driver_member_id = v_prior_driver_id and completed_at is null;
    end if;
  else
    update public.calendar_events set helper_name = v_member_name, helper_id = p_new_member_id, helper_status = v_status,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_reassigned', v_status, v_transition_id,
      format('%s reassigned to %s (%s)', p_role, v_member_name, v_status)
    from public.calendar_events ce where ce.id = p_event_id;

  return v_row;
end;
$function$;

create or replace function public.assign_event_role(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member_name text;
  v_member_role text;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event_family text;
  v_actor_family text;
  v_member_family text;
  v_open_to_gp boolean;
  v_open_to_teens boolean;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  if p_role not in ('driver','helper') then
    raise exception 'assign_event_role only supports driver/helper roles, got %', p_role;
  end if;

  select family_id, is_open_to_grandparents, is_open_to_teens
    into v_event_family, v_open_to_gp, v_open_to_teens
    from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;
  select family_id, role into v_member_family, v_member_role from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  if v_member_role = 'grandparent' and coalesce(v_open_to_gp, false) is not true then
    raise exception 'not_open_to_grandparents: member % is not a valid driver/helper for this event', p_member_id
      using errcode = 'P0001';
  end if;
  if v_member_role = 'teenager' and coalesce(v_open_to_teens, false) is not true then
    raise exception 'not_open_to_teens: member % is not a valid driver/helper for this event', p_member_id
      using errcode = 'P0001';
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  delete from public.event_participants where event_id = p_event_id and role = p_role;

  insert into public.event_participants (event_id, member_id, member_name, role, status)
    values (p_event_id, p_member_id, v_member_name, p_role, 'pending')
    returning * into v_row;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_id = p_member_id, driver_status = 'pending', ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  else
    update public.calendar_events set helper_name = v_member_name, helper_id = p_member_id, helper_status = 'pending',
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_assigned', 'pending', v_transition_id,
      format('%s assigned as %s', v_member_name, p_role)
    from public.calendar_events ce where ce.id = p_event_id;

  return v_row;
end;
$function$;

create or replace function public.claim_event_slot(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns table(claimed boolean, participant event_participants)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member_name text;
  v_existing_count integer;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event_family text;
  v_actor_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  if p_role not in ('driver','helper') then
    raise exception 'claim_event_slot only supports driver/helper roles, got %', p_role;
  end if;

  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;

  select count(*) into v_existing_count from public.event_participants
    where event_id = p_event_id and role = p_role and status in ('pending','confirmed');
  if v_existing_count > 0 then
    return query select false, null::public.event_participants;
    return;
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  insert into public.event_participants (event_id, member_id, member_name, role, status)
    values (p_event_id, p_member_id, v_member_name, p_role, 'confirmed')
    on conflict (event_id, member_id, role) do nothing
    returning * into v_row;

  if v_row.id is null then
    return query select false, null::public.event_participants;
    return;
  end if;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_id = p_member_id, driver_status = 'confirmed', ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  else
    update public.calendar_events set helper_name = v_member_name, helper_id = p_member_id, helper_status = 'confirmed',
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_assigned', 'confirmed', v_transition_id,
      format('%s claimed the open %s slot', v_member_name, p_role)
    from public.calendar_events ce where ce.id = p_event_id;

  return query select true, v_row;
end;
$function$;

-- Step 3: switch the RLS assignee-match clause from name to id.
drop policy if exists "calendar_events_select" on public.calendar_events;
create policy "calendar_events_select" on public.calendar_events
for select
using (
  family_id = (current_user_family_id())::text
  and (
    not (
      privacy_level = 'private'
      or category = 'Medical'
      or category = 'Ride'
      or coalesce(ride_required, false)
      or (
        member_id is not null
        and (member_ids is null or member_ids = '[]'::jsonb)
        and exists (
          select 1 from public.members
          where members.id = calendar_events.member_id and members.role in ('child', 'kid', 'teenager')
        )
      )
    )
    or exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
    or member_id = resolve_active_member_id()
    or (member_ids is not null and member_ids ? resolve_active_member_id())
    -- id-based assignee match — closes the same-name-collision gap the
    -- previous members.name = calendar_events.helper_name/driver_name
    -- comparison had.
    or resolve_active_member_id() = calendar_events.helper_id
    or resolve_active_member_id() = calendar_events.driver_id
    or (
      coalesce(shared_with_gp_for_care, false)
      and exists (
        select 1 from public.members
        where members.id = resolve_active_member_id() and members.role = 'grandparent'
      )
    )
    or coalesce(shared_with_siblings, false)
  )
);
