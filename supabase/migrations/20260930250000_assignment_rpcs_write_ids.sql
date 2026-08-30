-- reassign_event/decline_event_assignment never wrote/cleared the new
-- driver_id/helper_id columns (20260930240000) — only the legacy
-- driver_name/helper_name display strings. Since classifyEventUrgency.ts
-- (the Hub's "is this assigned to ME" check) now compares by id instead of
-- name string, every future reassignment/decline through these RPCs would
-- leave driver_id/helper_id stale or null again without this fix, even
-- though the one-time backfill in 20260930240000 corrected existing rows.

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
begin
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
begin
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
      driver_name = null, driver_id = null, driver_status = null,
      is_open_to_grandparents = case when v_category = 'Ride' or v_ride_required then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_category = 'Ride' or v_ride_required then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  else
    update public.calendar_events set
      helper_name = null, helper_id = null, helper_status = null, helper_declined_by = p_member_id, helper_decline_reason = p_reason,
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
