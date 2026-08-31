-- Live-reported bug: resolve_active_member_id()'s Tier-2 check (added to
-- stop one family member spoofing a co-parent's identity via the
-- x-active-member-id header) requires header_member_auth_user_id =
-- auth.uid() whenever the claimed member has their own real login. This
-- correctly blocks spoofing, but ALSO blocks the fully legitimate case of
-- PIN-switching to a family member who happens to have their own separate
-- account, on a shared device authenticated under a DIFFERENT member's
-- session — every identity-verified RPC (confirm/approve/reassign/etc.)
-- then silently fails for that member with no useful error, confirmed
-- live: Ugandhar and Praveena both have their own auth_user_id, and
-- Ugandhar's "Confirm I'll do it" taps failed with a generic retry toast
-- because this device's real session was Praveena's login.
--
-- Fix: keep the identity guarantee, but let PIN entry (already
-- server-verified, already rate-limited via verify_member_pin) stand in
-- for "this session really is that person" instead of requiring the
-- Supabase Auth session itself to match. A successful PIN check mints a
-- short-lived random grant token on the member row; the client sends it
-- back on every request via a new x-active-member-grant header;
-- resolve_active_member_id's Tier-2 check accepts EITHER the auth.uid()
-- match (unchanged, still works with zero extra steps for the common
-- case) OR a live, unexpired, matching grant token.
alter table public.members
  add column if not exists active_grant_token text,
  add column if not exists active_grant_expires_at timestamptz;

-- Never selectable/updatable directly by a client — same treatment as
-- pin/pin_attempts, only ever touched through SECURITY DEFINER RPCs.
-- (members' existing RLS already excludes pin/pin_attempts/pin_locked_until
-- from any client-facing select list at the application layer; this column
-- follows the same convention — enforced by never being read/written
-- outside verify_member_pin_and_grant/resolve_active_member_id below.)

create or replace function public.verify_member_pin_and_grant(p_member_id text, p_entered_pin text)
returns table(ok boolean, locked_until timestamptz, attempts_remaining integer, grant_token text, grant_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result record;
  v_token text;
  v_expires timestamptz;
begin
  -- Reuses verify_member_pin's own attempt-counting/lockout logic exactly
  -- (single source of truth for the rate-limit rule) rather than
  -- duplicating it — this function only adds the grant-minting step on a
  -- genuine success.
  select * into v_result from public.verify_member_pin(p_member_id, p_entered_pin);

  if v_result.ok then
    -- 12 hours: long enough that a parent isn't re-entering their PIN
    -- constantly through a normal day of switching between profiles on
    -- the same device, short enough that a lost/stolen device's grant
    -- window closes on its own well within the same day.
    -- (Bumped to 30 days in a follow-up migration — see
    -- 20260931030000_active_member_grant_30_days.sql.)
    v_token := encode(gen_random_bytes(24), 'base64');
    v_expires := now() + interval '12 hours';
    update public.members
      set active_grant_token = v_token, active_grant_expires_at = v_expires
      where id = p_member_id;
    return query select true, null::timestamptz, v_result.attempts_remaining, v_token, v_expires;
  else
    return query select false, v_result.locked_until, v_result.attempts_remaining, null::text, null::timestamptz;
  end if;
end;
$function$;

create or replace function public.resolve_active_member_id()
returns text
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  header_member_id text;
  header_grant_token text;
  header_member_auth_user_id uuid;
  header_member_grant_token text;
  header_member_grant_expires timestamptz;
  verified_id text;
begin
  header_member_id := nullif(
    (current_setting('request.headers', true)::json->>'x-active-member-id'),
    ''
  );
  header_grant_token := nullif(
    (current_setting('request.headers', true)::json->>'x-active-member-grant'),
    ''
  );

  if header_member_id is not null then
    select m.id, m.auth_user_id, m.active_grant_token, m.active_grant_expires_at
      into verified_id, header_member_auth_user_id, header_member_grant_token, header_member_grant_expires
    from public.members m
    where m.id = header_member_id
      and m.family_id in (
        select family_id from public.members where auth_user_id = auth.uid()
      )
    limit 1;

    if verified_id is not null then
      -- Tier 2: the claimed member has their own real login — trusted if
      -- EITHER this session actually IS that login (unchanged fast path,
      -- zero extra steps), OR a live, unexpired, matching PIN-verified
      -- grant token was presented (the fix: PIN-switching to a
      -- same-family member with their own account, verified via
      -- verify_member_pin_and_grant, is exactly as trustworthy as the
      -- app already treats PIN-switching to any OTHER family member).
      if header_member_auth_user_id is not null and header_member_auth_user_id is distinct from auth.uid() then
        if header_grant_token is not null
           and header_member_grant_token is not null
           and header_grant_token = header_member_grant_token
           and header_member_grant_expires is not null
           and header_member_grant_expires > now() then
          return verified_id;
        end if;
        verified_id := null;
      else
        return verified_id;
      end if;
    end if;
  end if;

  -- Fallback: old behavior, arbitrary pick among the session's members.
  -- Correct for single-member-per-session households; a guess otherwise.
  select m.id into verified_id
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1;

  return verified_id;
end;
$function$;
