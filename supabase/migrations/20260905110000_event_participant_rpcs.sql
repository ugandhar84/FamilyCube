-- Phase 1 (cont.) — RPC functions for event_participants. Each function is
-- the ONLY writer of its transition: it row-locks, does the atomic
-- check-and-write, mirrors the matching legacy helper_*/driver_*/member_id
-- column(s) in the same statement (so any not-yet-migrated client code
-- keeps working unmodified during the rollout), and writes one summary row
-- to activity_log in the same transaction. Modeled on claim_bounty_slot's
-- existing pattern (supabase/migrations/20260825010000_claim_bounty_slot_fn.sql).
--
-- No client code calls these yet — this migration is additive/inert on its
-- own. See the plan file's Phase 2 for the file-by-file client migration
-- order.

-- ── assign_event_role ───────────────────────────────────────────────────
-- Direct assign — the assigner already has authority (a parent picking a
-- driver on create, or reassigning on edit), so this isn't a race the way
-- claim_event_slot is. Always starts 'pending', even self-assignment — an
-- explicit confirm is still required, matching the app's existing "always
-- pending, even reassigning to yourself" convention (see EventFormModal.tsx's
-- own comment to that effect).
create or replace function public.assign_event_role(
  p_event_id text, p_member_id text, p_role text, p_actor_id text
)
returns public.event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
begin
  if p_role not in ('driver','helper') then
    raise exception 'assign_event_role only supports driver/helper roles, got %', p_role;
  end if;

  perform 1 from public.calendar_events where id = p_event_id for update;
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

-- ── claim_event_slot ────────────────────────────────────────────────────
-- Race-safe self-claim of an open GP/Teen pool slot. The CAS is a real
-- unique-constraint-guarded insert: two concurrent claims for the same
-- (event, role) can't both succeed because only one INSERT can win before
-- the other sees a row already exists. Generalizes claimHelperSlot's
-- .is(dbStatusCol, null) check into something the DB itself enforces.
create or replace function public.claim_event_slot(
  p_event_id text, p_member_id text, p_role text, p_actor_id text
)
returns table (claimed boolean, participant public.event_participants)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_existing_count integer;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
begin
  if p_role not in ('driver','helper') then
    raise exception 'claim_event_slot only supports driver/helper roles, got %', p_role;
  end if;

  perform 1 from public.calendar_events where id = p_event_id for update;

  select count(*) into v_existing_count from public.event_participants
    where event_id = p_event_id and role = p_role and status in ('pending','confirmed');
  if v_existing_count > 0 then
    return query select false, null::public.event_participants;
    return;
  end if;

  select name into v_member_name from public.members where id = p_member_id;

  insert into public.event_participants (event_id, member_id, member_name, role, status)
    values (p_event_id, p_member_id, v_member_name, p_role, 'confirmed')
    on conflict (event_id, member_id, role) do nothing
    returning * into v_row;

  if v_row.id is null then
    return query select false, null::public.event_participants;
    return;
  end if;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_status = 'confirmed', ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  else
    update public.calendar_events set helper_name = v_member_name, helper_status = 'confirmed',
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_assigned', 'confirmed', v_transition_id,
      format('%s claimed the open %s slot', v_member_name, p_role)
    from public.calendar_events ce where ce.id = p_event_id;

  return query select true, v_row;
end;
$$;

-- ── confirm_event_assignment ────────────────────────────────────────────
-- CAS: only the member currently pending on that role can confirm it.
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
begin
  perform 1 from public.calendar_events where id = p_event_id for update;

  update public.event_participants
    set status = 'confirmed', responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id and status = 'pending'
    returning * into v_row;

  if v_row.id is null then
    raise exception 'no pending % assignment for member % on event %', p_role, p_member_id, p_event_id;
  end if;

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
end;
$$;

-- ── decline_event_assignment ────────────────────────────────────────────
-- Single owner of decline-and-reopen — today this logic is independently
-- duplicated across eventStore.ts's updateEvent special-casing, cantMakeIt.ts,
-- and HelperEventCard.tsx's own hand-rolled 'Can't' handler. Marks the
-- participant rejected+reason, then clears it entirely (not just marks
-- rejected) so the slot is genuinely re-claimable by claim_event_slot's
-- count check, and auto-opens the GP/Teen pool for Ride events — all
-- atomically, matching eventStore.ts's existing justDeclined/autoOpenOnDecline
-- behavior but now guaranteed consistent instead of re-derived per caller.
create or replace function public.decline_event_assignment(
  p_event_id text, p_member_id text, p_role text, p_reason text default null
)
returns public.calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.calendar_events;
  v_category text;
  v_ride_required boolean;
  v_result public.calendar_events;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_event from public.calendar_events where id = p_event_id for update;
  v_category := v_event.category;
  v_ride_required := v_event.ride_required;

  update public.event_participants
    set status = 'rejected', decline_reason = p_reason, responded_at = now()
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  delete from public.event_participants
    where event_id = p_event_id and role = p_role and member_id = p_member_id;

  if p_role = 'driver' then
    update public.calendar_events set
      driver_name = null, driver_status = null,
      is_open_to_grandparents = case when v_category = 'Ride' or v_ride_required then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_category = 'Ride' or v_ride_required then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  else
    update public.calendar_events set
      helper_name = null, helper_status = null, helper_declined_by = p_member_id, helper_decline_reason = p_reason,
      is_open_to_grandparents = case when v_category = 'Ride' or v_ride_required then true else is_open_to_grandparents end,
      is_open_to_teens        = case when v_category = 'Ride' or v_ride_required then true else is_open_to_teens end,
      updated_by = p_member_id, updated_at = now()
      where id = p_event_id
      returning * into v_result;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('event', p_event_id, v_result.family_id::uuid, p_member_id, 'driver_removed', 'rejected', v_transition_id,
      coalesce(p_reason, format('declined as %s', p_role)));

  return v_result;
end;
$$;

-- ── reassign_event ───────────────────────────────────────────────────────
-- Authority-based one-time take-over / edit-form reassignment (not a CAS —
-- the actor already has the right to override whoever's there, e.g. a
-- parent reassigning the edit form's Driven By picker, or HelperEventCard's
-- "Take Over" button). Supersedes any existing row for that role.
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
begin
  perform 1 from public.calendar_events where id = p_event_id for update;

  select name into v_member_name from public.members where id = p_new_member_id;
  -- Self-reassignment auto-confirms (matches the existing "assigning
  -- yourself" convenience in AddEventModal/EditEventModal); reassigning to
  -- someone else always starts pending, requiring their own confirm.
  v_status := case when p_new_member_id = p_actor_id then 'confirmed' else 'pending' end;

  delete from public.event_participants where event_id = p_event_id and role = p_role;

  insert into public.event_participants (event_id, member_id, member_name, role, status, responded_at)
    values (p_event_id, p_new_member_id, v_member_name, p_role, v_status, case when v_status = 'confirmed' then now() else null end)
    returning * into v_row;

  if p_role = 'driver' then
    update public.calendar_events set driver_name = v_member_name, driver_status = v_status, ride_required = true,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
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

-- ── add_event_passenger / remove_event_passenger ────────────────────────
-- Passengers are role='passenger' rows with no status — no CAS needed
-- (multiple passengers are expected, not a race), but still atomic and
-- still mirrors member_id/member_ids so unmigrated reads keep working.
create or replace function public.add_event_passenger(p_event_id text, p_member_id text)
returns public.event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_row public.event_participants;
  v_primary_member_id text;
begin
  perform 1 from public.calendar_events where id = p_event_id for update;
  select name into v_member_name from public.members where id = p_member_id;

  insert into public.event_participants (event_id, member_id, member_name, role)
    values (p_event_id, p_member_id, v_member_name, 'passenger')
    on conflict (event_id, member_id, role) do nothing
    returning * into v_row;

  select member_id into v_primary_member_id from public.calendar_events where id = p_event_id;
  if v_primary_member_id is null then
    update public.calendar_events set member_id = p_member_id, updated_at = now() where id = p_event_id;
  else
    update public.calendar_events
      set member_ids = (select jsonb_agg(distinct x) from (
            select jsonb_array_elements_text(coalesce(member_ids, '[]'::jsonb)) as x
            union select p_member_id
          ) s),
          updated_at = now()
      where id = p_event_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.remove_event_passenger(p_event_id text, p_member_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.calendar_events where id = p_event_id for update;

  delete from public.event_participants where event_id = p_event_id and member_id = p_member_id and role = 'passenger';

  update public.calendar_events
    set member_id = case when member_id = p_member_id then null else member_id end,
        member_ids = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
              select jsonb_array_elements_text(coalesce(member_ids, '[]'::jsonb)) as x
            ) s where x != p_member_id),
        updated_at = now()
    where id = p_event_id;
end;
$$;

comment on function public.assign_event_role(text, text, text, text) is 'Direct-assign a driver/helper (assigner has authority, no race) — writes event_participants and mirrors the legacy driver_*/helper_* columns.';
comment on function public.claim_event_slot(text, text, text, text) is 'Race-safe self-claim of an open GP/Teen driver/helper slot. Generalizes claimHelperSlot''s CAS into a real unique-constraint-guarded insert.';
comment on function public.confirm_event_assignment(text, text, text) is 'CAS: only the member currently pending on that role can confirm it.';
comment on function public.decline_event_assignment(text, text, text, text) is 'Single owner of decline-and-reopen for events — clears the assignee and auto-opens the GP/Teen pool for Ride events, atomically.';
comment on function public.reassign_event(text, text, text, text) is 'Authority-based reassignment (edit form, Take Over button) — not a CAS, the actor already has the right to override.';
comment on function public.add_event_passenger(text, text) is 'Adds a passenger (role with no status) — replaces direct member_id/member_ids array writes.';
comment on function public.remove_event_passenger(text, text) is 'Removes a passenger.';
