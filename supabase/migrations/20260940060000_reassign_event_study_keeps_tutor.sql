-- Self-correction: migration 20260940020000 (earlier today, pass 1's fix
-- for "reassigning a ride's drop-off leg silently didn't take effect")
-- made reassign_event unconditionally clear the OTHER driver/helper
-- field-pair whenever one is reassigned. That's correct for Ride/Medical/
-- Sports, where driver/helper are genuinely mutually exclusive
-- alternatives for the SAME transport concept — but WRONG for Study,
-- which deliberately splits tutor (helper) from driver (transport) into
-- two DIFFERENT people who are both meant to be set simultaneously (see
-- EventFormModal.tsx's Study "Drive Assignment" section, fixed in the
-- same session as this migration). Reassigning a Study event's DRIVER
-- (e.g. via "Take Over"/"Override" on the transport half) would have
-- silently wiped the TUTOR the moment this shipped — caught before any
-- live report by re-checking assign_event_role's identical fix
-- (20260940050000) against its own real call sites.
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
  v_event_category text;
  v_actor_family text;
  v_new_member_family text;
  v_active_member_id text;
  v_new_member_role text;
  v_open_to_gp boolean;
  v_open_to_teens boolean;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  select family_id, category, is_open_to_grandparents, is_open_to_teens
    into v_event_family, v_event_category, v_open_to_gp, v_open_to_teens
    from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;
  select family_id, role into v_new_member_family, v_new_member_role from public.members where id = p_new_member_id;
  if v_new_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_new_member_id, p_event_id;
  end if;

  if p_new_member_id <> p_actor_id then
    if v_new_member_role = 'grandparent' and coalesce(v_open_to_gp, false) is not true then
      raise exception 'not_open_to_grandparents: member % is not a valid driver/helper for this event', p_new_member_id
        using errcode = 'P0001';
    end if;
    if v_new_member_role = 'teenager' and coalesce(v_open_to_teens, false) is not true then
      raise exception 'not_open_to_teens: member % is not a valid driver/helper for this event', p_new_member_id
        using errcode = 'P0001';
    end if;
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
      helper_name = case when v_event_category = 'Study' then helper_name else null end,
      helper_id   = case when v_event_category = 'Study' then helper_id   else null end,
      helper_status = case when v_event_category = 'Study' then helper_status else null end,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;

    if v_prior_driver_id is not null and v_prior_driver_id <> p_new_member_id then
      update public.trips
        set completed_at = now()
        where driver_member_id = v_prior_driver_id and completed_at is null
          and event_id = p_event_id;
    end if;
  else
    update public.calendar_events set helper_name = v_member_name, helper_id = p_new_member_id, helper_status = v_status,
      driver_name = case when v_event_category = 'Study' then driver_name else null end,
      driver_id   = case when v_event_category = 'Study' then driver_id   else null end,
      driver_status = case when v_event_category = 'Study' then driver_status else null end,
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
