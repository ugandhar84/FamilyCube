-- Moves Terms of Service text out of hardcoded app source into the
-- database, editable at runtime by an app admin — [live-requested: "i
-- want this terms to be in the DB.. not in the UI itself so i can modify
-- whenever is required"]. Keyed by slug rather than a single fixed row so
-- a Privacy Policy (or any future legal doc) can live in the same table
-- later without a schema change.
create table if not exists public.legal_documents (
  slug         text primary key,
  title        text not null,
  content      text not null,
  version      text not null default '1.0',
  updated_by   text references public.members(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.legal_documents enable row level security;

-- Every authenticated user can read every legal document — this is the
-- text shown to users before they accept it, so it must be visible to
-- everyone, not scoped to a family the way most other tables are.
drop policy if exists legal_documents_select_all on public.legal_documents;
create policy legal_documents_select_all
  on public.legal_documents for select
  to authenticated
  using (true);

-- Writes are app-admin-only, same is_app_admin() gate the rest of the
-- admin console uses (20260925090000_create_admin_console.sql).
drop policy if exists legal_documents_write_admin on public.legal_documents;
create policy legal_documents_write_admin
  on public.legal_documents for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.legal_documents is
  'Legal document text (Terms of Service, and any future doc keyed by slug), editable at runtime from the admin console (features/admin) instead of hardcoded in app source.';
