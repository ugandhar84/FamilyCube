-- "Just Us" private parents-only chat channel — shared PIN, set/verified/
-- disabled by either parent, scoped to the CHANNEL row rather than any one
-- member (a per-member PIN, like members.pin, can't be a shared secret two
-- people both know).
--
-- Uses its own couple_<sorted ids> id prefix, distinct from dm_<sorted
-- ids> — confirmed requirement that a couple's regular 1-on-1 DM and their
-- PIN-gated Just Us thread coexist as two separate channels/histories, not
-- one replacing the other. Needs its own RLS branch (added to
-- is_chat_channel_participant() below) mirroring the existing dm_% branch
-- from migration 20260824020000 exactly — only the two encoded member ids
-- can ever read/write it.
--
-- Unlike members.pin (plaintext, pre-existing precedent this migration
-- does not need to preserve), this PIN is actually hashed — it's a shared
-- secret among family members, not something a same-family non-parent
-- should ever be able to read via a stray `select *` even if RLS is later
-- loosened by mistake.
create or replace function public.is_chat_channel_participant(p_channel_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_id text;
  caller_role text;
  parts text[];
begin
  select m.id, m.role into caller_id, caller_role
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1;

  if caller_id is null then
    return false;
  end if;

  if p_channel_id like 'dm\_%' escape '\' then
    parts := string_to_array(substring(p_channel_id from 4), '_');
    return caller_id = any(parts) or exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id and caller_id = any(cc.member_ids)
    );
  end if;

  -- "Just Us" — same pair-id participant check as dm_%, different prefix
  -- so it never collides with (or gets confused for) the plain DM.
  if p_channel_id like 'couple\_%' escape '\' then
    parts := string_to_array(substring(p_channel_id from 8), '_');
    return caller_id = any(parts) or exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id and caller_id = any(cc.member_ids)
    );
  end if;

  if p_channel_id in ('parents', 'seniors_a', 'seniors_b', 'seniors_all') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if p_channel_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  return true;
end;
$$;

alter table public.chat_channels
  add column if not exists pin_hash text,
  add column if not exists pin_salt text,
  add column if not exists pin_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

create or replace function public.set_channel_pin(p_channel_id text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_id text;
  v_salt text;
begin
  select m.id into v_caller_id from public.members m where m.auth_user_id = auth.uid() limit 1;
  if v_caller_id is null or not public.is_chat_channel_participant(p_channel_id) then
    raise exception 'not a participant of channel %', p_channel_id;
  end if;
  if p_pin is null or length(p_pin) <> 4 or p_pin !~ '^[0-9]{4}$' then
    raise exception 'pin must be exactly 4 digits';
  end if;

  v_salt := encode(gen_random_bytes(16), 'hex');
  update public.chat_channels
    set pin_hash = encode(digest(v_salt || p_pin, 'sha256'), 'hex'),
        pin_salt = v_salt,
        pin_attempts = 0,
        pin_locked_until = null
    where id = p_channel_id;
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

  v_entered_hash := encode(digest(v_channel.pin_salt || p_entered_pin, 'sha256'), 'hex');
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

-- Disabling never accepts the channel PIN itself — only the disabling
-- parent's own birth year — so a child who obtained/guessed the shared PIN
-- can't also turn the feature off to hide it. Checked server-side against
-- the caller's own members.date_of_birth so it can't be spoofed from the
-- client with an arbitrary year.
create or replace function public.disable_channel_pin(p_channel_id text, p_entered_birth_year integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_id text;
  v_caller_dob date;
begin
  select m.id, m.date_of_birth into v_caller_id, v_caller_dob
  from public.members m where m.auth_user_id = auth.uid() limit 1;

  if v_caller_id is null or not public.is_chat_channel_participant(p_channel_id) then
    raise exception 'not a participant of channel %', p_channel_id;
  end if;
  if v_caller_dob is null then
    raise exception 'no birth year on file for this member';
  end if;
  if extract(year from v_caller_dob)::integer <> p_entered_birth_year then
    return false;
  end if;

  update public.chat_channels
    set pin_hash = null, pin_salt = null, pin_attempts = 0, pin_locked_until = null
    where id = p_channel_id;
  return true;
end;
$function$;

comment on function public.set_channel_pin(text, text) is
  'Sets/replaces the shared PIN for a "Just Us" style parents-only channel. Either participant can call this. See migration 20260955000000.';
comment on function public.verify_channel_pin(text, text) is
  'Verifies the shared channel PIN with server-side attempt/lockout tracking, mirroring verify_member_pin. See migration 20260955000000.';
comment on function public.disable_channel_pin(text, integer) is
  'Disables (clears) a channel PIN — gated by the CALLING parent''s own birth year, never the channel PIN itself, so a child who learned the PIN cannot also disable the feature to hide it. See migration 20260955000000.';
