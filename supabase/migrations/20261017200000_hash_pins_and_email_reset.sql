-- 1) PINs are no longer stored readable. members.pin holds a bcrypt hash (clients only ever test it for "is set").
-- 2) set_member_pin hashes on the server. 3) A forgotten PIN is reset with a short-lived emailed code.

create or replace function public.pin_matches(p_stored text, p_entered text)
returns boolean language sql stable set search_path = public, extensions as $$
  select p_stored is not null and p_entered is not null and (
    case when p_stored like '$2%' then extensions.crypt(p_entered, p_stored) = p_stored else p_stored = p_entered end);
$$;

-- verify_member_pin: compare through pin_matches instead of plain equality (verify_member_pin_and_grant calls it).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.verify_member_pin(text,text)'::regprocedure);
  def := replace(def, 'v_member.pin is not null and v_member.pin = p_entered_pin', 'public.pin_matches(v_member.pin, p_entered_pin)');
  if position('pin_matches' in def) = 0 then raise exception 'verify_member_pin patch did not apply'; end if;
  execute def;
end $$;

-- hash every PIN that is still stored in the clear
do $$ begin
  perform set_config('request.jwt.claim.role', 'service_role', true);  -- this one-off backfill is system work, not a user edit
  update public.members set pin = extensions.crypt(pin, extensions.gen_salt('bf')) where pin is not null and pin not like '$2%';
end $$;

-- set / clear a PIN: the member themself, or a parent in the same family. 4 digits only.
create or replace function public.set_member_pin(p_member_id text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare actor text := public.resolve_active_member_id(); a_role text; a_family uuid; t_family uuid;
begin
  select role, family_id into a_role, a_family from public.members where id = actor;
  select family_id into t_family from public.members where id = p_member_id;
  if actor is null or t_family is null then raise exception 'not allowed'; end if;
  if actor <> p_member_id and not (a_role = 'parent' and a_family = t_family) then raise exception 'not allowed'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);  -- authorisation was checked above; skip the generic row guard
  update public.members
     set pin = case when p_pin is null then null else extensions.crypt(p_pin, extensions.gen_salt('bf')) end,
         pin_attempts = 0, pin_locked_until = null
   where id = p_member_id;
end $$;
grant execute on function public.set_member_pin(text, text) to authenticated;

-- one-time reset codes (hashed, expire in 10 minutes, 5 tries)
create table if not exists public.pin_reset_codes (
  member_id text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  requested_at timestamptz not null default now()
);
alter table public.pin_reset_codes enable row level security;  -- no policies: only the functions below and the edge function touch it

create or replace function public.confirm_pin_reset(p_member_id text, p_code text, p_new_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r public.pin_reset_codes; owner uuid;
begin
  select auth_user_id into owner from public.members where id = p_member_id;
  if owner is null or owner is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if p_new_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  select * into r from public.pin_reset_codes where member_id = p_member_id for update;
  if r.member_id is null or r.expires_at < now() then raise exception 'That code has expired. Request a new one.'; end if;
  if r.attempts >= 5 then delete from public.pin_reset_codes where member_id = p_member_id; raise exception 'Too many tries. Request a new code.'; end if;
  if extensions.crypt(p_code, r.code_hash) <> r.code_hash then
    update public.pin_reset_codes set attempts = attempts + 1 where member_id = p_member_id;
    return false;
  end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);  -- ownership and code were verified above
  update public.members set pin = extensions.crypt(p_new_pin, extensions.gen_salt('bf')), pin_attempts = 0, pin_locked_until = null where id = p_member_id;
  delete from public.pin_reset_codes where member_id = p_member_id;
  return true;
end $$;
grant execute on function public.confirm_pin_reset(text, text, text) to authenticated;
