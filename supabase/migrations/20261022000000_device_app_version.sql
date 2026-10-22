-- Which app release each device is running (per-device, keyed with the token row).
alter table public.member_device_tokens
  add column if not exists app_version text,
  add column if not exists build_number text;
notify pgrst, 'reload schema';
