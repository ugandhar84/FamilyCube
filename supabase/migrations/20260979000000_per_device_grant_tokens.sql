-- Fix: PIN-switch grant tokens were stored as a single column pair
-- (members.active_grant_token / active_grant_expires_at) per MEMBER, not
-- per DEVICE. A member with their own real login, PIN-switched into on a
-- shared device (e.g. a family tablet), gets a grant token written onto
-- their member row. If a SECOND device (or the same member re-verifying
-- elsewhere) PIN-switches into that same member, the grant token is
-- overwritten globally — the FIRST device's client still holds its own
-- now-stale token, which no longer matches the member row, so
-- resolve_active_member_id()'s Tier-2 check silently falls through to its
-- own-login arbitrary-pick fallback and resolves to the WRONG member.
-- Every subsequent identity-verified write from that first device then
-- fails with a generic "caller is not member %" error, surfaced to the
-- user as "could not update" — confirmed live: this is the actual cause of
-- a parent's own self-assignment (e.g. "I'll Drive") intermittently
-- failing to confirm.
--
-- Fixed the same way voip_push_tokens already correctly scopes device
-- state: one row per (member_id, device_id), not a column on members.
-- getDeviceId() (lib/chatCrypto.ts) is the existing stable per-install
-- identifier already used for chat device registration — reused here
-- rather than inventing a second identifier scheme.
create table if not exists public.member_grant_tokens (
  id          text primary key default gen_random_uuid()::text,
  member_id   text not null references public.members(id) on delete cascade,
  device_id   text not null,
  grant_token text not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now(),
  unique(member_id, device_id)
);

create index if not exists member_grant_tokens_member_idx on public.member_grant_tokens(member_id);

alter table public.member_grant_tokens enable row level security;

drop policy if exists "member_grant_tokens_select" on public.member_grant_tokens;
create policy "member_grant_tokens_select" on public.member_grant_tokens for select
  using (
    member_id in (select id from public.members where family_id = public.current_user_family_id())
  );
-- Insert/update/delete only via service-role-equivalent SECURITY DEFINER
-- RPCs (verify_member_pin_and_grant writes it) — no direct client write
-- policy needed, same pattern as call_reminder_log.

-- verify_member_pin_and_grant: now takes an optional p_device_id and
-- writes into member_grant_tokens instead of the old members columns.
-- p_device_id defaults to null (and falls back to a fixed sentinel row)
-- so an old, not-yet-updated client build doesn't outright break during
-- rollout — it just keeps the pre-fix single-shared-grant behavior for
-- itself until it updates, exactly like today's live behavior, not a
-- regression.
create or replace function public.verify_member_pin_and_grant(p_member_id text, p_entered_pin text, p_device_id text default null)
returns table(ok boolean, locked_until timestamptz, attempts_remaining integer, grant_token text, grant_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result record;
  v_token text;
  v_expires timestamptz;
  v_device text;
begin
  select * into v_result from public.verify_member_pin(p_member_id, p_entered_pin);

  if v_result.ok then
    v_token := encode(extensions.gen_random_bytes(24), 'base64');
    v_expires := now() + interval '30 days';
    v_device := coalesce(p_device_id, '__legacy_unscoped__');
    insert into public.member_grant_tokens (member_id, device_id, grant_token, expires_at, updated_at)
      values (p_member_id, v_device, v_token, v_expires, now())
      on conflict (member_id, device_id) do update
        set grant_token = excluded.grant_token, expires_at = excluded.expires_at, updated_at = now();
    return query select true, null::timestamptz, v_result.attempts_remaining, v_token, v_expires;
  else
    return query select false, v_result.locked_until, v_result.attempts_remaining, null::text, null::timestamptz;
  end if;
end;
$function$;

-- resolve_active_member_id: Tier-2 grant check now looks up
-- member_grant_tokens by (member_id, device_id, token) instead of
-- comparing against the old single-column pair on members. Legacy clients
-- that don't yet send x-device-id fall back to the same
-- '__legacy_unscoped__' row verify_member_pin_and_grant writes for them
-- above — matches today's exact behavior for anyone who hasn't updated.
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
  header_device_id text;
  header_member_auth_user_id uuid;
  verified_id text;
  v_grant_token text;
  v_grant_expires timestamptz;
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
  header_device_id := coalesce(
    nullif((current_setting('request.headers', true)::json->>'x-device-id'), ''),
    '__legacy_unscoped__'
  );

  if header_member_id is not null then
    select m.id, m.auth_user_id
      into verified_id, header_member_auth_user_id
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
      -- grant token was presented FOR THIS DEVICE specifically (the fix:
      -- scoped per (member_id, device_id) instead of one shared column,
      -- so a second device's PIN-switch can never invalidate this one's
      -- grant).
      if header_member_auth_user_id is not null and header_member_auth_user_id is distinct from auth.uid() then
        select grant_token, expires_at into v_grant_token, v_grant_expires
        from public.member_grant_tokens
        where member_id = header_member_id and device_id = header_device_id
        limit 1;

        if header_grant_token is not null
           and v_grant_token is not null
           and header_grant_token = v_grant_token
           and v_grant_expires is not null
           and v_grant_expires > now() then
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
  -- family. Otherwise: an arbitrary pick among the session's members.
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
