-- Fix: calendar_connections_public returned ZERO rows for real authenticated
-- users, even though the underlying calendar_connections row existed and
-- was 'active'. Root cause: the view was `security_invoker = true` (runs
-- with the CALLING user's own privileges, not the view owner's), but the
-- original migration's "defense in depth" `revoke all on
-- public.calendar_connections from authenticated, anon` stripped the
-- authenticated role's base table-level SELECT privilege entirely. With
-- security_invoker, Postgres checks the base table privilege BEFORE ever
-- evaluating the RLS policy — no table grant means no rows, full stop,
-- regardless of the "calendar_connections_family_select" RLS policy or the
-- `grant select on calendar_connections_public to authenticated` (that
-- grant is on the view object itself; it does not substitute for a base
-- table grant when the view runs as invoker).
--
-- Fix is to drop security_invoker (defaults to false — the view runs as
-- its OWNER, which still has full table access regardless of the
-- authenticated/anon revoke) rather than granting select on the base
-- table directly — granting the base table would let a client run
-- `supabase.from('calendar_connections').select('*')` directly and get
-- back real access_token/refresh_token values for their own family's
-- connections (the RLS policy alone would permit that, scoped to family).
-- Base table stays fully locked down from any direct client access.
--
-- Since the view no longer inherits the caller's own RLS automatically
-- once it's not security_invoker, it must do its own family-scoping
-- explicitly in the WHERE clause — current_user_family_id() is itself
-- `security definer`, so it correctly resolves the real calling user's
-- family even from inside a non-invoker view.
drop view if exists public.calendar_connections_public;

create view public.calendar_connections_public as
  select id, family_id, member_id, provider, purpose, external_calendar_id,
         status, last_synced_at, last_error, connected_account_email,
         created_at
  from public.calendar_connections
  where family_id = public.current_user_family_id()::text;

grant select on public.calendar_connections_public to authenticated;
