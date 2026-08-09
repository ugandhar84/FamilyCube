-- =============================================
-- FurEver — Fix RLS infinite recursion on pets
-- Run this NOW in Supabase SQL Editor
-- Safe to run multiple times (fully idempotent)
-- =============================================

-- Root cause:
--   SELECT pets → "Family can view pets" → queries pet_family
--   → "Owner can manage family" (FOR ALL) → queries pets → ∞ recursion
--
-- Fix: security definer functions bypass RLS, breaking the cycle.

create or replace function get_my_pet_ids()
returns setof uuid language sql security definer stable as $$
  select id from pets where owner_id = auth.uid();
$$;

create or replace function get_my_family_pet_ids()
returns setof uuid language sql security definer stable as $$
  select pet_id from pet_family where user_id = auth.uid();
$$;

-- Recreate is_pet_member with union all + stable (faster, same correctness)
create or replace function is_pet_member(p_pet_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from pets where id = p_pet_id and owner_id = auth.uid()
    union all
    select 1 from pet_family where pet_id = p_pet_id and user_id = auth.uid()
  );
$$;

-- Fix "Family can view pets" — use security definer function
drop policy if exists "Family can view pets" on pets;
create policy "Family can view pets"
  on pets for select using (
    id in (select get_my_family_pet_ids())
  );

-- Fix "Owner can manage family" — use security definer function
drop policy if exists "Owner can manage family" on pet_family;
create policy "Owner can manage family"
  on pet_family for all using (
    pet_id in (select get_my_pet_ids())
  );
