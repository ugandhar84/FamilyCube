-- Class schedules/timetables (School tab, features/vault/tabs/school/*, and
-- the flyer-scanner's "timetable" import path — components/FlyerScannerModal.tsx's
-- handleConfirmTimetable) have never had a Supabase table — store/schoolStore.ts's
-- own addSchedule/updateSchedule only ever wrote to AsyncStorage. Live-reported:
-- a scanned class schedule doesn't show up for anyone but the device it was
-- scanned on, and doesn't survive a reinstall. This gives it the same real
-- sync calendar_events/rewards already have.
--
-- One row per member (matches KidSchedule's existing memberId-keyed shape in
-- schoolStore.ts exactly — periods/holidays stored as jsonb rather than
-- normalized into their own tables, since they're always read/written as a
-- whole schedule, never queried independently).

create table if not exists public.kid_schedules (
  member_id     text primary key references public.members(id) on delete cascade,
  family_id     text not null,
  member_name   text not null,
  semester      text not null,
  year          integer not null,
  grade_year    text,
  school        text,
  lunch_period  text not null,
  day_type      text not null,
  periods       jsonb not null default '[]'::jsonb,
  holidays      jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

create index if not exists kid_schedules_family_id_idx on public.kid_schedules(family_id);

alter table public.kid_schedules enable row level security;

create policy "kid_schedules_select"
  on public.kid_schedules for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));

create policy "kid_schedules_insert"
  on public.kid_schedules for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));

create policy "kid_schedules_update"
  on public.kid_schedules for update
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text))
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));

create policy "kid_schedules_delete"
  on public.kid_schedules for delete
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
