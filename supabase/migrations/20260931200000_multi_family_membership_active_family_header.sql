-- Multi-family membership, Stage 1 (DB/RLS foundation only — no client
-- change yet, no UI). Lays the groundwork for one real person (one
-- auth_user_id) legitimately belonging to more than one family — e.g. a
-- grandparent invited into two of their children's separate households
-- (already an explicitly intended, supported case per
-- 20260904100000_add_member_email_invite_support.sql's own comment: "the
-- same person can legitimately belong to two households"). auth_user_id
-- was deliberately never made unique on members for exactly this reason.
--
-- Today's live resolve_active_member_id() already handles a member with
-- their OWN real login switched-into via the x-active-member-id header
-- (PIN-switch case) correctly — that header names a SPECIFIC member id,
-- which unambiguously determines both the member and their family, no
-- change needed there.
--
-- The gap is the FALLBACK path (no x-active-member-id header at all —
-- today's single-family-per-session common case): it does
--   select id from members where auth_user_id = auth.uid() limit 1
-- an arbitrary pick with no way to choose WHICH family's membership row
-- when auth.uid() legitimately matches more than one. This adds a second,
-- optional header (x-active-family-id) that lets the fallback path prefer
-- a specific family — validated the same way x-active-member-id already
-- is (the claimed family must actually be one auth.uid() has a member row
-- in), so a forged/wrong value can only ever fail closed to today's exact
-- arbitrary-pick behavior, never expose a family the caller doesn't
-- belong to.
--
-- Zero behavior change for every existing single-family account: nobody
-- has more than one member row under the same auth_user_id today
-- (verified live, zero matches), and no client sends this header yet.
create or replace function public.resolve_active_member_id()
returns text
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  header_member_id text;
  header_grant_token text;
  header_family_id text;
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
  header_family_id := nullif(
    (current_setting('request.headers', true)::json->>'x-active-family-id'),
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

  -- Fallback: no x-active-member-id given. If a validated x-active-family-id
  -- was given, prefer THIS session's own member row within that specific
  -- family (must genuinely be one of auth.uid()'s own member rows — a
  -- family the caller doesn't belong to never matches, falling through to
  -- the arbitrary pick below exactly as if no header had been sent at
  -- all). Otherwise, unchanged: an arbitrary pick among the session's
  -- members — correct for single-member-per-session households (still the
  -- overwhelming majority), a guess otherwise.
  if header_family_id is not null then
    select m.id into verified_id
    from public.members m
    where m.auth_user_id = auth.uid()
      and m.family_id::text = header_family_id
    limit 1;

    if verified_id is not null then
      return verified_id;
    end if;
  end if;

  select m.id into verified_id
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1;

  return verified_id;
end;
$function$;
