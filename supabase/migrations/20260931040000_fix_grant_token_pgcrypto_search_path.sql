-- CRITICAL FIX, found by actually re-simulating the PIN-switch grant-token
-- flow with a real member's real PIN rather than trusting the earlier
-- code-read verification: verify_member_pin_and_grant threw
-- `function gen_random_bytes(integer) does not exist` on every single
-- call — the function it deployed with is completely broken, meaning the
-- entire PIN-switch identity fix from earlier this session (migrations
-- 20260931020000/20260931030000) has never actually worked for a single
-- real user despite tsc being clean and the RPC deploying without error.
--
-- Root cause: pgcrypto is installed in the `extensions` schema on this
-- project, not `public` — confirmed live via
-- `select nspname from pg_proc join pg_namespace ... where proname =
-- 'gen_random_bytes'` → `extensions`. This function's `set search_path to
-- 'public'` (the standard SECURITY DEFINER hardening pattern used
-- throughout this session, correctly closing a search-path-injection risk)
-- excludes `extensions`, so `gen_random_bytes` was never resolvable inside
-- it. `gen_random_uuid()` used elsewhere in this session's other functions
-- happens to work under the same search_path because it's a Postgres core
-- builtin, not a pgcrypto extension function — an easy, exactly-this-kind
-- of assumption to get wrong without live-testing the actual call.
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
  select * into v_result from public.verify_member_pin(p_member_id, p_entered_pin);

  if v_result.ok then
    v_token := encode(extensions.gen_random_bytes(24), 'base64');
    v_expires := now() + interval '30 days';
    update public.members
      set active_grant_token = v_token, active_grant_expires_at = v_expires
      where id = p_member_id;
    return query select true, null::timestamptz, v_result.attempts_remaining, v_token, v_expires;
  else
    return query select false, v_result.locked_until, v_result.attempts_remaining, null::text, null::timestamptz;
  end if;
end;
$function$;
