-- Live QA finding (pass 2, docs/qa_chore_handoff_bounty_audit.html, High):
-- assign_event_role never cleared the OPPOSITE driver/helper field-pair —
-- the same stale-field bug class reassign_event was already fixed for in
-- pass 1 (migration 20260940020000). A fresh driver assignment left a
-- stale helper_name/helper_id in place (and vice versa), and since
-- eventAssignee() (store/eventStore.ts) reads the helper field before the
-- driver field, the real fresh assignment could become completely
-- invisible in the UI — live-reproduced in both directions by the QA pass.
--
-- IMPORTANT difference from reassign_event's fix: this RPC is currently
-- unreachable from any live client call site (grepped the whole app —
-- zero callers), so this is a genuine latent bug, not something currently
-- affecting a real user, but the fix still needs to be CORRECT for
-- whenever it is wired up. Blindly clearing the other pair unconditionally
-- (reassign_event's own fix) would be WRONG for a Study event specifically:
-- Study is the one category where helper (tutor) and driver (transport)
-- are deliberately two DIFFERENT people set simultaneously (see
-- EventFormModal.tsx's "Study alone genuinely splits tutor... from
-- driver... into two different people" comment, and the create/edit forms'
-- own Drive Assignment sections) — clearing helper the moment a driver is
-- assigned would silently wipe a Study event's tutor. Ride/Medical/Sports
-- are the categories where driver/helper are genuinely mutually exclusive
-- alternatives for the SAME transport concept, matching reassign_event's
-- actual real-world usage. Only clear the other pair for those.
create or replace function public.assign_event_role(p_event_id text, p_member_id text, p_role text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member_name text;
  v_member_role text;
  v_row public.event_participants;
  v_transition_id uuid := gen_random_uuid();
  v_event_family text;
  v_event_category text;
  v_actor_family text;
  v_member_family text;
  v_open_to_gp boolean;
  v_open_to_teens boolean;
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;

  if p_role not in ('driver','helper') then
    raise exception 'assign_event_role only supports driver/helper roles, got %', p_role;
  end if;

  select family_id, category, is_open_to_grandparents, is_open_to_teens
    into v_event_family, v_event_category, v_open_to_gp, v_open_to_teens
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
    update public.calendar_events set
      driver_name = v_member_name, driver_id = p_member_id, driver_status = 'pending', ride_required = true,
      -- Study keeps its tutor (helper) untouched — see header comment.
      helper_name = case when v_event_category = 'Study' then helper_name else null end,
      helper_id   = case when v_event_category = 'Study' then helper_id   else null end,
      helper_status = case when v_event_category = 'Study' then helper_status else null end,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  else
    update public.calendar_events set
      helper_name = v_member_name, helper_id = p_member_id, helper_status = 'pending',
      driver_name = case when v_event_category = 'Study' then driver_name else null end,
      driver_id   = case when v_event_category = 'Study' then driver_id   else null end,
      driver_status = case when v_event_category = 'Study' then driver_status else null end,
      updated_by = p_actor_id, updated_at = now()
      where id = p_event_id;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    select 'event', p_event_id, ce.family_id::uuid, p_actor_id, 'driver_assigned', 'pending', v_transition_id,
      format('%s assigned as %s', v_member_name, p_role)
    from public.calendar_events ce where ce.id = p_event_id;

  return v_row;
end;
$function$;
