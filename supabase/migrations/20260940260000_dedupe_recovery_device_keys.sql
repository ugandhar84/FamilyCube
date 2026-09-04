-- setUpFamilyRecoveryKey's device_keys upsert was keyed on
-- (family_id, device_id, member_id) — the recovery slot has no true
-- owning member (member_id is only ever a constraint placeholder, see
-- that function's own doc), so when a DIFFERENT member later reset the
-- family passcode, the upsert inserted a SECOND 'recovery' row instead of
-- replacing the first, leaving two different recovery public keys
-- registered for the same family. getFamilyDeviceDirectory legitimately
-- returned both, and every wrap call that maps the directory straight
-- into a device_id-keyed upsert (chat_message_keys/member_location_keys/
-- family_record_keys) collided on the duplicate device_id within one
-- batch — "ON CONFLICT DO UPDATE command cannot affect row a second
-- time" — which is what was actually breaking location key wrapping
-- (surfaced as "encrypted wrong key" on the read side, but the real
-- failure was on write). lib/deviceRegistry.ts's setUpFamilyRecoveryKey
-- now deletes any existing recovery row before inserting, and
-- getFamilyDeviceDirectory defensively keeps only the newest recovery row
-- if duplicates are ever found again — this migration cleans up the one
-- family that already accumulated the bad state before those fixes shipped.
delete from device_keys a
using device_keys b
where a.device_id = 'recovery'
  and b.device_id = 'recovery'
  and a.family_id = b.family_id
  and a.created_at < b.created_at;
