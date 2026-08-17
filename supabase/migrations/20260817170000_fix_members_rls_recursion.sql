-- HOTFIX: infinite recursion in members RLS policies (Postgres error 42P17).
--
-- The three members_* policies added in 20260817120000_close_anon_rls_holes.sql
-- scoped access via:
--   family_id IN (SELECT family_id FROM public.members m WHERE m.id = auth.uid()::text)
-- This pattern is correct on every OTHER table (the subquery hits members,
-- a DIFFERENT table from the one being protected, so there's no cycle).
-- On members itself, this is self-referential: evaluating the SELECT policy
-- for a query against members requires running a subquery against members,
-- which re-triggers the same SELECT policy, which runs the subquery again,
-- forever. Confirmed live in production via app error:
--   "infinite recursion detected in policy for relation \"members\""
--
-- Fix: a SECURITY DEFINER function bypasses RLS for its own internal query,
-- so looking up "my own family_id" no longer re-enters members' RLS policy.
-- This is the standard, textbook Postgres pattern for self-referential RLS
-- (a table that needs to scope access based on a value stored on itself).
-- STABLE (not VOLATILE) since it's a pure lookup with no side effects, and
-- SET search_path pinned per Postgres SECURITY DEFINER best practice (avoids
-- a search_path-hijacking attack via a malicious schema earlier in the path).

create or replace function public.current_user_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.members where id = auth.uid()::text limit 1;
$$;

drop policy if exists "members_select" on public.members;
drop policy if exists "members_insert" on public.members;
drop policy if exists "members_update" on public.members;

create policy "members_select"
  on public.members for select
  using (
    id = auth.uid()::text
    or family_id = public.current_user_family_id()
  );

create policy "members_insert"
  on public.members for insert
  with check (
    id = auth.uid()::text
    or family_id = public.current_user_family_id()
  );

create policy "members_update"
  on public.members for update
  using (
    id = auth.uid()::text
    or family_id = public.current_user_family_id()
  )
  with check (
    id = auth.uid()::text
    or family_id = public.current_user_family_id()
  );
