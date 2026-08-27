-- Fix: decline_event_assignment force-opened BOTH is_open_to_grandparents
-- AND is_open_to_teens on any Ride-category decline, regardless of which
-- pool the decliner actually came from — a GP declining could newly expose
-- the ride to teens who had zero prior involvement, and vice versa. Found
-- via exploratory cross-role QA (docs/master_flow_exploratory_findings.md).
--
-- Fix: only ensure the DECLINER's OWN pool flag stays open (it must already
-- have been true, or they couldn't have been assigned in the first place —
-- this just guards against a stale false), leaving whichever pool WASN'T
-- involved untouched. A parent who wants to widen the search further can
-- still do so explicitly via the routing toggles, same as any other case.

create or replace function public.decline_event_assignment(p_event_id text, p_member_id text, p_role text, p_reason text default null)
returns calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.calendar_events;
  v_result public.calendar_events;
  v_transition_id uuid := gen_random_uuid();
  v_member_family text;
  v_member_role text;
begin
  select * into v_event from public.calendar_events where id = p_event_id for update;
  if v_event.id is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id, role into v_member_family, v_member_role from public.members where id = p_member_id;
  if v_member_family is distinct from v_event.family_id::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

  update public.event_participants
    set status = 'rejected', decline_reason = p_reason, responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  delete from public.event_participants
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events set
      driver_name = null, driver_status = null,
      is_open_to_grandparents = case when v_member_role = 'grandparent' then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_member_role = 'teenager'    then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  else
    update public.calendar_events set
      helper_name = null, helper_status = null, helper_declined_by = p_member_id, helper_decline_reason = p_reason,
      is_open_to_grandparents = case when v_member_role = 'grandparent' then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_member_role = 'teenager'    then true else is_open_to_teens end,
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
