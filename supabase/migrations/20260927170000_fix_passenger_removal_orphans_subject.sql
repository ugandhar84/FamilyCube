-- Fix: remove_event_passenger silently detached an event from its own
-- primary subject. Found via exploratory cross-role QA
-- (docs/master_flow_exploratory_findings.md, calendar-events section,
-- finding #4): calendar_events.member_id doubles as both "the event's
-- primary subject" (used everywhere as "for <kid>" — hubComponents.tsx's
-- "Attending:" chip, HelperEventCard.tsx's kid-name lookup, KidView.tsx's
-- confirmedRide subject match) AND the seed value this RPC nulled out
-- whenever the removed passenger happened to match it. Live-confirmed:
-- removing a kid who was both the event's subject and its sole passenger
-- set member_id=null, and every downstream "who is this ride for" lookup
-- then resolved to nothing — a driver-facing card would show a ride with no
-- named kid at all.
--
-- Fix: never touch member_id here. Removing a passenger row is a distinct
-- action from clearing/reassigning the event's subject — the two should
-- never be coupled as a side effect. member_ids (the plural, multi-passenger
-- array) still correctly drops the removed person.

create or replace function public.remove_event_passenger(p_event_id text, p_member_id text, p_actor_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_family text;
  v_actor_family text;
begin
  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;

  delete from public.event_participants where event_id = p_event_id and member_id = p_member_id and role = 'passenger';

  update public.calendar_events
    set member_ids = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_array_elements_text(coalesce(member_ids, '[]'::jsonb)) as x
        ) s where x != p_member_id),
        updated_at = now()
    where id = p_event_id;
end;
$$;
