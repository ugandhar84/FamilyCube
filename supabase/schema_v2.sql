-- =============================================
-- FurEver — Supabase Schema V2
-- Extends schema.sql — run AFTER the base schema
-- Comprehensive pet + vet + family + social tables
-- =============================================

create extension if not exists "postgis"; -- for geo queries (lost alerts, nearby)

-- ── Migrate color → accent_color (idempotent) ───────────────────
-- Safe to run multiple times — skips if column already renamed
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pets' and column_name = 'color'
  ) then
    alter table pets rename column color to accent_color;
  end if;
  -- Ensure column exists even if schema.sql was run fresh
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pets' and column_name = 'accent_color'
  ) then
    alter table pets add column accent_color text default '#7C5CBF';
  end if;
end $$;

-- ── Update Profiles (add phone, timezone, bio) ──────────────────
alter table profiles
  add column if not exists phone text,
  add column if not exists timezone text default 'UTC',
  add column if not exists bio text,
  add column if not exists notification_enabled boolean default true,
  add column if not exists updated_at timestamptz default now();

-- ── Update Pets (add more fields) ───────────────────────────────
alter table pets
  add column if not exists gender text, -- male | female | unknown
  add column if not exists weight_kg decimal(5,2),
  add column if not exists microchip_id text,
  add column if not exists insurance_policy text,
  add column if not exists neutered boolean default false,
  add column if not exists color_coat text,
  add column if not exists temperament text[],  -- ['friendly','energetic','calm']
  add column if not exists diet_type text,       -- 'dry' | 'wet' | 'raw' | 'mixed'
  add column if not exists notes text,
  add column if not exists location_lat decimal(10,7),
  add column if not exists location_lng decimal(10,7),
  add column if not exists location_updated_at timestamptz;

-- ── Pet Photos ──────────────────────────────────────────────────
create table if not exists pet_photos (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  url text not null,
  thumbnail_url text,
  caption text,
  is_avatar boolean default false,
  taken_at date default current_date,
  created_at timestamptz default now()
);

alter table pet_photos enable row level security;

drop policy if exists "Pet members can manage photos" on pet_photos;
create policy "Pet members can manage photos"
  on pet_photos for all using (is_pet_member(pet_id));

-- ── Family Invitations ──────────────────────────────────────────
create table if not exists family_invitations (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  invited_by uuid references profiles(id) on delete cascade not null,
  email text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text default 'pending',     -- pending | accepted | declined | expired | cancelled
  role text default 'caretaker',     -- caretaker | viewer
  message text,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references profiles(id)
);

alter table family_invitations enable row level security;

drop policy if exists "Pet owners can manage invitations" on family_invitations;
create policy "Pet owners can manage invitations"
  on family_invitations for all
  using (
    pet_id in (select id from pets where owner_id = auth.uid())
    or invited_by = auth.uid()
  );

drop policy if exists "Invitees can view and accept their invitation" on family_invitations;
create policy "Invitees can view and accept their invitation"
  on family_invitations for select
  using (true); -- token-gated at app level; anyone can look up a token

drop policy if exists "Invitees can update their invitation status" on family_invitations;
create policy "Invitees can update their invitation status"
  on family_invitations for update
  using (true)
  with check (status in ('accepted', 'declined'));

-- ── Push / Notification Tokens ──────────────────────────────────
create table if not exists push_tokens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  token text not null,
  platform text not null, -- ios | android | web
  device_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, token)
);

alter table push_tokens enable row level security;
drop policy if exists "Users can manage own tokens" on push_tokens;
create policy "Users can manage own tokens"
  on push_tokens for all using (user_id = auth.uid());

-- ── Emergency Contacts ──────────────────────────────────────────
create table if not exists emergency_contacts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  phone text not null,
  email text,
  relationship text,               -- 'vet' | 'spouse' | 'neighbor' | 'family' | 'other'
  is_vet boolean default false,
  clinic_name text,
  clinic_address text,
  notes text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table emergency_contacts enable row level security;
drop policy if exists "Users can manage own contacts" on emergency_contacts;
create policy "Users can manage own contacts"
  on emergency_contacts for all using (user_id = auth.uid());

-- ── Vet Clinics (searchable directory) ─────────────────────────
create table if not exists vet_clinics (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  country text default 'US',
  phone text,
  email text,
  website text,
  lat decimal(10,7),
  lng decimal(10,7),
  is_emergency boolean default false,
  is_24h boolean default false,
  specialties text[],
  rating decimal(2,1),
  created_at timestamptz default now()
);

-- Public read — no RLS needed
alter table vet_clinics enable row level security;
drop policy if exists "Anyone can view clinics" on vet_clinics;
create policy "Anyone can view clinics"
  on vet_clinics for select using (true);

-- ── Appointment Reminders ────────────────────────────────────────
create table if not exists appointments (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  clinic_id uuid references vet_clinics(id),
  created_by uuid references profiles(id),
  type text not null,       -- 'checkup' | 'vaccine' | 'grooming' | 'dental' | 'surgery' | 'follow_up' | 'other'
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer default 30,
  vet_name text,
  clinic_name text,
  clinic_address text,
  notes text,
  reminder_sent boolean default false,
  reminder_at timestamptz,  -- when to send push
  status text default 'upcoming', -- upcoming | completed | cancelled | no_show
  created_at timestamptz default now()
);

alter table appointments enable row level security;
drop policy if exists "Pet members can manage appointments" on appointments;
create policy "Pet members can manage appointments"
  on appointments for all using (is_pet_member(pet_id));

-- ── Allergies ────────────────────────────────────────────────────
create table if not exists allergies (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  allergen text not null,            -- 'beef', 'pollen', 'dust', 'penicillin' etc.
  category text,                     -- 'food' | 'environmental' | 'medication' | 'other'
  severity text default 'mild',      -- 'mild' | 'moderate' | 'severe' | 'life_threatening'
  symptoms text,
  diagnosed_by text,
  diagnosed_date date,
  notes text,
  created_at timestamptz default now()
);

alter table allergies enable row level security;
drop policy if exists "Pet members can manage allergies" on allergies;
create policy "Pet members can manage allergies"
  on allergies for all using (is_pet_member(pet_id));

-- ── Lab Results ──────────────────────────────────────────────────
create table if not exists lab_results (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  visit_id uuid references vet_visits(id),
  test_name text not null,
  result_value text,
  unit text,
  reference_range text,
  is_abnormal boolean default false,
  tested_at date not null,
  lab_name text,
  file_url text,
  notes text,
  created_at timestamptz default now()
);

alter table lab_results enable row level security;
drop policy if exists "Pet members can manage lab results" on lab_results;
create policy "Pet members can manage lab results"
  on lab_results for all using (is_pet_member(pet_id));

-- ── Diet & Nutrition Plans ───────────────────────────────────────
create table if not exists diet_plans (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  name text not null,
  food_brand text,
  food_type text,   -- 'dry' | 'wet' | 'raw' | 'mixed' | 'prescription'
  daily_amount_grams integer,
  meals_per_day integer default 2,
  calories_per_day integer,
  special_instructions text,
  prescribed_by text,
  start_date date,
  end_date date,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table diet_plans enable row level security;
drop policy if exists "Pet members can manage diet plans" on diet_plans;
create policy "Pet members can manage diet plans"
  on diet_plans for all using (is_pet_member(pet_id));

-- ── Training Logs ────────────────────────────────────────────────
create table if not exists training_logs (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  logged_by uuid references profiles(id),
  skill text not null,           -- 'sit' | 'stay' | 'heel' | 'recall' | custom
  category text default 'obedience', -- 'obedience' | 'agility' | 'tricks' | 'socialization'
  level text default 'learning', -- 'learning' | 'practicing' | 'mastered'
  duration_minutes integer,
  reward_used text,
  notes text,
  logged_at date default current_date,
  created_at timestamptz default now()
);

alter table training_logs enable row level security;
drop policy if exists "Pet members can manage training" on training_logs;
create policy "Pet members can manage training"
  on training_logs for all using (is_pet_member(pet_id));

-- ── Pet Insurance ────────────────────────────────────────────────
create table if not exists insurance_policies (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  provider_name text not null,
  policy_number text,
  plan_name text,
  coverage_type text,      -- 'accident' | 'illness' | 'wellness' | 'comprehensive'
  monthly_premium decimal(8,2),
  deductible decimal(8,2),
  reimbursement_pct integer,
  annual_limit decimal(10,2),
  start_date date,
  renewal_date date,
  phone text,
  website text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table insurance_policies enable row level security;
drop policy if exists "Pet members can manage insurance" on insurance_policies;
create policy "Pet members can manage insurance"
  on insurance_policies for all using (is_pet_member(pet_id));

-- ── Update Lost Alerts with PostGIS ─────────────────────────────
alter table lost_alerts
  add column if not exists location geometry(Point, 4326),
  add column if not exists radius_km decimal(5,2) default 5,
  add column if not exists contact_phone text,
  add column if not exists reward_amount decimal(8,2),
  add column if not exists photo_url text,
  add column if not exists view_count integer default 0,
  add column if not exists notification_sent boolean default false;

-- Spatial index
create index if not exists lost_alerts_location_idx
  on lost_alerts using gist(location);

-- Function: get active lost alerts within radius
create or replace function get_nearby_lost_alerts(
  p_lat decimal,
  p_lng decimal,
  p_radius_km decimal default 10
)
returns setof lost_alerts
language sql stable as $$
  select * from lost_alerts
  where is_found = false
  and location is not null
  and ST_DWithin(
    location::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius_km * 1000
  )
  order by created_at desc;
$$;

-- Function: get nearby pet owners (for SOS notifications)
create or replace function get_nearby_users(
  p_lat decimal,
  p_lng decimal,
  p_radius_km decimal default 10
)
returns table(user_id uuid, full_name text, push_token text, platform text)
language sql stable security definer as $$
  select distinct on (p.owner_id)
    p.owner_id,
    pr.full_name,
    pt.token,
    pt.platform
  from pets p
  join profiles pr on pr.id = p.owner_id
  join push_tokens pt on pt.user_id = p.owner_id
  where p.location_lat is not null
  and ST_DWithin(
    ST_SetSRID(ST_MakePoint(p.location_lng, p.location_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius_km * 1000
  )
  and p.owner_id != auth.uid();
$$;

-- ── Playdate Posts (social feed) ─────────────────────────────────
create table if not exists social_posts (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  author_id uuid references profiles(id) on delete cascade not null,
  type text default 'moment',   -- 'moment' | 'milestone' | 'tip' | 'lost_found'
  caption text,
  photo_url text,
  location_name text,
  likes_count integer default 0,
  is_public boolean default true,
  created_at timestamptz default now()
);

alter table social_posts enable row level security;
drop policy if exists "Public posts are visible to all" on social_posts;
create policy "Public posts are visible to all"
  on social_posts for select using (is_public = true or is_pet_member(pet_id));
drop policy if exists "Pet members can create posts" on social_posts;
create policy "Pet members can create posts"
  on social_posts for insert with check (is_pet_member(pet_id));
drop policy if exists "Authors can manage own posts" on social_posts;
create policy "Authors can manage own posts"
  on social_posts for all using (author_id = auth.uid());

-- ── Notifications Log ────────────────────────────────────────────
create table if not exists notification_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  body text,
  type text,   -- 'reminder' | 'invite' | 'lost_alert' | 'milestone' | 'playdate'
  data jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

alter table notification_log enable row level security;
drop policy if exists "Users can manage own notifications" on notification_log;
create policy "Users can manage own notifications"
  on notification_log for all using (user_id = auth.uid());

-- =============================================
-- Auto-expire invitations (cron job recommended)
-- =============================================
create or replace function expire_old_invitations()
returns void language plpgsql as $$
begin
  update family_invitations
  set status = 'expired'
  where status = 'pending'
  and expires_at < now();
end;
$$;

-- =============================================
-- Trigger: auto-log notification on invite
-- =============================================
create or replace function notify_on_invite()
returns trigger language plpgsql as $$
declare
  pet_name text;
  inviter_name text;
begin
  select name into pet_name from pets where id = new.pet_id;
  select full_name into inviter_name from profiles where id = new.invited_by;

  -- Log in-app notification for the invitee (if they have an account)
  insert into notification_log (user_id, title, body, type, data)
  select id,
    'You''re invited to care for ' || pet_name,
    (inviter_name ?? 'Someone') || ' invited you to join ' || pet_name || '''s family on FurEver',
    'invite',
    jsonb_build_object('invitation_token', new.token, 'pet_id', new.pet_id)
  from auth.users
  where email = new.email;

  return new;
end;
$$;

drop trigger if exists on_family_invitation_created on family_invitations;
create trigger on_family_invitation_created
  after insert on family_invitations
  for each row execute procedure notify_on_invite();

-- =============================================
-- Trigger: update pet location updated_at
-- =============================================
create or replace function update_pet_location_timestamp()
returns trigger language plpgsql as $$
begin
  if new.location_lat is distinct from old.location_lat
  or new.location_lng is distinct from old.location_lng then
    new.location_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_pet_location_update on pets;
create trigger on_pet_location_update
  before update on pets
  for each row execute procedure update_pet_location_timestamp();
