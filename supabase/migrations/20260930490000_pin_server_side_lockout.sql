-- Logged QA gap: the 5-attempt lockout in PinEntryModal.tsx lives entirely
-- in local React state (attempts/locked/lockRemaining) with zero server
-- memory — force-quitting and reopening the app (or just leaving the sheet
-- and coming back) resets the count to 0, making the lockout pure theatre
-- against a genuine guessing attempt. This adds real, server-remembered
-- attempt tracking, so a lockout survives the app being closed/reopened.
--
-- Not attempted here: hashing the PIN itself, or hiding it from sibling
-- sessions' reads (both real, documented separately — hiding a single
-- column from members requires moving every read site to a view, a
-- bigger, riskier change deferred to a dedicated pass). This migration
-- closes the "guessing has no real rate limit" half specifically.
alter table public.members
  add column if not exists pin_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

create or replace function public.verify_member_pin(p_member_id text, p_entered_pin text)
returns table(ok boolean, locked_until timestamptz, attempts_remaining integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member public.members;
  v_max_attempts constant integer := 5;
  v_lockout_seconds constant integer := 30;
begin
  select * into v_member from public.members where id = p_member_id for update;
  if v_member.id is null then
    raise exception 'member % not found', p_member_id;
  end if;

  if v_member.pin_locked_until is not null and v_member.pin_locked_until > now() then
    return query select false, v_member.pin_locked_until, 0;
    return;
  end if;

  -- Lockout window has passed (or there never was one) — a stale attempt
  -- count from before an expired lockout shouldn't count against a fresh
  -- attempt.
  if v_member.pin_locked_until is not null and v_member.pin_locked_until <= now() then
    update public.members set pin_attempts = 0, pin_locked_until = null where id = p_member_id;
    v_member.pin_attempts := 0;
  end if;

  if v_member.pin is not null and v_member.pin = p_entered_pin then
    update public.members set pin_attempts = 0, pin_locked_until = null where id = p_member_id;
    return query select true, null::timestamptz, v_max_attempts;
    return;
  end if;

  declare
    v_next_attempts integer := v_member.pin_attempts + 1;
    v_new_locked_until timestamptz := null;
  begin
    if v_next_attempts >= v_max_attempts then
      v_new_locked_until := now() + (v_lockout_seconds || ' seconds')::interval;
    end if;
    update public.members
      set pin_attempts = v_next_attempts, pin_locked_until = v_new_locked_until
      where id = p_member_id;
    return query select false, v_new_locked_until, greatest(0, v_max_attempts - v_next_attempts);
  end;
end;
$function$;
