-- notifications.id is text with no default at all — confirmed live via a
-- direct family-notifier test call: every insert it has EVER made failed
-- silently with "null value in column \"id\" of relation \"notifications\"
-- violates not-null constraint" (only ever console.warn'd inside the edge
-- function, never surfaced to any caller or UI). The only rows that ever
-- successfully landed in this table came from a different, older writer
-- that constructs its own deterministic string id (e.g.
-- "overdue_task-maya-2_20260809") — family-notifier's insert never set id
-- at all. This is why the in-app notification bell (NotificationPanel.tsx)
-- and the notifications sheet showed "All caught up" / "You're all caught
-- up" for every real chore/quest/reward/help notification, for every
-- family, this whole time.
--
-- gen_random_uuid()::text keeps the column type as text (matching the
-- existing deterministic string ids already stored) while giving every
-- future insert that doesn't supply its own id a real, always-unique one.
alter table public.notifications
  alter column id set default gen_random_uuid()::text;
