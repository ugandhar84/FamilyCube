-- Security fix: add_event_passenger / remove_event_passenger had no caller-
-- identity parameter at all, so the family check added in
-- 20260927130000_security_fix_cross_family_gaps.sql only validated the
-- TARGET member's family, never the ACTOR's. Found by the Pass 3 QA agent
-- (docs/master_flow_qa_report_pass3.md, Section A "NEW-01"): a parent from
-- Family A could successfully add or remove a Family B member as a
-- passenger on a Family B event, with zero exception raised, as long as
-- they knew the event id and member id. Every other function in the same
-- migration takes an actor/caller id; these two never did. No client call
-- site currently invokes either function (grepped clean), so this closes
-- the gap before any UI wiring reaches it.
--
-- Adds a required p_actor_id, checked against the event's family, mirroring
-- assign_event_role's exact pattern. Old 2-arg signatures are dropped first
-- since no client call site invokes them (grepped clean) and Postgres would
-- otherwise keep the vulnerable overload alongside the fixed one.

drop function if exists public.add_event_passenger(text, text);
drop function if exists public.remove_event_passenger(text, text);

create or replace function public.add_event_passenger(p_event_id text, p_member_id text, p_actor_id text)
returns event_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
  v_row public.event_participants;
  v_primary_member_id text;
  v_event_family text;
  v_actor_family text;
  v_member_family text;
begin
  select family_id into v_event_family from public.calendar_events where id = p_event_id for update;
  if v_event_family is null then
    raise exception 'event % not found', p_event_id;
  end if;
  select family_id into v_actor_family from public.members where id = p_actor_id;
  if v_actor_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_actor_id, p_event_id;
  end if;
  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_event_family::text then
    raise exception 'member % is not in the same family as event %', p_member_id, p_event_id;
  end if;

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
    set member_id = case when member_id = p_member_id then null else member_id end,
        member_ids = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
              select jsonb_array_elements_text(coalesce(member_ids, '[]'::jsonb)) as x
            ) s where x != p_member_id),
        updated_at = now()
    where id = p_event_id;
end;
$$;
