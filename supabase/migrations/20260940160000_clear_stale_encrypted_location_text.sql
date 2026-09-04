-- Live-requested: "so let it reobtain using the permanent fix" — the 4
-- member_locations rows with an encrypted address were written before
-- forceRecheckLocationKeyWrap (this session's own fix) ever had a chance
-- to run, so their ciphertext has no corresponding member_location_keys
-- wrap for ANY device and can never be decrypted, permanent-fix or not.
--
-- Clears only the encrypted TEXT fields (address/street/neighborhood) —
-- lat/lng/status/battery_level/share_location_enabled and every other
-- plaintext column are untouched, so the live map/roster keep working
-- exactly as before. The next real location update from each member's
-- own device re-encrypts fresh text under a properly-wrapped session key
-- (via encryptLocationText -> ensureLocationKeyWrapped, now backed by the
-- forceRecheckLocationKeyWrap foreground check), so this is a one-time
-- "let it re-obtain" reset, not a recurring cleanup.
update member_locations
set address = null, street = null, neighborhood = null
where address is not null;
