-- The previous sync_token reset (20260931070000) forced a fresh full sync
-- to pick up showDeleted=true, but that fresh sync's own delete-apply step
-- then failed on a foreign key violation (deleted_by was a literal string,
-- not a real members.id — fixed in this session's next commit). Google's
-- sync_token had already advanced past that cancelled item by the time the
-- FK error was hit, so it will never be re-delivered on its own — the next
-- poll now correctly reports "0 items" (nothing changed since last
-- successful sync) while the local calendar_events row for that deleted
-- event is still sitting there, never actually soft-deleted. One more
-- token reset forces a genuinely fresh full sync (now that deleted_by is
-- fixed) that will re-see and correctly apply every cancelled event still
-- stuck in this state.
update public.calendar_connections
set sync_token = null
where provider = 'google' and purpose = 'personal' and sync_token is not null;
