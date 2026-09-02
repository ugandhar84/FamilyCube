-- Every existing Google personal calendar_connections row has a sync_token
-- that was minted BEFORE showDeleted=true was added to
-- googleReconcile.ts's Events.list call. Google's incremental sync tokens
-- are scoped to the parameter set used when they were issued — simply
-- adding showDeleted on a later poll using an OLD token does not
-- retroactively make that token start surfacing deletions (live-reported:
-- deleting an event directly on Google Calendar still never removed it
-- from the app, even after the showDeleted fix was deployed and a fresh
-- poll ran). Clearing sync_token forces the next poll for every affected
-- connection to run a fresh full sync with showDeleted=true from the
-- start, establishing a new token that correctly includes deletions going
-- forward.
update public.calendar_connections
set sync_token = null
where provider = 'google' and purpose = 'personal' and sync_token is not null;
