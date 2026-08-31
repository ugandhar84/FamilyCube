-- Zero-tolerance requirement: on a shared device, exactly one family
-- member may ever be registered as "active" for push at a time — never
-- two, never stale. The client (saveTokenToMember in
-- shared/services/notifications.service.ts) already does a delete-then-
-- upsert on every profile switch to enforce this, but the table's own
-- constraint was only UNIQUE(member_id, device_id) — it never actually
-- forbade two DIFFERENT members from both holding a row for the same
-- device_id at once. That left a real (if narrow) race window: two rapid
-- PIN-switches, or a delete that succeeds while its paired upsert fails
-- partway, could leave more than one member's row pointing at the same
-- physical device simultaneously — exactly the double-registration this
-- design exists to prevent.
--
-- Adding a real UNIQUE(device_id) constraint makes this a database-
-- enforced guarantee, not just a client-discipline one: any upsert that
-- would leave two members claiming the same device is rejected outright,
-- not just usually-prevented.
--
-- First, defensively resolve any pre-existing duplicate device_id rows
-- (keep only the most recently updated one per device) so the new unique
-- index can actually be created.
delete from public.member_device_tokens a
using public.member_device_tokens b
where a.device_id = b.device_id
  and a.id <> b.id
  and (a.updated_at, a.id) < (b.updated_at, b.id);

alter table public.member_device_tokens
  add constraint member_device_tokens_device_id_key unique (device_id);
