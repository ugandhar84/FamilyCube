-- Live-reported gap: confirm_event_assignment_series_forward (added
-- 20260931010000) only ever flips an EXISTING pending assignment on a
-- future occurrence to 'confirmed' — it does nothing for a future
-- occurrence that has no assignee at all yet on that role. That's the
-- common case for a recurring ride created via addRecurringEvent/
-- extendRecurringSeries: only the FIRST occurrence gets a driver/helper
-- named (via assign_event_role/reassign_event, both single-row writes),
-- every later occurrence is generated as a plain copy with driver_id/
-- driver_status (or helper_id/helper_status) left NULL — genuinely
-- unassigned, not "pending."
--
-- So tapping "Confirm I'll do it" on occurrence #1 of a weekly series swept
-- zero rows (the WHERE clause requires driver_status = 'pending', which no
-- future row has), and the very next occurrence resurfaced on the Hub as
-- if nothing had happened — read live as "confirming one didn't apply to
-- the series." The user's own framing: "if user accepts one occurrence it
-- should apply for whole series automatically, right assignment" — a
-- parent who just confirmed they're doing this ride going forward
-- reasonably expects every future occurrence to get the same driver
-- pre-assigned (still pending, not silently auto-confirmed weeks ahead —
-- "later parents can decide what to do" per the same conversation, i.e.
-- don't lock in blanket auto-confirm before it's actually that day).
--
-- So this migration splits the sweep into two updates per role: (1) the
-- existing behavior, flip an already-pending same-member assignment to
-- confirmed, unchanged; (2) NEW — claim any future occurrence with NO
-- assignee at all on that role, assigning it to the same member as
-- 'pending' (not 'confirmed') so it still shows up for that occurrence's
-- own explicit confirm later, exactly like a fresh assignment would.
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
  v_member_name text;
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

  select name into v_member_name from public.members where id = p_member_id;

  if p_role = 'driver' then
    -- Existing behavior: an already-named, still-pending future occurrence
    -- for the SAME member is confirmed alongside this one.
    update public.calendar_events
      set driver_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and driver_id = p_member_id
        and driver_status = 'pending';

    -- New: a future occurrence with no driver at all yet is claimed for
    -- this member, same as a fresh assignment — left 'pending' so that
    -- occurrence's own confirm still applies when its day comes, matching
    -- the "later parents can decide what to do" intent rather than
    -- blanket-confirming weeks of rides no one has actually agreed to yet.
    update public.calendar_events
      set driver_name = v_member_name, driver_id = p_member_id, driver_status = 'pending',
          updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and driver_id is null
        and driver_name is null;
  else
    update public.calendar_events
      set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and helper_id = p_member_id
        and helper_status = 'pending';

    update public.calendar_events
      set helper_name = v_member_name, helper_id = p_member_id, helper_status = 'pending',
          updated_by = p_member_id, updated_at = now()
      where series_id = v_series_id
        and date > v_target_date
        and deleted_at is null
        and helper_id is null
        and helper_name is null;
  end if;

  return query
    select * from public.calendar_events
    where (series_id = v_series_id and deleted_at is null) or id = p_event_id
    order by date;
end;
$function$;
