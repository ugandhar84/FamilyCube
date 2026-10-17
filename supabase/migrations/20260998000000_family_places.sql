-- Family Places: Home, each kid's school, workplaces and other named places a
-- family admin (parent) pins on the map. Every device registers these as
-- geofences; entering/leaving one checks that person in/out.
--
-- Replaces the unused legacy `geofences` table (0 rows, no client code) and
-- keeps families.home_lat/lng/address in sync because the maps-directions edge
-- function already reads them.
--
-- Writes are RPC-only (no insert/update/delete policies): parents manage
-- places via upsert_family_place / delete_family_place; any member records
-- THEIR OWN arrive/leave via record_place_event.

create table if not exists public.family_places (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  kind text not null check (kind in ('home', 'school', 'work', 'other')),
  name text not null check (length(btrim(name)) > 0),
  address text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 150 check (radius_m between 50 and 2000),
  -- Whose school / workplace this is. Empty = applies to everyone (always for Home).
  member_ids text[] not null default '{}',
  notify_arrive boolean not null default true,
  notify_leave boolean not null default true,
  created_by text references public.members(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists family_places_one_home on public.family_places (family_id) where kind = 'home';
create index if not exists family_places_family on public.family_places (family_id);

alter table public.family_places enable row level security;

drop policy if exists "family_places_select" on public.family_places;
create policy "family_places_select" on public.family_places for select
  using (family_id = public.current_user_family_id());

-- ── Parent-only: create / edit a place ─────────────────────────────────────
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
    -- one Home per family: saving Home again edits the existing pin
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

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, transition_id, note)
    values ('place', v_row.id::text, v_family, p_actor_id, 'place_saved', gen_random_uuid(),
            format('%s (%s)', v_row.name, v_row.kind));
  return v_row;
end;
$$;

-- ── Parent-only: remove a place ────────────────────────────────────────────
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
  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, transition_id, note)
    values ('place', p_id::text, v_family, p_actor_id, 'place_removed', gen_random_uuid(), v_place.name);
end;
$$;

-- ── Any member: record MY OWN arrive / leave (geofence check-in) ──────────
create or replace function public.record_place_event(p_member_id text, p_place_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_active text;
  v_family uuid;
  v_place public.family_places;
  v_status text;
begin
  v_active := public.resolve_active_member_id();
  if v_active is null or v_active is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;
  if p_event not in ('enter', 'exit') then
    raise exception 'invalid place event %', p_event;
  end if;
  select family_id into v_family from public.members where id = p_member_id;
  select * into v_place from public.family_places where id = p_place_id;
  if v_place.id is null or v_place.family_id is distinct from v_family then
    raise exception 'place not found';
  end if;
  -- A school/work assigned to specific people only checks THEM in.
  if coalesce(array_length(v_place.member_ids, 1), 0) > 0 and not (p_member_id = any (v_place.member_ids)) then
    return;
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
end;
$$;
