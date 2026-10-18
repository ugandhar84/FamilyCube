-- Linked school calendars (an .ics / webcal address). Each link says which children it belongs to, so siblings at the same school
-- share one link and children at different schools each get their own. "Sync now" re-reads the link and adds only what is new.
create table if not exists public.school_calendar_links (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  name text not null,
  url text not null,
  member_ids text[] not null default '{}',
  created_by text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.school_calendar_links enable row level security;

drop policy if exists "family reads school calendar links" on public.school_calendar_links;
create policy "family reads school calendar links" on public.school_calendar_links for select
  using (exists (select 1 from public.members m where m.id::text = public.resolve_active_member_id() and m.family_id::text = school_calendar_links.family_id));

drop policy if exists "parents manage school calendar links" on public.school_calendar_links;
create policy "parents manage school calendar links" on public.school_calendar_links for all
  using (exists (select 1 from public.members p where p.id::text = public.resolve_active_member_id() and p.role = 'parent' and p.family_id::text = school_calendar_links.family_id))
  with check (exists (select 1 from public.members p where p.id::text = public.resolve_active_member_id() and p.role = 'parent' and p.family_id::text = school_calendar_links.family_id));
