-- Fix: assign_event_role could create a pending assignment that could never
-- be confirmed. Found via exploratory cross-role QA
-- (docs/master_flow_exploratory_findings.md, calendar-events section,
-- finding #1): assign_event_role never checked is_open_to_teens/
-- is_open_to_grandparents before creating a 'pending' assignment, but the
-- enforce_open_to_flag_on_claim() trigger enforces that same flag later, on
-- the transition into 'confirmed'. Live-confirmed: with the flag off, a
-- direct assign to a teen succeeded and showed a normal Confirm/Can't
-- card — tapping Confirm then threw a raw Postgres exception, surfaced to
-- the teen only as a generic "Couldn't confirm — try again" toast with zero
-- indication it could never succeed as configured.
--
-- Unreachable via the manual "assign a driver" screen today (EventFormModal
-- already filters ineligible people out of the picker), but this closes the
-- gap in the RPC itself as defense-in-depth against any other/future
-- direct-assignment path, mirroring the trigger's own guard exactly (same
-- role check, same exemption — only grandparent/teenager are gated; a
-- parent can always be assigned regardless of either flag).

create or replace function public.assign_event_role(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
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
begin
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
    update public.calendar_events set driver_name = v_member_name, driver_status = 'pending', ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  else
    update public.calendar_events set helper_name = v_member_name, helper_status = 'pending',
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_assigned', 'pending', v_transition_id,
      format('%s assigned as %s', v_member_name, p_role)
    from public.calendar_events ce where ce.id = p_event_id;

  return v_row;
end;
$$;
