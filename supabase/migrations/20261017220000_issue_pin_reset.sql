-- Called only by the request-pin-reset edge function (service role): stores a hashed 6-digit code valid for 10 minutes.
create or replace function public.issue_pin_reset(p_member_id text, p_code text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare last_req timestamptz;
begin
  select requested_at into last_req from public.pin_reset_codes where member_id = p_member_id;
  if last_req is not null and last_req > now() - interval '60 seconds' then return false; end if;  -- one code a minute
  insert into public.pin_reset_codes (member_id, code_hash, expires_at, attempts, requested_at)
  values (p_member_id, extensions.crypt(p_code, extensions.gen_salt('bf')), now() + interval '10 minutes', 0, now())
  on conflict (member_id) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, requested_at = now();
  return true;
end $$;
revoke all on function public.issue_pin_reset(text, text) from public, anon, authenticated;
grant execute on function public.issue_pin_reset(text, text) to service_role;
