-- resolve_active_member_id() verified the x-active-member-id header by
-- requiring `m.auth_user_id = auth.uid()` on the HEADER-CLAIMED member row
-- itself — but a PIN-only member (kids/seniors sharing a parent's device
-- session, the majority case this whole header mechanism exists for) has
-- auth_user_id = NULL. That check can never pass for them, so the header
-- was silently ignored every time a kid/senior was actually active, and
-- the function fell through to its own fallback (an ARBITRARY member
-- sharing the device's real auth session — usually the parent who
-- actually signed in). Confirmed live: a kid's dismiss-item INSERT
-- against dismissed_hub_items failed RLS because the row's real member_id
-- (the kid) never matched what this function was actually returning (the
-- parent).
--
-- Fix: verify the header-claimed member belongs to the SAME FAMILY as
-- some member already tied to this auth session, not that it shares the
-- exact same auth_user_id. A PIN-only member is legitimately accessed
-- THROUGH a parent's authenticated session on a shared device — family
-- membership is the real trust boundary here, matching how
-- current_user_family_id() itself already treats a member row (per-family,
-- not per-auth_user_id) everywhere else in this app's RLS.
create or replace function public.resolve_active_member_id()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  header_member_id text;
  verified_id text;
begin
  header_member_id := nullif(
    (current_setting('request.headers', true)::json->>'x-active-member-id'),
    ''
  );

  if header_member_id is not null then
    -- Trust the header if the member it claims exists in the SAME family
    -- as any member already reachable from this auth session (whether
    -- that's the header member's own auth_user_id, for a member who
    -- signed in directly, OR a sibling/parent member sharing the device's
    -- session, for a PIN-only member). This is the real trust boundary:
    -- family membership, not a 1:1 auth_user_id match that only ever
    -- holds for the one member who actually ran the Supabase Auth login.
    select m.id into verified_id
    from public.members m
    where m.id = header_member_id
      and m.family_id in (
        select family_id from public.members where auth_user_id = auth.uid()
      )
    limit 1;

    if verified_id is not null then
      return verified_id;
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
  'Resolves the true active member for this request via the client-supplied x-active-member-id header, verified as belonging to the SAME FAMILY as auth.uid()''s own member row(s) — not requiring the header member''s own auth_user_id to match, since PIN-only members (kids/seniors on a shared device session) legitimately have none. Falls back to an arbitrary same-session member if the header is absent or unverifiable.';
