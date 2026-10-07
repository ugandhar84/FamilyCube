-- trips: add phase tracking + driver notes for the Rides Control Room /
-- Active Trip Detail screens.
--
-- phase maps to the 4-stage progress track shown in the UI:
--   assigned  → driver accepted but hasn't left yet (driver_status='confirmed')
--   en_route  → driver has tapped "I'm on my way"
--   picked_up → driver has tapped "Picked up"
--   arrived   → trip completed at destination (triggers completed_at)
--
-- notes is a free-text field the driver can update from the Active Trip
-- Detail screen ("5 minutes away", "stuck at lights", etc.). Visible to
-- all family members via the same SELECT RLS that already covers the table.

alter table public.trips
  add column if not exists phase text not null default 'assigned'
    check (phase in ('assigned', 'en_route', 'picked_up', 'arrived')),
  add column if not exists driver_notes text;

-- RPC: advance_trip_phase
-- Called when the driver taps "I'm on my way" / "Mark as picked up" / etc.
-- Validates the phase transition is forward-only (can't go back to assigned
-- once en_route) and sets completed_at when phase becomes 'arrived'.
create or replace function public.advance_trip_phase(
  p_trip_id   text,
  p_new_phase text,
  p_notes     text default null
)
returns void language plpgsql security definer as $$
declare
  v_current_phase text;
  v_family_id     uuid;
  v_caller_id     text;
begin
  v_caller_id := resolve_active_member_id();

  select phase, family_id
    into v_current_phase, v_family_id
    from public.trips
   where id = p_trip_id;

  if not found then
    raise exception 'trip not found: %', p_trip_id;
  end if;

  -- Verify caller belongs to this family
  if not exists (
    select 1 from public.members
     where id = v_caller_id and family_id = v_family_id
  ) then
    raise exception 'not authorised to update trip %', p_trip_id;
  end if;

  -- Phase order check (forward-only)
  declare
    phases text[] := array['assigned','en_route','picked_up','arrived'];
    old_idx int := array_position(phases, v_current_phase);
    new_idx int := array_position(phases, p_new_phase);
  begin
    if new_idx is null then
      raise exception 'invalid phase: %', p_new_phase;
    end if;
    if new_idx <= old_idx then
      raise exception 'phase cannot go backwards (% → %)', v_current_phase, p_new_phase;
    end if;
  end;

  update public.trips
     set phase        = p_new_phase,
         driver_notes = coalesce(p_notes, driver_notes),
         completed_at = case when p_new_phase = 'arrived' then now() else completed_at end,
         updated_at   = now()
   where id = p_trip_id;
end;
$$;

grant execute on function public.advance_trip_phase(text, text, text)
  to authenticated;

-- calendar_events: dismiss flag for "Trip Never Started" banner
-- (previously auto-cleared after 1h with no DB persistence — see MEMORY.md)
alter table public.calendar_events
  add column if not exists trip_never_started_dismissed_at timestamptz;

comment on column public.calendar_events.trip_never_started_dismissed_at
  is 'Set when a parent dismisses the Trip Never Started banner — persists across app restarts';
