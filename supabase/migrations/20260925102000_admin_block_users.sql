-- Block/unblock a user account from the admin console. Real enforcement,
-- not cosmetic: blocking calls Supabase Auth's admin "ban" mechanism
-- (auth.users.banned_until), which the GoTrue server itself checks on
-- every token refresh/sign-in — a banned user's existing session stops
-- working the next time it needs to refresh, and they can't sign in again
-- until unbanned. profiles.blocked_at is a visibility mirror for the admin
-- console's own UI (so admin_list_users can show it without a second
-- privileged auth.admin lookup per row) — auth.users.banned_until stays
-- the actual source of truth for enforcement.
alter table public.profiles
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text;

-- admin_set_user_blocked() only flips the local mirror column — the
-- actual ban/unban call against Supabase Auth's admin API happens
-- server-side in a new edge function (admin-set-user-blocked), since
-- banning a user requires the service-role key, which this SQL function
-- (running as the calling admin's own session) does not have. This RPC
-- exists so the edge function's own admin check can reuse is_app_admin()
-- consistently with every other admin write path in this schema, and so
-- the mirror column update is atomic with the authorization check.
create or replace function public.admin_set_user_blocked(
  target_user_id uuid,
  blocked        boolean,
  reason         text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  update public.profiles
  set blocked_at = case when blocked then now() else null end,
      blocked_reason = case when blocked then reason else null end
  where id = target_user_id;
end;
$$;

comment on function public.admin_set_user_blocked is
  'Admin-only. Updates profiles.blocked_at/blocked_reason (the admin console visibility mirror). Called by the admin-set-user-blocked edge function alongside the actual Supabase Auth ban/unban call, which requires the service-role key this SQL function does not have.';

revoke all on function public.admin_set_user_blocked(uuid, boolean, text) from public;
grant execute on function public.admin_set_user_blocked(uuid, boolean, text) to authenticated;
