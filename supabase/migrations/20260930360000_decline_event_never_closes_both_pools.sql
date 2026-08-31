-- Live QA finding: a grandparent's decline correctly reopens only the
-- grandparent pool (not the teen pool) per the comment already in this
-- function — but if the ride was never open to teens either, that leaves
-- it reopened to NEITHER pool, silently indistinguishable from "nobody
-- has looked at this yet," with no signal to the parent that it needs a
-- fresh "Open to Helpers" tap. Fix: if the decline would otherwise leave
-- BOTH pools closed, fall back to opening both — a ride quietly visible
-- to nobody is worse than one open slightly wider than strictly necessary.
create or replace function public.decline_event_assignment(p_event_id text, p_member_id text, p_role text, p_reason text default null)
returns calendar_events
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event public.calendar_events;
  v_category text;
  v_ride_required boolean;
  v_result public.calendar_events;
  v_transition_id uuid := gen_random_uuid();
  v_member_family text;
  v_member_role text;
  v_active_member_id text;
  v_reopen_gp boolean;
  v_reopen_teens boolean;
  v_is_ride boolean;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_event from public.calendar_events where id = p_event_id for update;
  if v_event.id is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id, role into v_member_family, v_member_role from public.members where id = p_member_id;
  if v_member_family is distinct from v_event.family_id::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  v_category := v_event.category;
  v_ride_required := v_event.ride_required;
  v_is_ride := (v_category = 'Ride' or v_ride_required);
  v_reopen_gp := v_is_ride and (v_member_role != 'teenager');
  v_reopen_teens := v_is_ride and (v_member_role != 'grandparent');

  -- If this decline would leave the ride closed to BOTH pools — i.e. the
  -- pool this decliner didn't come from was also never open — reopen both
  -- instead of leaving it silently closed to everyone. Checked against the
  -- row's state BEFORE this update, not just this decline's own reopen
  -- flags (a grandparent declining always sets v_reopen_teens=false; that's
  -- fine as long as the teen pool was ALREADY open from something else).
  if v_is_ride and not v_reopen_gp and not coalesce(v_event.is_open_to_grandparents, false)
     and not v_reopen_teens and not coalesce(v_event.is_open_to_teens, false) then
    v_reopen_gp := true;
    v_reopen_teens := true;
  end if;

  update public.event_participants
    set status = 'rejected', decline_reason = p_reason, responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  delete from public.event_participants
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events set
      driver_name = null, driver_status = null,
      is_open_to_grandparents = case when v_reopen_gp then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_reopen_teens then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  else
    update public.calendar_events set
      helper_name = null, helper_status = null, helper_declined_by = p_member_id, helper_decline_reason = p_reason,
      is_open_to_grandparents = case when v_reopen_gp then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_reopen_teens then true else is_open_to_teens end,
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
