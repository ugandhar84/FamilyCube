-- Removes Smart Hub (thermostat vendor integration) entirely — blocked
-- indefinitely on Ecobee's developer program being closed and no working
-- vendor being wired up — and replaces it with a plain, vendor-independent
-- home maintenance tracker + free-form notes. Parent-only, same gating
-- Smart Hub had.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'smart-device-sync-5min') then
    perform cron.unschedule('smart-device-sync-5min');
  end if;
end $$;

drop table if exists public.smart_device_maintenance_reminders;
drop table if exists public.smart_device_filter_tracking;
drop table if exists public.smart_device_programs;
drop table if exists public.smart_devices;
drop table if exists public.smart_device_accounts;

create table if not exists public.homeowner_notes (
  id text primary key default gen_random_uuid()::text,
  family_id text not null,
  title text not null,
  notes text,
  category text not null default 'general' check (category in ('general', 'hvac', 'plumbing', 'electrical', 'appliance', 'exterior', 'safety', 'warranty')),
  due_date date,
  recur_every_days integer,
  completed_at timestamptz,
  photo_url text,
  created_by text not null references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists homeowner_notes_family_idx on public.homeowner_notes(family_id);
create index if not exists homeowner_notes_due_date_idx on public.homeowner_notes(due_date);

alter table public.homeowner_notes enable row level security;

create policy "parents_select_homeowner_notes" on public.homeowner_notes
  for select using (
    family_id = public.current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );

create policy "parents_insert_homeowner_notes" on public.homeowner_notes
  for insert with check (
    family_id = public.current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );

create policy "parents_update_homeowner_notes" on public.homeowner_notes
  for update using (
    family_id = public.current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );

create policy "parents_delete_homeowner_notes" on public.homeowner_notes
  for delete using (
    family_id = public.current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );
