-- Follow-up to 20260931020000: user explicitly wants PIN-switching to a
-- family member with their own auth account to feel like "this is now my
-- own app" for the whole session, not something that silently re-locks
-- mid-day. The app never re-prompts for this PIN once switched away and
-- back (setActiveMember has no re-verification step of its own), so a
-- short grant window would just produce confusing "couldn't confirm"
-- failures resuming days later with no re-entry prompt to explain why.
-- 30 days comfortably outlives any realistic gap between app opens while
-- still closing on its own if a device is ever fully abandoned.
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
    v_token := encode(gen_random_bytes(24), 'base64');
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
