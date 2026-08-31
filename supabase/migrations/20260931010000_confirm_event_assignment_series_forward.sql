-- Live-reported UX gap, not a security bug: a daily recurring ride
-- ("Pick up Praveena from Office every day") materializes one
-- calendar_events row per occurrence (up to RECURRENCE_WINDOW_DAYS), each
-- independently 'pending' until confirmed — by design, per this session's
-- own updateEventScoped comments: assignment status is deliberately a
-- per-OCCURRENCE decision (someone might be free Monday but not Tuesday),
-- so a bulk schedule/assignee EDIT must never blanket-reset/confirm status
-- across a whole series. That fix is still correct and untouched here.
--
-- But an explicit, one-at-a-time "Confirm I'll do it" tap is a different
-- action from a bulk edit — the user wants tapping Confirm once on a daily
-- series to apply going forward by default, not force 84+ individual taps.
-- This is a NEW targeted RPC, not a change to confirm_event_assignment
-- itself (every existing single-event call site keeps its current
-- behavior unchanged) — it confirms the tapped occurrence, then sweeps
-- forward through the SAME series, confirming only occurrences where the
-- SAME member holds the SAME role and is still pending. An occurrence
-- later reassigned to someone else, or already declined/confirmed by a
-- different flow, is left untouched — this never overwrites another
-- person's assignment or an already-resolved one.
create or replace function public.confirm_event_assignment_series_forward(
  p_event_id text,
  p_member_id text,
  p_role text
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

  -- Confirm the tapped occurrence itself via the existing, already-correct
  -- single-event RPC — reuses its own family/ownership/status checks
  -- rather than duplicating them.
  perform public.confirm_event_assignment(p_event_id, p_member_id, p_role);

  select * into v_target from public.calendar_events where id = p_event_id;
  v_series_id := v_target.series_id;
  v_target_date := v_target.date;

  -- A one-off (non-recurring) event has no series to sweep forward into —
  -- the single confirm above is the whole job.
  if v_series_id is null then
    return query select * from public.calendar_events where id = p_event_id;
    return;
  end if;

  if p_role = 'driver' then
    update public.calendar_events
      set driver_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and driver_id = p_member_id
        and driver_status = 'pending';
  else
    update public.calendar_events
      set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and helper_id = p_member_id
        and helper_status = 'pending';
  end if;

  return query
    select * from public.calendar_events
    where (series_id = v_series_id and deleted_at is null) or id = p_event_id
    order by date;
end;
$function$;
