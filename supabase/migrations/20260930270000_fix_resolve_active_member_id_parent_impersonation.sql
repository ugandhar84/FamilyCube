-- 20260925040000 correctly fixed resolve_active_member_id() for PIN-only
-- members (kids/seniors with auth_user_id = NULL, accessed through a
-- parent's shared device session) by trusting the x-active-member-id
-- header whenever the claimed member is in the SAME FAMILY as auth.uid()'s
-- own member row(s) — necessary, since a PIN-only member has no auth_user_id
-- of their own to check against at all.
--
-- But that fix has an un-flagged side effect for a family with TWO parents
-- who EACH have their own real auth_user_id (this app's actual model per
-- 20260903170000's header comment: "one Supabase Auth session shared
-- across every PIN-switch profile", but a parent still gets their own
-- login). For that case, "same family" was already guaranteed before this
-- function is even called (every RPC using it also does its own family-
-- scoping check) — the function added ZERO additional identity guarantee
-- once family membership stopped requiring a matching auth_user_id. Live-
-- reported result: Praveena's authenticated device could claim to be
-- Ugandhar via the header, and every RPC that relies on
-- resolve_active_member_id() for its "is this really you" check
-- (confirm_event_assignment, decline_event_assignment, reassign_event —
-- 20260930260000 — plus the batch of RPCs patched the same way right
-- after this migration) would wrongly accept it, since both members
-- share one family.
--
-- Correct rule, two tiers:
--   1. Header-claimed member has NO auth_user_id (a real PIN-only member)
--      -> family-membership trust is the strongest signal available and
--      is correct, unchanged from 20260925040000.
--   2. Header-claimed member HAS their own auth_user_id (a second parent
--      with their own real login) -> that auth_user_id MUST equal
--      auth.uid(). A different parent's session claiming to be them is a
--      real impersonation, not a legitimate PIN-switch, and must be
--      rejected.
create or replace function public.resolve_active_member_id()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  header_member_id text;
  header_member_auth_user_id uuid;
  verified_id text;
begin
  header_member_id := nullif(
    (current_setting('request.headers', true)::json->>'x-active-member-id'),
    ''
  );

  if header_member_id is not null then
    select m.id, m.auth_user_id into verified_id, header_member_auth_user_id
    from public.members m
    where m.id = header_member_id
      and m.family_id in (
        select family_id from public.members where auth_user_id = auth.uid()
      )
    limit 1;

    if verified_id is not null then
      -- Tier 2: the claimed member has their own real login — the header
      -- can only be trusted if THIS session actually IS that login.
      if header_member_auth_user_id is not null and header_member_auth_user_id is distinct from auth.uid() then
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
$$;

comment on function public.resolve_active_member_id is
  'Resolves the true active member for this request via the client-supplied x-active-member-id header. A PIN-only header member (no auth_user_id of their own) is trusted via family membership with auth.uid()''s own member row(s). A header member WITH their own auth_user_id is only trusted if it equals auth.uid() itself — prevents one parent''s authenticated session from claiming to be a different parent. Falls back to an arbitrary same-session member if the header is absent or unverifiable.';
