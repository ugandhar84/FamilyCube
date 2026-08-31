-- Logged QA gap: unlike chore_tasks (fixed earlier this session with
-- update_chore_task_checked), calendar_events had no compare-and-set on
-- its plain field edits — two co-parents editing the exact same field on
-- the exact same event within the same instant still silently
-- last-write-wins with zero warning to whoever's edit was discarded.
-- Deliberately scoped narrowly to the free-text/date-time fields a person
-- types directly into an edit sheet (title/notes/location/date/start_time/
-- end_time) rather than the full updateEvent() surface — that function
-- also drives a lot of interdependent status-transition logic (decline-
-- and-reopen, auto-confirm, notification triggers) where a broad
-- version-check could break a legitimate multi-step call in ways this
-- narrower fix avoids.
create or replace function public.update_calendar_event_text_checked(
  p_event_id text,
  p_title text default null,
  p_has_title boolean default false,
  p_notes text default null,
  p_has_notes boolean default false,
  p_location text default null,
  p_has_location boolean default false,
  p_date text default null,
  p_has_date boolean default false,
  p_start_time text default null,
  p_has_start_time boolean default false,
  p_end_time text default null,
  p_has_end_time boolean default false,
  p_expected_updated_at timestamptz default null
)
returns public.calendar_events
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_current public.calendar_events;
  v_result public.calendar_events;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null then
    raise exception 'caller is not a verified family member';
  end if;

  select * into v_current from public.calendar_events where id = p_event_id for update;
  if v_current.id is null then
    raise exception 'event % not found', p_event_id;
  end if;

  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_write: event % was changed by someone else since you last loaded it', p_event_id;
  end if;

  update public.calendar_events set
    title      = case when p_has_title      then p_title      else title end,
    notes      = case when p_has_notes      then p_notes      else notes end,
    location   = case when p_has_location   then p_location   else location end,
    date       = case when p_has_date       then p_date       else date end,
    start_time = case when p_has_start_time then p_start_time else start_time end,
    end_time   = case when p_has_end_time   then p_end_time   else end_time end,
    updated_by = v_active_member_id,
    updated_at = now()
  where id = p_event_id
  returning * into v_result;

  return v_result;
end;
$function$;
