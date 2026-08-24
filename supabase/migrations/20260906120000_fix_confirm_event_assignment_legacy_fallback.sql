-- Fixes a real bug: confirm_event_assignment's CAS requires a matching
-- event_participants row with status='pending' for (event_id, role,
-- member_id). But EventFormModal (Create/Edit Event) still writes
-- driver_name/driver_status directly to calendar_events only — it never
-- creates the event_participants row confirm_event_assignment expects. So
-- for any event whose driver/helper was assigned via the create/edit form
-- (not via an action-button RPC like reassign_event/claim_event_slot), the
-- Confirm button is clickable but silently fails every time: the CAS
-- matches zero rows, the function raises, and the client's .then() just
-- console.warns — invisible to the user (reported live: "Confirm button
-- not doing anything at all").
--
-- Fix: when no event_participants row exists yet for that role, fall back
-- to confirming directly against the legacy driver_status/helper_status
-- columns (same CAS shape — only flips 'pending' -> 'confirmed' for the
-- actual named assignee). Self-heals every already-broken event
-- immediately with no backfill needed; once event_participants rows exist
-- (from an RPC-driven assignment), the normal path is unchanged.
create or replace function public.confirm_event_assignment(
  p_event_id text, p_member_id text, p_role text
)
returns public.event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event public.calendar_events;
  v_member_name text;
begin
  perform 1 from public.calendar_events where id = p_event_id for update;

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

  -- No event_participants row for this role — legacy-only assignment
  -- (written directly by EventFormModal). Fall back to the same CAS
  -- shape against driver_name/driver_status or helper_name/helper_status,
  -- authorizing on the caller's own name matching the legacy assignee.
  select name into v_member_name from public.members where id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events
      set driver_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where id = p_event_id and driver_name = v_member_name and driver_status = 'pending'
      returning * into v_event;
  else
    update public.calendar_events
      set helper_status = 'confirmed', updated_by = p_member_id, updated_at = now()
      where id = p_event_id and helper_name = v_member_name and helper_status = 'pending'
      returning * into v_event;
  end if;

  if v_event.id is null then
    raise exception 'no pending % assignment for member % on event %', p_role, p_member_id, p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('event', p_event_id, v_event.family_id::uuid, p_member_id, 'driver_reassigned', 'pending', 'confirmed', v_transition_id,
      format('%s confirmed as %s (legacy)', v_member_name, p_role));

  -- Best-effort: also create the event_participants row now so future
  -- actions on this event (decline, reassign) have a real row to work
  -- with, same shape reassign_event itself would have inserted.
  insert into public.event_participants (event_id, member_id, member_name, role, status, responded_at)
    values (p_event_id, p_member_id, v_member_name, p_role, 'confirmed', now())
    on conflict (event_id, member_id, role) do update set status = 'confirmed', responded_at = now()
    returning * into v_row;

  return v_row;
end;
$$;
