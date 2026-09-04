-- Two members' member_locations rows (d52dcd69-..., de318aa9-...) still
-- hold address/street/neighborhood ciphertext encrypted BEFORE this
-- session's device_id-collision fix (20260940260000 and the
-- getUniqueWrapTargets change in lib/deviceRegistry.ts/locationCrypto.ts)
-- ever ran successfully — at write time, member_location_keys had zero
-- rows for every member (the upsert was failing outright), so this text is
-- genuinely undecryptable by any device now, wrap fix or not: fixing the
-- wrap going forward does not retroactively re-wrap already-written
-- ciphertext. member 09f26aec's own location already self-healed on its
-- own next real write after the fix landed (confirmed live: 3 real
-- member_location_keys rows, fresh ciphertext) — same one-time "let it
-- reobtain" reset as 20260940160000/20260940190000, scoped to just the
-- two members that haven't had a fresh write since.
alter table member_locations disable row level security;
update member_locations
set address = '', street = '', neighborhood = ''
where member_id in ('d52dcd69-8cf0-4b60-a807-ba226709c2dd', 'de318aa9-41d2-49f3-a622-ad8485218b1f')
  and address is not null and address <> '';
alter table member_locations enable row level security;
