-- HOTFIX #2 — is_chat_channel_participant's DM branch parsed the channel id
-- itself (`dm_<idA>_<idB>`, split on '_') to recover the two participant
-- ids. This breaks for any real member id that itself contains an
-- underscore — confirmed live: family 211fd767-...'s actual member ids
-- include `m_1786235893879`, so `dm_62ac7da2-..._m_1786235893879` splits
-- into THREE parts ('62ac7da2-...', 'm', '1786235893879') instead of two,
-- fracturing that member's id and making it never match `caller_id = any(parts)`
-- — a real, currently-participating member of their own DM was being
-- rejected by RLS (`new row violates row-level security policy`) right
-- after the previous hotfix (20260825020000) fixed the jsonb/array crash
-- that had been masking this second bug.
--
-- The dm_<sorted ids> scheme is fundamentally not safely re-splittable by a
-- fixed delimiter when member ids can themselves contain that delimiter —
-- rather than trying to parse the id at all, this drops the string-split
-- path entirely and relies solely on the stored member_ids array (which
-- ensureDmChannelRow in store/chatStore.ts populates with the real,
-- unfractured ids) as the single source of truth for DM participation.

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

  if p_channel_id in ('parents', 'seniors_a', 'seniors_b', 'seniors_all') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if p_channel_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  return true;
end;
$$;
