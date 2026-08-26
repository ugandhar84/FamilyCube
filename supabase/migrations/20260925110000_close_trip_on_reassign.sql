-- Fixes a real gap found in the master-flow audit: reassign_event only
-- ever touched calendar_events.driver_name/helper_name — it never looked
-- at the SEPARATE trips table (store/tripStore.ts's Pick-up Radar "En
-- Route" state, keyed by driver_member_id with no FK back to the event).
-- If the outgoing driver had already dispatched (tapped "Start Trip"),
-- reassigning the ride to someone else left their trip row active
-- forever — every family member's realtime-synced En Route banner kept
-- showing a driver who was no longer actually assigned to anything.
--
-- Fix: when a 'driver' role is reassigned AWAY from someone, close any
-- of THAT PERSON's still-active trips (completed_at is null). Scoped to
-- the outgoing driver, not the event (trips has no event_id to match on)
-- — correct per tripStore.ts's own stated invariant that one person can't
-- sanely be en route to two places at once, so "this driver's active
-- trip" is unambiguous. Self-reassignment (p_new_member_id = the same
-- outgoing driver) never fires this, since there's no "outgoing" driver
-- in that case.
create or replace function public.reassign_event(
  p_event_id text, p_new_member_id text, p_role text, p_actor_id text
)
returns public.event_participants
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
begin
  perform 1 from public.calendar_events where id = p_event_id for update;

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

    -- Close the outgoing driver's active trip, if any — see migration
    -- header comment for why this is scoped to the person, not the event.
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

comment on function public.reassign_event(text, text, text, text) is 'Authority-based reassignment (edit form, Take Over button) — not a CAS, the actor already has the right to override. Also closes the outgoing driver''s active trip (if any) when role=driver, so Pick-up Radar cannot show a stale "en route" banner for someone no longer assigned.';
