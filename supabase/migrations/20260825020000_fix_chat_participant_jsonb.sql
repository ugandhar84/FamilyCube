-- HOTFIX — is_chat_channel_participant (migration 20260824020000) used
-- `caller_id = any(cc.member_ids)` against chat_channels.member_ids, which
-- is a jsonb column, not a native Postgres array (text[]) — `= any()`
-- against jsonb throws "op ANY/ALL (array) requires array on right side" on
-- every single SELECT/INSERT against chat_messages/chat_channels, breaking
-- live chat entirely (confirmed via real app logs immediately after the
-- previous migration went out: ensureDmChannelRow, send, and loadChannel
-- all failing with this exact error). Fixed to use jsonb containment
-- (`cc.member_ids @> to_jsonb(caller_id)`) instead of array ANY.

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
