-- Follow-up to 20260940160000: that UPDATE silently affected zero rows —
-- member_locations_update's RLS policy (20260930520000) requires
-- member_id = resolve_active_member_id(), which returns null for a
-- migration connection (no real request-header session), so RLS silently
-- filtered out every row rather than erroring. Bypasses RLS for this one
-- statement only (same narrow, session-scoped pattern as the chat trigger
-- bypass in 20260940170000), re-enabled immediately after.
-- address is NOT NULL — empty string instead, which the client already
-- treats as falsy/no-address (features/kiosk/tabs/KioskFindFamTab.tsx:
-- `r.address ? await decryptLocationText(...) : r.address`, same pattern
-- in GpsTab.tsx), so this reads identically to a fresh row with no
-- address text yet, not an error state.
alter table member_locations disable row level security;
update member_locations
set address = '', street = '', neighborhood = ''
where address is not null and address <> '';
alter table member_locations enable row level security;
