-- Fixes shared-device push notification bug: members.expo_push_token is a
-- single text column per member row, written by saveTokenToMember() every
-- time the PIN-switched active profile changes on a device (see
-- store/familyStore.ts's setActiveMember). On a device used by only one
-- person this is fine, but on a shared family device (one tablet, several
-- kids/parents switching profiles via PIN through the day) every member who
-- has ever been active on that device gets the SAME token written to their
-- row, clobbered on each switch — so only the most-recently-active member's
-- stored token is actually current. A push meant for a specific person can
-- land on whoever the device currently shows as active instead, or fail to
-- reach someone whose token is stale.
--
-- member_device_tokens fixes this by keying tokens on (member_id, device_id)
-- instead of member_id alone — one row per member PER PHYSICAL DEVICE, using
-- the app's existing stable per-device identifier (lib/chatCrypto.ts's
-- getDeviceId(), a SecureStore-persisted UUID already used by
-- lib/deviceRegistry.ts / device_keys for chat E2E encryption — same id,
-- different table). A member active on 2 real devices gets 2 rows and both
-- receive pushes, which is correct multi-device behavior. When a different
-- member becomes active on a given physical device, the client deletes that
-- device's row for the previously-active member (see saveTokenToMember in
-- shared/services/notifications.service.ts) so a device can never claim to
-- belong to more than one member at once.
--
-- Column types / FK shape and RLS pattern follow device_keys (see
-- 20260903130000_add_per_device_chat_encryption.sql), the closest existing
-- analog (also a per-member, per-device table): family_id uuid referencing
-- families(id), member_id text referencing members(id) — members.id is text
-- app-wide, not the broken `members.id = auth.uid()::text` RLS pattern that
-- 20260818192700_fix_member_auth_identity.sql replaced. RLS here uses the
-- same current_user_family_id() helper every other table's policies use.
--
-- members.expo_push_token is NOT removed or stopped-being-written by this
-- migration — it stays as a "last known token" fallback for the transition
-- period before every device has re-registered under this new table.

create table if not exists public.member_device_tokens (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id) on delete cascade,
  member_id         text not null references public.members(id) on delete cascade,
  device_id         text not null,
  expo_push_token   text not null,
  platform          text,
  updated_at        timestamptz not null default now(),
  unique (member_id, device_id)
);

create index if not exists member_device_tokens_member_idx on public.member_device_tokens(member_id);
create index if not exists member_device_tokens_family_idx on public.member_device_tokens(family_id);
create index if not exists member_device_tokens_device_idx on public.member_device_tokens(device_id);

alter table public.member_device_tokens enable row level security;

-- Scoped like device_keys: any member of the family can read/write token
-- rows for their own family (tokens aren't secret to other family members
-- the way chat keys are; family-notifier and friends read this with the
-- service role and bypass RLS entirely anyway).
create policy member_device_tokens_select on public.member_device_tokens
  for select using (family_id = public.current_user_family_id());

create policy member_device_tokens_insert on public.member_device_tokens
  for insert with check (family_id = public.current_user_family_id());

create policy member_device_tokens_update on public.member_device_tokens
  for update using (family_id = public.current_user_family_id())
  with check (family_id = public.current_user_family_id());

create policy member_device_tokens_delete on public.member_device_tokens
  for delete using (family_id = public.current_user_family_id());

comment on table public.member_device_tokens is 'Per-(member, physical device) Expo push token — replaces the single members.expo_push_token column as the source of truth for shared-device households. A member can have multiple rows (multiple real devices); a device_id can only belong to one member row at a time (client deletes the previous member''s row for this device_id on PIN switch).';
comment on column public.member_device_tokens.device_id is 'Stable per-install device identifier from lib/chatCrypto.ts getDeviceId() (SecureStore-persisted UUID) — same id already used by device_keys for chat E2E, reused here rather than inventing a second device identifier.';
