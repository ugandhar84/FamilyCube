-- Live-reported gap: confirm_event_assignment_series_forward (20260931010000)
-- already lets one tap sweep a daily/weekly series forward, but decline and
-- reassign had no equivalent — declining as driver, or reassigning the
-- driver, only ever touched the single tapped occurrence. A parent who
-- can no longer drive "every Wednesday" had to decline 10+ individual
-- future rows one at a time, and each still showed them as confirmed
-- driver until they did. These two new RPCs mirror the confirm-series
-- pattern exactly: act on the tapped row via the existing, already-correct
-- single-event RPC, then (only when p_scope = 'all_future') sweep forward
-- through the same series — decline clears every future row still held by
-- the SAME member/role, reassign hands every future row still pending (or
-- held by the member being replaced) to the new assignee. A row already
-- resolved differently (someone else confirmed, or already declined) is
-- left untouched — this never overwrites another person's assignment.

create or replace function public.decline_event_assignment_series_forward(
  p_event_id text,
  p_member_id text,
  p_role text,
  p_reason text default null,
  p_scope text default 'this'
)
returns setof calendar_events
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_target public.calendar_events;
  v_series_id text;
  v_target_date text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  if p_role not in ('driver', 'helper') then
    raise exception 'invalid role %', p_role;
  end if;

  if p_scope not in ('this', 'all_future') then
    raise exception 'invalid scope %', p_scope;
  end if;

  perform public.decline_event_assignment(p_event_id, p_member_id, p_role, p_reason);

  select * into v_target from public.calendar_events where id = p_event_id;
  v_series_id := v_target.series_id;
  v_target_date := v_target.date;

  if p_scope <> 'all_future' or v_series_id is null then
    return query select * from public.calendar_events where id = p_event_id;
    return;
  end if;

  if p_role = 'driver' then
    update public.calendar_events
      set driver_name = null, driver_id = null, driver_status = null,
          updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and driver_id = p_member_id;
  else
    update public.calendar_events
      set helper_name = null, helper_id = null, helper_status = null,
          helper_declined_by = p_member_id, helper_decline_reason = p_reason,
          updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and helper_id = p_member_id;
  end if;

  return query
    select * from public.calendar_events
    where (series_id = v_series_id and deleted_at is null) or id = p_event_id
    order by date;
end;
$function$;

-- reassign_event_series_forward — same shape, for the "Reassign" picker.
-- Only sweeps rows that are still either unassigned/pending for that role,
-- or currently held by the member being REPLACED (v_prior_member_id) — a
-- future occurrence already reassigned to a third person, or already
-- confirmed by someone else, is left alone.
create or replace function public.reassign_event_series_forward(
  p_event_id text,
  p_new_member_id text,
  p_role text,
  p_actor_id text,
  p_scope text default 'this'
)
returns setof calendar_events
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_series_id text;
  v_target_date text;
  v_prior_member_id text;
begin
  if p_role not in ('driver', 'helper') then
    raise exception 'invalid role %', p_role;
  end if;

  if p_scope not in ('this', 'all_future') then
    raise exception 'invalid scope %', p_scope;
  end if;

  if p_role = 'driver' then
    select driver_id into v_prior_member_id from public.calendar_events where id = p_event_id;
  else
    select helper_id into v_prior_member_id from public.calendar_events where id = p_event_id;
  end if;

  perform public.reassign_event(p_event_id, p_new_member_id, p_role, p_actor_id);

  select series_id, date into v_series_id, v_target_date from public.calendar_events where id = p_event_id;

  if p_scope <> 'all_future' or v_series_id is null then
    return query select * from public.calendar_events where id = p_event_id;
    return;
  end if;

  if p_role = 'driver' then
    update public.calendar_events set
      driver_name = (select name from public.members where id = p_new_member_id),
      driver_id = p_new_member_id,
      driver_status = case when p_new_member_id = p_actor_id then 'confirmed' else 'pending' end,
      ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and (driver_id is null or driver_id = v_prior_member_id or driver_status = 'pending');
  else
    update public.calendar_events set
      helper_name = (select name from public.members where id = p_new_member_id),
      helper_id = p_new_member_id,
      helper_status = case when p_new_member_id = p_actor_id then 'confirmed' else 'pending' end,
      updated_by = p_actor_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and (helper_id is null or helper_id = v_prior_member_id or helper_status = 'pending');
  end if;

  return query
    select * from public.calendar_events
    where (series_id = v_series_id and deleted_at is null) or id = p_event_id
    order by date;
end;
$function$;
