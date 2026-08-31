-- Real gap found by a deep exploratory QA trace of Events & Rides:
-- reassign_event's "close out the prior driver's trip" side effect had no
-- way to scope itself to the specific event being reassigned — trips had
-- no event_id column at all, only driver_member_id. Reassigning ONE
-- event's driver away from someone who happens to have a genuinely
-- unrelated in-progress trip active (for a DIFFERENT event) would
-- silently mark that unrelated trip completed too, since the update only
-- ever matched on driver_member_id + completed_at is null.
--
-- Fix: add a nullable event_id column (nullable because the manual
-- "dispatch now" flow — HubScreen's onDispatchDirect for a driver who
-- just decides to drive with no specific linked event — legitimately has
-- no event to attach; the "Up Next"-linked dispatch does), and scope
-- reassign_event's completion update to it when a trip actually has one.
alter table public.trips add column if not exists event_id text;

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
  v_new_member_role text;
  v_open_to_gp boolean;
  v_open_to_teens boolean;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
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
  select family_id, role into v_new_member_family, v_new_member_role from public.members where id = p_new_member_id;
  if v_new_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_new_member_id, p_event_id;
  end if;

  -- Real gap fixed: reassign_event previously had no eligibility check at
  -- all, unlike its sibling assign_event_role — a parent could reassign an
  -- ineligible grandparent/teen into a pending slot. Self-reassignment is
  -- exempt (someone stepping in as their own confirmed pick doesn't need
  -- the same "is this person even allowed to be offered this" gate a
  -- parent putting a THIRD PARTY into pending does).
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
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;

    if v_prior_driver_id is not null and v_prior_driver_id <> p_new_member_id then
      -- Scoped strictly to a trip actually linked to THIS event — a
      -- driver's genuinely unrelated in-progress trip (a different event,
      -- or a manual "dispatch now" with no linked event at all) is no
      -- longer swept up by this, closing the bug outright. A trip with no
      -- event_id can't be safely inferred as related, so it's simply left
      -- alone rather than guessed at.
      update public.trips
        set completed_at = now()
        where driver_member_id = v_prior_driver_id and completed_at is null
          and event_id = p_event_id;
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
