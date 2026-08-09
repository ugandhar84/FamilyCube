-- =============================================
-- FurEver — Supabase Schema
-- IDEMPOTENT: safe to run multiple times
-- Run this in your Supabase SQL Editor
-- =============================================

create extension if not exists "uuid-ossp";

-- ── Profiles (extends Supabase auth.users) ──
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ── Pets ──
create table if not exists pets (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  species text not null,        -- dog | cat | rabbit | bird | other
  breed text,
  birthday date,
  adoption_date date,
  emoji text default '🐾',
  accent_color text default '#7C5CBF', -- per-pet theme accent (Warm Amethyst brand default)
  avatar_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── Family (shared caretakers per pet) ──
create table if not exists pet_family (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text default 'caretaker', -- owner | caretaker
  joined_at timestamptz default now(),
  unique(pet_id, user_id)
);

-- ── Mood Logs (AI scan results) ──
create table if not exists mood_logs (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  scanned_by uuid references profiles(id),
  mood_label text not null,     -- happy | grumpy | tired | playful | anxious
  mood_score integer not null check (mood_score between 0 and 100),
  happy_pct integer default 0,
  playful_pct integer default 0,
  tired_pct integer default 0,
  anxious_pct integer default 0,
  photo_url text,
  notes text,
  date date default current_date,
  created_at timestamptz default now()
);

-- ── Vaccines ──
create table if not exists vaccines (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  name text not null,
  last_given date,
  next_due date,
  vet_name text,
  clinic text,
  notes text,
  created_at timestamptz default now()
);

-- ── Vet Visits ──
create table if not exists vet_visits (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  visit_date date not null,
  vet_name text,
  clinic_name text,
  reason text,
  diagnosis text,
  prescription text,
  weight_kg decimal(5,2),
  notes text,
  created_at timestamptz default now()
);

-- ── Weight Logs ──
create table if not exists weight_logs (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  weight_kg decimal(5,2) not null,
  logged_at date default current_date,
  notes text
);

-- ── Medications ──
create table if not exists medications (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  name text not null,
  dosage text,
  frequency text,     -- daily | weekly | monthly | as_needed
  start_date date,
  end_date date,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ── Feeding Logs ──
create table if not exists feeding_logs (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  fed_by uuid references profiles(id),
  meal_type text default 'meal', -- meal | treat | water
  amount_grams integer,
  food_type text,
  date date default current_date,
  fed_at timestamptz default now()
);

-- ── Grooming Logs ──
create table if not exists grooming_logs (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  type text not null,  -- bath | trim | nails | brush | ear_clean
  done_at date default current_date,
  notes text
);

-- ── Daily Checklist ──
create table if not exists daily_checklist (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  date date default current_date,
  type text not null,   -- walk | water | medicine | play | training
  label text not null,
  completed boolean default false,
  completed_by uuid references profiles(id),
  completed_at timestamptz,
  due_time time,
  created_at timestamptz default now()
);

-- ── Milestones ──
create table if not exists milestones (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  day_count integer not null,
  title text not null,
  achieved_at date not null,
  shared boolean default false,
  created_at timestamptz default now()
);

-- ── Lost Pet Alerts ──
create table if not exists lost_alerts (
  id uuid default uuid_generate_v4() primary key,
  pet_id uuid references pets(id) on delete cascade not null,
  reported_by uuid references profiles(id),
  last_seen_address text,
  last_seen_lat decimal(10,7),
  last_seen_lng decimal(10,7),
  description text,
  is_found boolean default false,
  found_at timestamptz,
  created_at timestamptz default now()
);

-- ── Playdate Requests ──
create table if not exists playdate_requests (
  id uuid default uuid_generate_v4() primary key,
  from_pet_id uuid references pets(id) on delete cascade,
  to_pet_id uuid references pets(id) on delete cascade,
  status text default 'pending',  -- pending | accepted | declined
  message text,
  created_at timestamptz default now(),
  unique(from_pet_id, to_pet_id)
);

-- =============================================
-- Row Level Security
-- =============================================

alter table profiles enable row level security;
alter table pets enable row level security;
alter table pet_family enable row level security;
alter table mood_logs enable row level security;
alter table vaccines enable row level security;
alter table vet_visits enable row level security;
alter table weight_logs enable row level security;
alter table medications enable row level security;
alter table feeding_logs enable row level security;
alter table grooming_logs enable row level security;
alter table daily_checklist enable row level security;
alter table milestones enable row level security;
alter table lost_alerts enable row level security;
alter table playdate_requests enable row level security;

-- Security definer helpers — query pets/pet_family WITHOUT triggering RLS
-- This breaks the recursion cycle:
--   pets policy → queries pet_family → pet_family policy → queries pets → ∞
create or replace function get_my_pet_ids()
returns setof uuid language sql security definer stable as $$
  select id from pets where owner_id = auth.uid();
$$;

create or replace function get_my_family_pet_ids()
returns setof uuid language sql security definer stable as $$
  select pet_id from pet_family where user_id = auth.uid();
$$;

-- Helper function: user owns or is family of pet (also security definer)
create or replace function is_pet_member(p_pet_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from pets where id = p_pet_id and owner_id = auth.uid()
    union all
    select 1 from pet_family where pet_id = p_pet_id and user_id = auth.uid()
  );
$$;

-- Profiles
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

drop policy if exists "Profile created on signup" on profiles;
create policy "Profile created on signup"
  on profiles for insert with check (auth.uid() = id);

-- Pets — owner full access + family members can read
drop policy if exists "Owner can manage pets" on pets;
create policy "Owner can manage pets"
  on pets for all using (auth.uid() = owner_id);

drop policy if exists "Family can view pets" on pets;
create policy "Family can view pets"
  on pets for select using (
    id in (select get_my_family_pet_ids())  -- security definer: no recursion
  );

-- Pet family — use security definer to avoid pets↔pet_family recursion cycle
drop policy if exists "Owner can manage family" on pet_family;
create policy "Owner can manage family"
  on pet_family for all using (
    pet_id in (select get_my_pet_ids())  -- security definer: no recursion
  );

drop policy if exists "Members can view family" on pet_family;
create policy "Members can view family"
  on pet_family for select using (user_id = auth.uid());

-- Apply is_pet_member to all pet-linked tables
drop policy if exists "Pet members can manage mood_logs" on mood_logs;
create policy "Pet members can manage mood_logs"
  on mood_logs for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage vaccines" on vaccines;
create policy "Pet members can manage vaccines"
  on vaccines for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage vet_visits" on vet_visits;
create policy "Pet members can manage vet_visits"
  on vet_visits for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage weight_logs" on weight_logs;
create policy "Pet members can manage weight_logs"
  on weight_logs for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage medications" on medications;
create policy "Pet members can manage medications"
  on medications for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage feeding_logs" on feeding_logs;
create policy "Pet members can manage feeding_logs"
  on feeding_logs for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage grooming_logs" on grooming_logs;
create policy "Pet members can manage grooming_logs"
  on grooming_logs for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage daily_checklist" on daily_checklist;
create policy "Pet members can manage daily_checklist"
  on daily_checklist for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage milestones" on milestones;
create policy "Pet members can manage milestones"
  on milestones for all using (is_pet_member(pet_id));

drop policy if exists "Pet members can manage lost_alerts" on lost_alerts;
create policy "Pet members can manage lost_alerts"
  on lost_alerts for all using (is_pet_member(pet_id));

drop policy if exists "Anyone can view lost_alerts" on lost_alerts;
create policy "Anyone can view lost_alerts"
  on lost_alerts for select using (true);

drop policy if exists "Pet members can manage playdate_requests" on playdate_requests;
create policy "Pet members can manage playdate_requests"
  on playdate_requests for all using (
    is_pet_member(from_pet_id) or is_pet_member(to_pet_id)
  );

-- =============================================
-- Auto-create profile on signup
-- =============================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- =============================================
-- Auto-create milestones (Day 1, 100, 365, 500, 1000)
-- =============================================
create or replace function check_milestone()
returns trigger language plpgsql as $$
declare
  days_count integer;
  pet_record pets%rowtype;
begin
  select * into pet_record from pets where id = new.id;
  if pet_record.adoption_date is null then return new; end if;
  days_count := (current_date - pet_record.adoption_date);
  if days_count in (1, 100, 365, 500, 1000) then
    insert into milestones (pet_id, day_count, title, achieved_at)
    values (
      new.id,
      days_count,
      'Day ' || days_count || ' with ' || pet_record.name || '!',
      current_date
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;
