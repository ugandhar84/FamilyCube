-- Live-DB QA audit (Kid-role agent) found chat_messages/chat_channels RLS
-- policies check only family_id membership, never channel PARTICIPATION —
-- so any family member could read/write any other pair's private DM
-- (metadata: participants, timestamps, attachments, reply threads; message
-- bodies themselves are separately AES-256-GCM encrypted client-side, so
-- this didn't expose plaintext, but it defeated the whole point of a
-- "private" 1:1 channel for everything else). The earlier session fix
-- (deterministic dm_<sorted ids> channel id) solved a channel-COLLISION
-- bug but never added the matching per-participant RLS restriction.
--
-- Tightens access to require genuine participation:
--   - A dm_-prefixed channel id: caller's member id must be one of the two
--     ids encoded in the channel id itself (the deterministic pair scheme
--     from store/chatStore.ts's dmChannelId()), OR in the row's member_ids
--     array (covers any future channel type that populates it properly).
--   - 'parents'/'seniors_a'/'seniors_b'/'seniors_all': caller must be a
--     parent or grandparent (mirrors ChatScreen.tsx's own
--     `!(ch).seniorOnly || isSenior || isParent` gate).
--   - 'all': everyone family-wide EXCEPT grandparents (mirrors
--     ChatScreen.tsx's `ch.id !== 'all' || !isSenior` gate — seniors get
--     their own seniors_* channels instead of #all-family).
--   - Any other/future channel id: falls back to family-membership-only,
--     same as before this migration — this is intentionally permissive for
--     ids this policy doesn't recognize, rather than silently locking out a
--     channel type nobody has audited yet.

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

  if p_channel_id in ('parents', 'seniors_a', 'seniors_b', 'seniors_all') then
    return caller_role in ('parent', 'grandparent');
  end if;

  if p_channel_id = 'all' then
    return caller_role is distinct from 'grandparent';
  end if;

  -- Unrecognized channel id — don't newly restrict something this policy
  -- hasn't specifically reasoned about; family-membership check (already
  -- applied by the surrounding policy qual) still applies.
  return true;
end;
$$;

comment on function public.is_chat_channel_participant(text) is
  'Server-side channel-participation check backing chat_messages/chat_channels RLS. See migration 20260824020000 for the full access-rule rationale.';

drop policy if exists "chat_channels_select" on public.chat_channels;
create policy "chat_channels_select" on public.chat_channels for select
  using (
    family_id = (current_user_family_id())::text
    and public.is_chat_channel_participant(id)
  );

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages for select
  using (
    channel_id in (select cc.id from public.chat_channels cc where cc.family_id = (current_user_family_id())::text)
    and public.is_chat_channel_participant(channel_id)
  );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages for insert
  with check (
    channel_id in (select cc.id from public.chat_channels cc where cc.family_id = (current_user_family_id())::text)
    and public.is_chat_channel_participant(channel_id)
  );

drop policy if exists "chat_messages_update" on public.chat_messages;
create policy "chat_messages_update" on public.chat_messages for update
  using (
    channel_id in (select cc.id from public.chat_channels cc where cc.family_id = (current_user_family_id())::text)
    and public.is_chat_channel_participant(channel_id)
  )
  with check (
    channel_id in (select cc.id from public.chat_channels cc where cc.family_id = (current_user_family_id())::text)
    and public.is_chat_channel_participant(channel_id)
  );

drop policy if exists "chat_messages_delete" on public.chat_messages;
create policy "chat_messages_delete" on public.chat_messages for delete
  using (
    channel_id in (select cc.id from public.chat_channels cc where cc.family_id = (current_user_family_id())::text)
    and public.is_chat_channel_participant(channel_id)
  );
