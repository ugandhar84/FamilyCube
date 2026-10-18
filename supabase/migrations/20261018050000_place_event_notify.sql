-- Place arrive/leave: (1) only act while the person's location sharing is ON, so turning sharing off really stops it; (2) tell the
-- caller who to alert so the phone can push "Cherry arrived at School" to parents. Children (kid / teen) are reported to the
-- family's parents; an adult's own arrivals and departures are not pushed to anyone.
drop function if exists public.record_place_event(text, uuid, text);

create or replace function public.record_place_event(p_member_id text, p_place_id uuid, p_event text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active text;
  v_family uuid;
  v_place public.family_places;
  v_status text;
  v_member public.members;
  v_sharing boolean;
  v_notify text[];
begin
  v_active := public.resolve_active_member_id();
  if v_active is null or v_active is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;
  if p_event not in ('enter', 'exit') then
    raise exception 'invalid place event %', p_event;
  end if;
  select * into v_member from public.members where id = p_member_id;
  v_family := v_member.family_id;
  select * into v_place from public.family_places where id = p_place_id;
  if v_place.id is null or v_place.family_id is distinct from v_family then
    raise exception 'place not found';
  end if;
  if coalesce(array_length(v_place.member_ids, 1), 0) > 0 and not (p_member_id = any (v_place.member_ids)) then
    return jsonb_build_object('skipped', true, 'reason', 'not_assigned');
  end if;

  select coalesce(share_location_enabled, false) into v_sharing from public.member_locations where member_id = p_member_id;
  if not coalesce(v_sharing, false) then
    return jsonb_build_object('skipped', true, 'reason', 'sharing_off');
  end if;

  v_status := case v_place.kind when 'home' then 'at_home' when 'school' then 'at_school' when 'work' then 'at_work' else 'at_activity' end;

  if p_event = 'enter' then
    update public.member_locations
      set status = v_status, status_text = null, safe_zone_name = v_place.name, last_updated = now()
      where member_id = p_member_id;
  else
    update public.member_locations
      set status = 'in_transit', status_text = null, safe_zone_name = null, last_updated = now()
      where member_id = p_member_id and safe_zone_name is not distinct from v_place.name;
  end if;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, to_status, transition_id, note)
    values ('place', v_place.id::text, v_family, p_member_id,
            case when p_event = 'enter' then 'place_arrived' else 'place_left' end,
            v_status, gen_random_uuid(), v_place.name);

  v_notify := '{}';
  if v_member.role in ('kid', 'child', 'teen', 'teenager') then
    select coalesce(array_agg(id), '{}') into v_notify from public.members
      where family_id = v_family and role = 'parent' and id <> p_member_id and deleted_at is null;
  end if;

  return jsonb_build_object('skipped', false, 'place_name', v_place.name, 'kind', v_place.kind, 'event', p_event,
    'member_name', split_part(v_member.name, ' ', 1), 'family_id', v_family, 'notify_ids', to_jsonb(v_notify));
end;
$function$;
