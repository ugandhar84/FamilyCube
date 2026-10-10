-- Fix: remove activity_log inserts from place RPCs — activity_log has
-- entity_type check constraints that don't include 'place', causing the
-- upsert_family_place RPC to fail silently. Place changes don't need
-- activity log entries for the app to function.
create or replace function public.upsert_family_place(
  p_actor_id text, p_id uuid, p_kind text, p_name text, p_address text,
  p_lat double precision, p_lng double precision, p_radius_m integer, p_member_ids text[]
) returns public.family_places
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active text;
  v_role text;
  v_family uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_ids text[] := coalesce(p_member_ids, '{}');
  v_row public.family_places;
  v_existing public.family_places;
begin
  v_active := public.resolve_active_member_id();
  if v_active is null or v_active is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;
  select role, family_id into v_role, v_family from public.members where id = p_actor_id;
  if v_role is distinct from 'parent' then
    raise exception 'only a parent can manage family places';
  end if;
  if p_kind not in ('home', 'school', 'work', 'other') then
    raise exception 'invalid place kind %', p_kind;
  end if;
  if p_kind = 'home' then
    v_ids := '{}';
    if v_name = '' then v_name := 'Home'; end if;
  end if;
  if v_name = '' then raise exception 'a place needs a name'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;
  if exists (
    select 1 from unnest(v_ids) mid
    where not exists (select 1 from public.members m where m.id = mid and m.family_id = v_family)
  ) then
    raise exception 'every assigned member must belong to your family';
  end if;

  if p_id is not null then
    select * into v_existing from public.family_places where id = p_id for update;
    if v_existing.id is null or v_existing.family_id is distinct from v_family then
      raise exception 'place not found';
    end if;
  elsif p_kind = 'home' then
    select * into v_existing from public.family_places
      where family_id = v_family and kind = 'home' for update;
  end if;

  if v_existing.id is not null then
    update public.family_places
      set kind = p_kind, name = v_name, address = p_address, latitude = p_lat, longitude = p_lng,
          radius_m = coalesce(p_radius_m, radius_m), member_ids = v_ids, updated_at = now()
      where id = v_existing.id returning * into v_row;
  else
    insert into public.family_places (family_id, kind, name, address, latitude, longitude, radius_m, member_ids, created_by)
      values (v_family, p_kind, v_name, p_address, p_lat, p_lng, coalesce(p_radius_m, 150), v_ids, p_actor_id)
      returning * into v_row;
  end if;

  if v_row.kind = 'home' then
    update public.families set home_lat = p_lat, home_lng = p_lng, home_address = p_address where id = v_family;
  end if;

  return v_row;
end;
$$;

create or replace function public.delete_family_place(p_actor_id text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active text;
  v_role text;
  v_family uuid;
  v_place public.family_places;
begin
  v_active := public.resolve_active_member_id();
  if v_active is null or v_active is distinct from p_actor_id then
    raise exception 'caller is not member %', p_actor_id;
  end if;
  select role, family_id into v_role, v_family from public.members where id = p_actor_id;
  if v_role is distinct from 'parent' then
    raise exception 'only a parent can manage family places';
  end if;
  select * into v_place from public.family_places where id = p_id for update;
  if v_place.id is null or v_place.family_id is distinct from v_family then
    raise exception 'place not found';
  end if;
  delete from public.family_places where id = p_id;
  if v_place.kind = 'home' then
    update public.families set home_lat = null, home_lng = null, home_address = null where id = v_family;
  end if;
end;
$$;
