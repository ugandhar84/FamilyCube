-- Two real gaps found while building the Maternal/Paternal Grands + DM-based
-- nudge redirects:
--
-- 1. Every DM tab in ChatScreen.tsx uses the OTHER member's id as channel_id
--    (kids.map(k => ({ id: k.id, ... })), and the new sponsor-DM redirects in
--    DeclineQuestSheet.tsx/QuestsScreen.tsx). RLS on chat_messages requires
--    channel_id IN (SELECT id FROM chat_channels WHERE family_id = ...) — but
--    no chat_channels row has ever existed for a DM. Every 1:1 message send
--    has been silently rejected by RLS this whole time. Backfilling one row
--    per existing member + a trigger for future members.
--
-- 2. The old flat 'seniors' channel is replaced client-side by
--    'seniors_a'/'seniors_b'/'seniors_all' (maternal/paternal split + Grand
--    Squad) — same missing-row problem as 'all'/'seniors' fixed in
--    20260819010500. Adding rows for the new ids.
--
-- Also adds a last-message trigger so chat_channels.last_message_at/preview
-- (columns that already exist but were never populated by anything) become
-- real — the app's channel-strip auto-sort can query this cheaply instead of
-- scanning chat_messages per channel.

-- ─── DM channel rows — one per member, id = that member's own id ─────────────
-- A DM "channel" is keyed by the OTHER party's member id from each side's
-- perspective (ChatScreen.tsx: channelId = the other member's id) — so every
-- member needs exactly one row whose id is their own member id.
insert into public.chat_channels (id, name, type, family_id, icon, member_ids)
select m.id, m.name, 'direct', m.family_id::text, '💬', jsonb_build_array(m.id)
from public.members m
on conflict (id) do update set family_id = excluded.family_id;

create or replace function public.create_dm_chat_channel_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_channels (id, name, type, family_id, icon, member_ids)
  values (new.id, new.name, 'direct', new.family_id::text, '💬', jsonb_build_array(new.id))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_dm_chat_channel on public.members;
create trigger trg_create_dm_chat_channel
  after insert on public.members
  for each row execute function public.create_dm_chat_channel_for_member();

-- ─── Senior side-channels — Maternal/Paternal Grands + combined Grand Squad ──
-- One row per family that currently has at least one senior member, matching
-- buildGroupChannels()'s ids in features/chat/components/constants.ts.
insert into public.chat_channels (id, name, type, family_id, icon)
select distinct m.family_id::text || '-seniors_a', 'Grands (Side A)', 'group', m.family_id::text, '👶'
from public.members m where m.role = 'grandparent'
on conflict (id) do nothing;

insert into public.chat_channels (id, name, type, family_id, icon)
select distinct m.family_id::text || '-seniors_b', 'Grands (Side B)', 'group', m.family_id::text, '👶'
from public.members m where m.role = 'grandparent'
on conflict (id) do nothing;

insert into public.chat_channels (id, name, type, family_id, icon)
select distinct m.family_id::text || '-seniors_all', 'The Grand Squad', 'group', m.family_id::text, '👨‍👩‍👧'
from public.members m where m.role = 'grandparent'
on conflict (id) do nothing;

-- Also keep the plain (non-family-prefixed) ids working for the single
-- current family, matching how 'all'/'seniors' were backfilled previously —
-- ChatScreen.tsx uses bare ids ('seniors_a' not '<family>-seniors_a').
insert into public.chat_channels (id, name, type, family_id, icon)
values
  ('seniors_a',   'Grands (Side A)',  'group', '211fd767-7a94-4099-8c91-3b7d53f51e65', '👶'),
  ('seniors_b',   'Grands (Side B)',  'group', '211fd767-7a94-4099-8c91-3b7d53f51e65', '👶'),
  ('seniors_all', 'The Grand Squad',  'group', '211fd767-7a94-4099-8c91-3b7d53f51e65', '👨‍👩‍👧')
on conflict (id) do update set family_id = excluded.family_id;

-- ─── Keep last_message_at/preview/sender_id live ──────────────────────────────
create or replace function public.touch_chat_channel_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_channels
  set last_message_at = new.created_at,
      last_message_preview = left(coalesce(new.text, ''), 120),
      last_message_sender_id = new.sender_id,
      updated_at = now()
  where id = new.channel_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_chat_channel_last_message on public.chat_messages;
create trigger trg_touch_chat_channel_last_message
  after insert on public.chat_messages
  for each row execute function public.touch_chat_channel_last_message();
