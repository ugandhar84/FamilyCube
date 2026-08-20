-- Cheap per-channel-per-member unread count. chat_read_receipts (added in
-- 20260813000002_chat_schema_v2.sql) is per-MESSAGE, per-member — right for
-- rendering "who's read this specific message" as an avatar stack, but
-- computing unread COUNTS for every tab in the channel strip (including
-- channels not currently open) from a per-message table means scanning
-- chat_messages left-joined against chat_read_receipts per channel, which
-- doesn't scale as history grows. This adds a single-row-per-(channel,member)
-- cursor — "I've read everything up to this timestamp in this channel" —
-- giving an O(1) unread count per channel via chat_channels.last_message_at
-- vs this cursor, no message scan needed.
create table if not exists public.chat_channel_reads (
  channel_id    text not null,
  member_id     text not null,
  last_read_at  timestamptz not null default now(),
  primary key (channel_id, member_id)
);

create index if not exists chat_channel_reads_member_idx on public.chat_channel_reads(member_id);

alter table public.chat_channel_reads enable row level security;

drop policy if exists "chat_channel_reads_select" on public.chat_channel_reads;
drop policy if exists "chat_channel_reads_upsert" on public.chat_channel_reads;
drop policy if exists "chat_channel_reads_update" on public.chat_channel_reads;

create policy "chat_channel_reads_select" on public.chat_channel_reads for select
  using (channel_id in (select id from public.chat_channels where family_id = public.current_user_family_id()::text));
create policy "chat_channel_reads_upsert" on public.chat_channel_reads for insert
  with check (channel_id in (select id from public.chat_channels where family_id = public.current_user_family_id()::text));
create policy "chat_channel_reads_update" on public.chat_channel_reads for update
  using (channel_id in (select id from public.chat_channels where family_id = public.current_user_family_id()::text))
  with check (channel_id in (select id from public.chat_channels where family_id = public.current_user_family_id()::text));
