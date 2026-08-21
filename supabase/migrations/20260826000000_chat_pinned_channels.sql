-- Chat channel pins were stored in AsyncStorage only (lib/chatChannelOrder.ts)
-- — device-local, so a pin never survived a reinstall or synced to a second
-- device for the same person. Personal (per-member, not family-wide) pin
-- storage in the DB, matching the pattern already established this session
-- for other small per-concern tables (bounty_claims, temporary_approvers).

create table if not exists public.chat_pinned_channels (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  channel_id text not null,
  pinned_at timestamptz not null default now(),
  unique (member_id, channel_id)
);

comment on table public.chat_pinned_channels is
  'Which chat channels each member has manually pinned to the top of their own channel strip. Personal per-member, not shared/family-wide — the channel strip otherwise auto-sorts by most-recent-message.';

alter table public.chat_pinned_channels enable row level security;

create policy "chat_pinned_channels family access" on public.chat_pinned_channels
  for all
  using (
    member_id in (
      select m.id from public.members m
      where m.family_id = current_user_family_id()
    )
  )
  with check (
    member_id in (
      select m.id from public.members m
      where m.family_id = current_user_family_id()
    )
  );
