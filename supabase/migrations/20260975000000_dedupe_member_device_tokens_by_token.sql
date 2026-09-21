-- Live-reported: "parent sending a message to family channel - hismelf
-- also getting notification." Traced to member_device_tokens allowing the
-- SAME expo_push_token to be registered under multiple member_id rows —
-- the table's real constraint is UNIQUE(device_id), not
-- UNIQUE(expo_push_token), so a physical device that gets reinstalled
-- (regenerating chatCrypto.ts's getDeviceId() UUID) can end up with an old
-- stale row under one member still pointing at the same token a NEWER row
-- under a different member now also owns. chat-notify correctly excludes
-- the sender's own member_id from `recipients`, but
-- resolveTokensForMembersDetailed (family-notifier) resolves tokens purely
-- by member_id with no cross-member collision check — so if the token is
-- shared with a legitimate recipient, the sender's own physical device
-- receives the push anyway, via the stale row.
--
-- Backfill: for any token registered to more than one member, keep only
-- the most-recently-updated row and delete the rest.
delete from public.member_device_tokens t
using (
  select id, row_number() over (partition by expo_push_token order by updated_at desc) as rn
  from public.member_device_tokens
  where expo_push_token is not null
) ranked
where t.id = ranked.id and ranked.rn > 1;

-- Prevent it recurring: a token can only ever belong to one member/device
-- row going forward. saveTokenToMember's own device_id-based
-- delete-then-upsert already handles the common "same device, different
-- member" case; this closes the remaining gap where the OLD device_id
-- itself never gets cleaned up (e.g. an app reinstall that keeps issuing
-- the same underlying Expo token under a fresh device_id).
create unique index if not exists member_device_tokens_token_unique
  on public.member_device_tokens (expo_push_token)
  where expo_push_token is not null;
