-- confirm_event_assignment's "(legacy)" fallback branch (for an event
-- assigned via the direct calendar_events.driver_name/helper_name columns,
-- with no matching event_participants row yet) matched by
-- `driver_name = v_member_name` / `helper_name = v_member_name` — a plain
-- display-name string compare, exactly the class of bug this session's
-- "always compare by real member id, never blind-match on name" mandate
-- targeted everywhere else. calendar_events.driver_id/helper_id already
-- exist (migration 20260930240000) and are kept in sync by
-- assign_event_role/reassign_event, so the fallback can and should match
-- on those instead — a renamed member, or two members sharing a first
-- name, would otherwise silently confirm the wrong (or no) row.
create or replace function public.confirm_event_assignment(p_event_id text, p_member_id text, p_role text)
returns event_participants
language plpgsql
security definer
set search_path to 'public'
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
      where id = p_event_id and driver_id = p_member_id and driver_status = 'pending'
      returning * into v_event;
  else
    update public.calendar_events
      set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where id = p_event_id and helper_id = p_member_id and helper_status = 'pending'
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
