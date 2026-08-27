-- Performance fix: chatStore.ts's loadUnreadCounts() fired one COUNT
-- query per open chat channel (Promise.all over channelIds), each with its
-- own "unread since" cutoff read from chat_channel_reads — a genuine N+1
-- that can't be expressed as a single client-side .select() since each
-- channel's cutoff differs. This RPC does the per-channel grouping
-- server-side in one query: a channel with no read-cursor row counts
-- every message from someone else as unread (matches the old "no cursor =
-- never read" semantics exactly), a channel with a cursor counts only
-- messages after it.
--
-- security definer + explicit p_member_id/p_channel_ids scoping (not
-- relying on auth.uid() alone) mirrors this app's existing RPC pattern —
-- caller passes the viewing member's id, same as every other member-scoped
-- RPC in this schema.
create or replace function public.get_unread_counts(
  p_member_id text,
  p_channel_ids text[]
)
returns table (channel_id text, unread_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    cm.channel_id,
    count(*) as unread_count
  from public.chat_messages cm
  left join public.chat_channel_reads cr
    on cr.channel_id = cm.channel_id and cr.member_id = p_member_id
  where cm.channel_id = any(p_channel_ids)
    and cm.sender_id != p_member_id
    and (cr.last_read_at is null or cm.created_at > cr.last_read_at)
  group by cm.channel_id
$$;

revoke all on function public.get_unread_counts(text, text[]) from public;
grant execute on function public.get_unread_counts(text, text[]) to authenticated;
