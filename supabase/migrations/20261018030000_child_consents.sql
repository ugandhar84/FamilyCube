-- A child cannot give their own consent to location sharing or to sending their messages to an AI provider (Apple 5.1.1,
-- children's privacy). A parent grants it for them here; the app and the ask-cube function both check this table for child accounts.
create table if not exists public.child_consents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  family_id text not null,
  kind text not null check (kind in ('ai', 'location')),
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  unique (member_id, kind)
);

alter table public.child_consents enable row level security;

drop policy if exists "family reads child consents" on public.child_consents;
create policy "family reads child consents" on public.child_consents for select
  using (exists (select 1 from public.members m where m.id::text = public.resolve_active_member_id() and m.family_id::text = child_consents.family_id));

drop policy if exists "parents grant child consents" on public.child_consents;
create policy "parents grant child consents" on public.child_consents for insert
  with check (
    granted_by::text = public.resolve_active_member_id()
    and exists (select 1 from public.members p where p.id::text = public.resolve_active_member_id() and p.role = 'parent' and p.family_id::text = child_consents.family_id)
    and exists (select 1 from public.members c where c.id::text = child_consents.member_id::text and c.family_id::text = child_consents.family_id)
  );

drop policy if exists "parents withdraw child consents" on public.child_consents;
create policy "parents withdraw child consents" on public.child_consents for delete
  using (exists (select 1 from public.members p where p.id::text = public.resolve_active_member_id() and p.role = 'parent' and p.family_id::text = child_consents.family_id));
