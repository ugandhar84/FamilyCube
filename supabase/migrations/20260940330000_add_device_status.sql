-- New, dedicated table for device health/identity — deliberately separate
-- from member_locations, which is about where a MEMBER is (GPS), not the
-- health of the physical device they're currently using. No mobile feature
-- exists yet to copy exactly: mobile's own battery_level/is_charging on
-- member_locations is a side effect of real GPS tracking (per-member, not
-- per-device) plus a root-level poll (lib/locationTracking.ts's
-- startBatteryPolling, started unconditionally from app/_layout.tsx for
-- every signed-in member) that already covers a kiosk device's OWN battery
-- for free, with zero kiosk-specific code needed. Device model/name has
-- never been persisted anywhere before — components/FeedbackSheet.tsx is
-- the only existing use of expo-device's Device.modelName/deviceName, and
-- it's read-only-for-a-support-form, never written to the DB.
--
-- One row per physical device (keyed by lib/chatCrypto.ts's getDeviceId(),
-- the same stable per-install identifier device_keys already uses), not
-- per member — a device's model/name doesn't change when a different
-- family member switches into it, so a kiosk's own row should never be
-- duplicated or reassigned as profiles switch.
create table if not exists public.device_status (
  device_id      text primary key,
  family_id      uuid not null references families(id) on delete cascade,
  device_model   text,
  device_name    text,
  battery_level  int,
  is_charging    boolean,
  updated_at     timestamptz not null default now()
);

create index if not exists device_status_family_idx on public.device_status(family_id);

alter table public.device_status enable row level security;

create policy device_status_select on public.device_status
  for select using (family_id = current_user_family_id());

create policy device_status_insert on public.device_status
  for insert with check (family_id = current_user_family_id());

create policy device_status_update on public.device_status
  for update using (family_id = current_user_family_id())
  with check (family_id = current_user_family_id());

comment on table public.device_status is 'One row per physical device (not per member) reporting its own battery and identity — separate from member_locations, which tracks where a MEMBER is via GPS.';
