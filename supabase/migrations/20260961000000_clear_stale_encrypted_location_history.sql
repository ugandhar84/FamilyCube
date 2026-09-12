-- One-time cleanup: member_location_history is append-only (every real GPS
-- ping inserts a new permanent row, unlike member_locations which
-- overwrites a single "current position" row) — so rows written under the
-- now-removed per-device location encryption scheme can never self-heal;
-- there is no future write that touches them again. Blank the unreadable
-- address text on rows written before this session's shared-key fix
-- shipped, so the "Location Today" history view shows nothing instead of
-- "[🔒 encrypted — wrong key or corrupted]" for every old entry
-- [live-reported, after the encryption fix: "why the fuck after every fix
-- im getting this back and no self healing"]. lat/lng/recorded_at are
-- never encrypted and are left untouched — only the address text is
-- cleared, and only for rows this migration can't retroactively decrypt.
-- Cutoff is generous on purpose: the fix (PR #63) only reaches a device
-- once it installs the build containing it, not at merge time, and no
-- build with the fix had been installed by any device as of this
-- migration — every existing row predates it in practice. Anything
-- inserted after this migration runs is written by an already-updated
-- device and uses the shared key correctly.
update member_location_history
set address = null
where address is not null
  and recorded_at < now();
