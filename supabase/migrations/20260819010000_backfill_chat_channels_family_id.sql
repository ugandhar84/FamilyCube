-- Fixes a half-finished family-scoping migration: chat_channels.family_id
-- was added in 20260813000002_chat_schema_v2.sql but the 4 legacy global
-- channel rows (general/parents/kids/announcements) were never backfilled,
-- so every RLS policy built against "channel_id IN (SELECT id FROM
-- chat_channels WHERE family_id = current_user_family_id())" matches
-- nothing — chat sends should be rejected for every family, not just new
-- ones. Confirmed via direct query: only ONE real family currently has
-- members (211fd767-7a94-4099-8c91-3b7d53f51e65), so a plain backfill (no
-- id churn, no risk to the call_sessions FK or client-side literal id
-- comparisons in ChatScreen.tsx/chatStore.ts) is safe and sufficient today.
--
-- For any FUTURE family created after this migration, a trigger gives them
-- their own real per-family channel rows (fresh ids, this family's
-- family_id) instead of silently reusing/colliding with the legacy rows.

update public.chat_channels
set family_id = '211fd767-7a94-4099-8c91-3b7d53f51e65'
where id in ('general', 'parents', 'kids', 'announcements')
  and family_id is null;

create or replace function public.create_default_chat_channels_for_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_channels (id, name, type, family_id, icon)
  values
    (new.id || '-general',       'Family Chat',   'general',      new.id, '💬'),
    (new.id || '-parents',       'Parents Only',  'parents_only', new.id, '🔒'),
    (new.id || '-kids',          'Kids Zone',      'kids_only',   new.id, '🎈'),
    (new.id || '-announcements', 'Announcements', 'general',      new.id, '📣')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_default_chat_channels on public.families;
create trigger trg_create_default_chat_channels
  after insert on public.families
  for each row execute function public.create_default_chat_channels_for_family();
