-- "Clear chat for me": hides a conversation's history up to a moment for ONE member. Nothing is deleted, so the other
-- people in the chat keep their full history.
create table if not exists public.member_chat_clears (
  member_id  text not null,
  channel_id text not null,
  cleared_at timestamptz not null default now(),
  primary key (member_id, channel_id)
);
alter table public.member_chat_clears enable row level security;

drop policy if exists "member_chat_clears_own" on public.member_chat_clears;
create policy "member_chat_clears_own" on public.member_chat_clears for all
  using (member_id = public.resolve_active_member_id())
  with check (member_id = public.resolve_active_member_id());
revoke all on public.member_chat_clears from anon;
