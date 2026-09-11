-- Fixes 2 real bugs found in migration 20260955000000 (couple_channel_pin)
-- via post-merge code audit, before this feature ever went live:
--
-- 1. is_chat_channel_participant()'s new couple_% branch copied the
--    PRE-hotfix substring-splitting approach for parsing dm_-style ids
--    (already fixed and abandoned for dm_% itself in migration
--    20260825030000, after a live incident: member ids containing
--    underscores, e.g. 'm_1786235893879', fracture under a naive split).
--    Re-declared here using ONLY the member_ids array check, matching the
--    CURRENT dm_% branch exactly — no string parsing at all.
--
-- 2. set_channel_pin did a bare `update chat_channels ... where id = ...`
--    with no row-existence check, silently affecting 0 rows (and still
--    returning true) whenever a couple enabled Just Us before ever
--    sending a message in that channel — chat_channels only otherwise
--    gets its row lazily, from ensureDmChannelRow on first sendMessage.
--    Net effect: toggling "Just Us" on could look successful client-side
--    while no PIN was actually persisted server-side. Re-declared to
--    upsert the chat_channels row (with member_ids populated) itself
--    before writing the PIN, and to verify the PIN update actually
--    affected a row before returning success.
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
begin
  select m.id, m.role into caller_id, caller_role
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1;

  if caller_id is null then
    return false;
  end if;

  if p_channel_id like 'dm\_%' escape '\' then
    return exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id and cc.member_ids @> to_jsonb(caller_id)
    );
  end if;

  if p_channel_id like 'couple\_%' escape '\' then
    return exists (
      select 1 from public.chat_channels cc
      where cc.id = p_channel_id and cc.member_ids @> to_jsonb(caller_id)
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

drop function if exists public.set_channel_pin(text, text);

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

  v_salt := encode(gen_random_bytes(16), 'hex');
  update public.chat_channels
    set pin_hash = encode(digest(v_salt || p_pin, 'sha256'), 'hex'),
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
