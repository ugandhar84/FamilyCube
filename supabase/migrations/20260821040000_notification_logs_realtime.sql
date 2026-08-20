-- Ensure notification_logs is in the supabase_realtime publication.
--
-- app/_layout.tsx's `global-notif-${rtUserId}` channel already subscribes to
-- postgres_changes INSERT events on notification_logs (pre-existing, wired
-- to notifStore's increment()/prependNotification()) and the in-app toast +
-- NotificationPanel (components/NotificationPanel.tsx) both depend on that
-- subscription actually firing. This table was very likely already added to
-- the publication outside of a tracked migration (same situation as
-- chore_tasks/calendar_events/trips noted in
-- 20260820121500_realtime_members_kidrequests_pqa.sql) since the existing
-- social-notification features already rely on it — this migration is a
-- defensive no-op if so, and only takes effect if it somehow isn't.
--
-- Idempotent: ALTER PUBLICATION ... ADD TABLE fails if the table is already
-- a member, so this guards with a check against pg_publication_tables first.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_logs'
  ) then
    alter publication supabase_realtime add table public.notification_logs;
  end if;
end $$;
