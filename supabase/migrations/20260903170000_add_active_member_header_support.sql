-- Hardens every RLS function that resolves "the calling member" against
-- the shared-auth_user_id model this app actually runs on: one Supabase
-- Auth session per DEVICE, shared across every PIN-switch profile in the
-- family. `members WHERE auth_user_id = auth.uid() LIMIT 1` (no ORDER BY)
-- could return ANY of the family's member rows sharing that session, not
-- necessarily whichever profile the app currently has active — confirmed
-- via direct query: role differs across those rows (parent/grandparent/
-- teenager/child), so a role-gated check like is_chat_channel_participant's
-- parents/seniors_a/b branches could silently evaluate against the wrong
-- person's role.
--
-- Fix: the client (lib/supabase.ts's debugFetch) now sends the true active
-- member id as the x-active-member-id request header on every call. This
-- function reads it via PostgREST's request.headers GUC and verifies it
-- ACTUALLY belongs to a member row under auth.uid()'s own auth_user_id
-- before trusting it — the header is client-supplied, so it cannot be
-- trusted blindly (a compromised or modified client could claim to be any
-- member id otherwise). Falls back to the old LIMIT-1 behavior when the
-- header is absent (server-side calls, edge functions, older app builds
-- mid-rollout) so nothing breaks during deploy.

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
    -- Only trust it if it's genuinely one of the auth session's own
    -- members — this is the actual security boundary. A header claiming
    -- to be a member from a DIFFERENT auth_user_id is silently ignored,
    -- not honored.
    select m.id into verified_id
    from public.members m
    where m.id = header_member_id
      and m.auth_user_id = auth.uid()
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
  'Resolves the true active member for this request via the client-supplied x-active-member-id header, verified against auth.uid()''s own member rows. Falls back to an arbitrary same-session member if the header is absent or unverifiable.';

-- current_user_family_id() rebuilt on top of resolve_active_member_id() —
-- same external signature/behavior for every other caller, just no longer
-- guessing which member when several share one auth session.
create or replace function public.current_user_family_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select family_id from public.members where id = public.resolve_active_member_id() limit 1;
$$;

-- is_chat_channel_participant rebuilt the same way — caller_id/role/
-- family_id/linked_parent_id now come from the VERIFIED active member,
-- not an arbitrary same-session row.
create or replace function public.is_chat_channel_participant(p_channel_id text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  caller_id text;
  caller_role text;
  caller_family_id text;
  parent_a_id text;
  parent_b_id text;
  caller_linked_parent_id text;
begin
  caller_id := public.resolve_active_member_id();

  if caller_id is null then
    return false;
  end if;

  select m.role, m.family_id::text, m.linked_parent_id
    into caller_role, caller_family_id, caller_linked_parent_id
  from public.members m
  where m.id = caller_id;

  if p_channel_id like 'dm\_%' escape '\' then
    return exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id
        and cc.member_ids @> to_jsonb(caller_id)
    );
  end if;

  if p_channel_id in ('seniors_a', 'seniors_b') then
    if caller_role = 'parent' then
      return true; -- parents coordinate across both sides
    end if;
    if caller_role <> 'grandparent' then
      return false;
    end if;
    select id into parent_a_id from public.members
      where family_id::text = caller_family_id and role = 'parent'
      order by created_at asc, id asc limit 1;
    select id into parent_b_id from public.members
      where family_id::text = caller_family_id and role = 'parent'
      order by created_at asc, id asc offset 1 limit 1;
    if caller_linked_parent_id is null then
      return p_channel_id = 'seniors_a';
    end if;
    if p_channel_id = 'seniors_a' then
      return caller_linked_parent_id = parent_a_id;
    else
      return caller_linked_parent_id = parent_b_id;
    end if;
  end if;

  if p_channel_id in ('parents', 'seniors_all') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if p_channel_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  return true;
end;
$$;

-- Same class of bug, security-relevant: this trigger is supposed to block
-- a kid/teen from approving their own chore, but resolved "who's calling"
-- via the same unordered LIMIT 1 — an arbitrary same-session member (e.g.
-- a parent's row) could be picked even when a kid is the one actually
-- performing the approve action, silently defeating the block. Rebuilt on
-- resolve_active_member_id() so it checks the real, verified active member.
create or replace function public.block_child_self_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_id text;
  caller_role text;
begin
  if new.status not in ('approved', 'auto_approved') then
    return new;
  end if;
  if old.status in ('approved', 'auto_approved') then
    return new;
  end if;

  caller_id := public.resolve_active_member_id();
  select m.role into caller_role from public.members m where m.id = caller_id;

  if caller_role in ('child', 'teenager') and caller_id = new.assigned_to_id then
    raise exception 'A child/teenager cannot approve their own chore — requires a parent or an active temporary-approver grant.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
