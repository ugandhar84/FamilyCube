-- decline_event_assignment had a real bug: its declare block assigned a
-- `calendar_events` row into a variable typed `event_participants`
-- (`select * into v_row from calendar_events...` where v_row was declared
-- `public.event_participants`). Postgres coerces positionally by column
-- index, and since event_participants' first two columns (id uuid, event_id
-- text) don't line up with calendar_events' (id text, title text, ...), any
-- real call failed outright trying to cast a text event id into a uuid
-- column. Found during final verification against real production data —
-- no client code had called this function yet, so nothing was silently
-- broken in production, but it needed fixing before Phase 2's call sites
-- (HelperEventCard.tsx, cantMakeIt.ts, hubComponents.tsx, YourRidesSection.tsx,
-- TeenView.tsx) that already call it would have hit this on first use.
create or replace function public.decline_event_assignment(
  p_event_id text, p_member_id text, p_role text, p_reason text default null
)
returns public.calendar_events
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
begin
  select * into v_event from public.calendar_events where id = p_event_id for update;
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

comment on function public.decline_event_assignment(text, text, text, text) is 'Single owner of decline-and-reopen for events — clears the assignee and auto-opens the GP/Teen pool for Ride events, atomically.';
