-- A scanned prescription / vaccine record is kept on the server as soon as the AI has read it, so closing the app mid-scan (or before
-- reviewing) loses nothing: the person is asked to review it the next time they open Health. Saving is one bulk insert, then the job is marked saved.
create table if not exists public.scan_jobs (
  id              uuid primary key default gen_random_uuid(),
  family_id       text not null,
  created_by      text not null,
  owner_member_id text not null,
  scan_mode       text not null check (scan_mode in ('rx', 'vaccine')),
  status          text not null default 'processing' check (status in ('processing', 'ready', 'failed', 'saved', 'dismissed')),
  result          jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists scan_jobs_creator_idx on public.scan_jobs (created_by, status);
alter table public.scan_jobs enable row level security;

drop policy if exists "scan_jobs_select" on public.scan_jobs;
drop policy if exists "scan_jobs_insert" on public.scan_jobs;
drop policy if exists "scan_jobs_update" on public.scan_jobs;
drop policy if exists "scan_jobs_delete" on public.scan_jobs;
create policy "scan_jobs_select" on public.scan_jobs for select
  using (family_id = (current_user_family_id())::text and (created_by = resolve_active_member_id() or active_member_sees_whole_family()));
create policy "scan_jobs_insert" on public.scan_jobs for insert
  with check (family_id = (current_user_family_id())::text and created_by = resolve_active_member_id());
create policy "scan_jobs_update" on public.scan_jobs for update
  using (family_id = (current_user_family_id())::text and created_by = resolve_active_member_id());
create policy "scan_jobs_delete" on public.scan_jobs for delete
  using (family_id = (current_user_family_id())::text and created_by = resolve_active_member_id());
