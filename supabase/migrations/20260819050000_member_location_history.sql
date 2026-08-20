create table if not exists member_location_history (
  id bigint generated always as identity primary key,
  member_id text not null,
  family_id text not null,
  lat double precision not null,
  lng double precision not null,
  address text,
  battery_level integer,
  is_charging boolean,
  recorded_at timestamptz not null default now()
);

create index if not exists member_location_history_member_day_idx
  on member_location_history (member_id, recorded_at desc);

alter table member_location_history enable row level security;

create policy member_location_history_select on member_location_history
  for select using (family_id = (current_user_family_id())::text);

create policy member_location_history_insert on member_location_history
  for insert with check (family_id = (current_user_family_id())::text);
