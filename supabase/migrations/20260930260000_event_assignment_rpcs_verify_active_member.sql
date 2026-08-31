-- confirm_event_assignment / decline_event_assignment / reassign_event all
-- took a client-supplied member id (p_member_id / p_actor_id) and only
-- checked it belonged to the SAME FAMILY as the event — never that it was
-- actually the caller. This app runs one Supabase Auth session per DEVICE,
-- shared across every PIN-switched profile in the family (see
-- 20260903170000_add_active_member_header_support.sql's resolve_active_
-- member_id(), built for exactly this problem and already used by
-- current_user_family_id()/is_chat_channel_participant, but never adopted
-- by these three RPCs). Concretely: Praveena's own authenticated session
-- could call confirm_event_assignment(event, ugandhar_member_id, 'helper')
-- and it would succeed — nothing stopped one parent's device from
-- confirming/declining/reassigning-away-from as a DIFFERENT family member,
-- including another parent. Live-reported symptom this traces to: an event
-- assigned to Ugandhar (pending) was declined and then immediately
-- re-confirmed, both actions attributed to Ugandhar's own actor_id, in a
-- rapid back-and-forth with Praveena's device also acting on the same
-- event seconds apart — exactly the shape this gap allows.
--
-- Fix: every one of these RPCs now resolves the TRUE active member via
-- resolve_active_member_id() (verified against the x-active-member-id
-- header + auth.uid(), never trusted blindly) and requires it to match the
-- member id the call claims to be acting as. reassign_event's p_new_
-- member_id (who the event is being handed TO) is deliberately exempt —
-- reassigning to someone else is the entire point of that RPC — only
-- p_actor_id (who is DOING the reassigning) is checked.

create or replace function public.confirm_event_assignment(p_event_id text, p_member_id text, p_role text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event public.calendar_events;
  v_member_name text;
  v_event_family text;
  v_member_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  update public.event_participants
    set status = 'confirmed', responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id and status = 'pending'
    returning * into v_row;

  if v_row.id is not null then
    if p_role = 'driver' then
      update public.calendar_events set driver_status = 'confirmed', updated_by = p_member_id, updated_at = now()
        where id = p_event_id;
    else
      update public.calendar_events set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
        where id = p_event_id;
    end if;

    insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
      select 'event', p_event_id, ce.family_id::uuid, p_member_id, 'driver_reassigned', 'pending', 'confirmed', v_transition_id,
        format('%s confirmed as %s', v_row.member_name, p_role)
      from public.calendar_events ce where ce.id = p_event_id;

    return v_row;
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events
      set driver_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where id = p_event_id and driver_name = v_member_name and driver_status = 'pending'
      returning * into v_event;
  else
    update public.calendar_events
      set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where id = p_event_id and helper_name = v_member_name and helper_status = 'pending'
      returning * into v_event;
  end if;

  if v_event.id is null then
    raise exception 'no pending % assignment for member % on event %', p_role, p_member_id, p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('event', p_event_id, v_event.family_id::uuid, p_member_id, 'driver_reassigned', 'pending', 'confirmed', v_transition_id,
      format('%s confirmed as %s (legacy)', v_member_name, p_role));

  insert into public.event_participants (event_id, member_id, member_name, role, status, responded_at)
    values (p_event_id, p_member_id, v_member_name, p_role, 'confirmed', now())
    on conflict (event_id, member_id, role) do update set status = 'confirmed', responded_at = now()
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.decline_event_assignment(p_event_id text, p_member_id text, p_role text, p_reason text default null)
returns calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.calendar_events;
  v_category text;
  v_ride_required boolean;
  v_result public.calendar_events;
  v_transition_id uuid := gen_random_uuid();
  v_member_family text;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_event from public.calendar_events where id = p_event_id for update;
  if v_event.id is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event.family_id::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  v_category := v_event.category;
  v_ride_required := v_event.ride_required;

  update public.event_participants
    set status = 'rejected', decline_reason = p_reason, responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  delete from public.event_participants
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events set
      driver_name = null, driver_status = null,
      is_open_to_grandparents = case when v_category = 'Ride' or v_ride_required then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_category = 'Ride' or v_ride_required then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  else
    update public.calendar_events set
      helper_name = null, helper_status = null, helper_declined_by = p_member_id, helper_decline_reason = p_reason,
      is_open_to_grandparents = case when v_category = 'Ride' or v_ride_required then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_category = 'Ride' or v_ride_required then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('event', p_event_id, v_result.family_id::uuid, p_member_id, 'driver_removed', 'rejected', v_transition_id,
      coalesce(p_reason, format('declined as %s', p_role)));

  return v_result;
end;
$$;

create or replace function public.reassign_event(p_event_id text, p_new_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
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
    update public.calendar_events set driver_name = v_member_name, driver_status = v_status, ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;

    if v_prior_driver_id is not null and v_prior_driver_id <> p_new_member_id then
      update public.trips
        set completed_at = now()
        where driver_member_id = v_prior_driver_id and completed_at is null;
    end if;
  else
    update public.calendar_events set helper_name = v_member_name, helper_status = v_status,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_reassigned', v_status, v_transition_id,
      format('%s reassigned to %s (%s)', p_role, v_member_name, v_status)
    from public.calendar_events ce where ce.id = p_event_id;

  return v_row;
end;
$$;
