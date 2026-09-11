-- CRITICAL FIX, same exact bug class as migration
-- 20260931040000_fix_grant_token_pgcrypto_search_path.sql: pgcrypto is
-- installed in the `extensions` schema on this project, not `public`.
-- set_channel_pin/verify_channel_pin/disable_channel_pin's
-- `set search_path to 'public'` (the standard SECURITY DEFINER hardening
-- pattern) excludes `extensions`, so every call to gen_random_bytes() or
-- digest() inside them threw `function ... does not exist` — live-
-- reported: tapping "Set PIN" for Just Us always failed with "Could not
-- set PIN — check your connection and try again," on every attempt, no
-- matter the input. This was caught in production, not before deploy,
-- despite the prior incident being explicitly documented in the
-- migration history — should have been checked against that precedent
-- before shipping the same pattern here.
--
-- Fix: qualify every pgcrypto call with extensions.*, exactly like
-- verify_member_pin_and_grant's own fix.
create or replace function public.set_channel_pin(p_channel_id text, p_pin text, p_other_member_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_id text;
  v_family_id text;
  v_salt text;
  v_updated_rows integer;
begin
  select m.id, m.family_id into v_caller_id, v_family_id
  from public.members m where m.auth_user_id = auth.uid() limit 1;
  if v_caller_id is null then
    raise exception 'no member found for caller';
  end if;
  if p_channel_id not like 'couple\_%' escape '\' then
    raise exception 'set_channel_pin is only for couple_ channels';
  end if;
  if p_pin is null or length(p_pin) <> 4 or p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be exactly 4 digits';
  end if;

  insert into public.chat_channels (id, family_id, type, name, member_ids, icon)
  values (p_channel_id, v_family_id, 'direct', 'Just Us', jsonb_build_array(v_caller_id, p_other_member_id), '💕')
  on conflict (id) do nothing;

  if not public.is_chat_channel_participant(p_channel_id) then
    raise exception 'not a participant of channel %', p_channel_id;
  end if;

  v_salt := encode(extensions.gen_random_bytes(16), 'hex');
  update public.chat_channels
    set pin_hash = encode(extensions.digest(v_salt || p_pin, 'sha256'), 'hex'),
        pin_salt = v_salt,
        pin_attempts = 0,
        pin_locked_until = null
    where id = p_channel_id;
  get diagnostics v_updated_rows = row_count;
  if v_updated_rows = 0 then
    raise exception 'could not set pin for channel %', p_channel_id;
  end if;
  return true;
end;
$function$;

create or replace function public.verify_channel_pin(p_channel_id text, p_entered_pin text)
returns table(ok boolean, locked_until timestamptz, attempts_remaining integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_channel public.chat_channels;
  v_max_attempts constant integer := 5;
  v_lockout_seconds constant integer := 30;
  v_entered_hash text;
begin
  if not public.is_chat_channel_participant(p_channel_id) then
    raise exception 'not a participant of channel %', p_channel_id;
  end if;

  select * into v_channel from public.chat_channels where id = p_channel_id for update;
  if v_channel.id is null or v_channel.pin_hash is null then
    raise exception 'channel % has no pin set', p_channel_id;
  end if;

  if v_channel.pin_locked_until is not null and v_channel.pin_locked_until > now() then
    return query select false, v_channel.pin_locked_until, 0;
    return;
  end if;

  if v_channel.pin_locked_until is not null and v_channel.pin_locked_until <= now() then
    update public.chat_channels set pin_attempts = 0, pin_locked_until = null where id = p_channel_id;
    v_channel.pin_attempts := 0;
  end if;

  v_entered_hash := encode(extensions.digest(v_channel.pin_salt || p_entered_pin, 'sha256'), 'hex');
  if v_entered_hash = v_channel.pin_hash then
    update public.chat_channels set pin_attempts = 0, pin_locked_until = null where id = p_channel_id;
    return query select true, null::timestamptz, v_max_attempts;
    return;
  end if;

  declare
    v_next_attempts integer := v_channel.pin_attempts + 1;
    v_new_locked_until timestamptz := null;
  begin
    if v_next_attempts >= v_max_attempts then
      v_new_locked_until := now() + (v_lockout_seconds || ' seconds')::interval;
    end if;
    update public.chat_channels
      set pin_attempts = v_next_attempts, pin_locked_until = v_new_locked_until
      where id = p_channel_id;
    return query select false, v_new_locked_until, greatest(0, v_max_attempts - v_next_attempts);
  end;
end;
$function$;
