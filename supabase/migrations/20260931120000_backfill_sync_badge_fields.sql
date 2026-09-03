-- One-time backfill: any calendar_events row that has a real
-- event_external_links row (genuinely synced to a connected personal
-- calendar) but is missing last_external_sync_provider/_account/
-- _member_id/_at — the pre-existing gap in the dedup-link path
-- (check_likely_duplicate_event's "linked-to-dupe" branch, fixed this
-- session) meant every event that went through it before the fix never
-- got these columns stamped at all, live-reported as "no logo and which
-- member's calendar" on an otherwise-correctly-synced event.
--
-- Joins each linked event back to its connection for the real provider/
-- account/member — only touches rows genuinely missing this data (an
-- event with an existing, more-recent sync stamp from a different path
-- is left untouched), and only for personal-purpose connections (the
-- only purpose the badge/sync feature applies to at all).
update public.calendar_events ce
set
  last_external_sync_at = coalesce(ce.last_external_sync_at, eel.last_pulled_at, eel.last_pushed_at, eel.created_at),
  last_external_sync_provider = cc.provider,
  last_external_sync_account = cc.connected_account_email,
  last_external_sync_member_id = cc.member_id
from public.event_external_links eel
join public.calendar_connections cc on cc.id = eel.connection_id
where ce.id = eel.event_id
  and cc.purpose = 'personal'
  and ce.deleted_at is null
  and ce.last_external_sync_provider is null;
