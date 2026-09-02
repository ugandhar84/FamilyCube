-- Diagnostic reset for an open investigation: a genuinely new event
-- created directly on the connected Google account's own primary
-- calendar, well within the sync window, is being reported as "0
-- items" on repeated polls even a full minute+ after creation — the
-- poll's own sync_token stays byte-for-byte unchanged across requests
-- (tokenIn === tokenOut), meaning Google's API itself is reporting
-- nothing changed since that token was issued. Forcing one more full
-- resync (no syncToken) will show definitively whether the event is
-- visible to the API at all via a full listing, isolating whether this
-- is a sync_token-specific gap or something else entirely.
update public.calendar_connections
set sync_token = null
where provider = 'google' and purpose = 'personal' and sync_token is not null;
