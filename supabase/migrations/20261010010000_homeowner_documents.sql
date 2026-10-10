-- House documents — a simple document vault for Home Care
-- [live-requested: "house documents page is not here now, bring document
-- flow similar to medical documents, with option to name them before
-- upload"]. Deliberately NOT a reskin of medical_records' AI-analysis /
-- redaction flow — house paperwork (insurance, deeds, manuals, warranty
-- cards) has no AI-review step and no PHI-grade redaction need, just
-- camera/library/file upload with a user-given name. Same parent-only
-- gating as homeowner_notes, and the storage RLS is written straight
-- against current_user_family_id() (the auth model other tables already
-- use) rather than repeating medical-records' original mistake of
-- scoping against members.user_id, which 20261002000000 had to fix after
-- every medical-records upload was silently failing RLS.

create table if not exists public.homeowner_documents (
  id text primary key default gen_random_uuid()::text,
  family_id text not null,
  name text not null,
  doc_type text not null default 'other' check (doc_type in ('insurance', 'deed', 'manual', 'warranty', 'other')),
  file_path text not null,
  file_name text not null,
  file_size integer,
  mime_type text,
  uploaded_by text not null references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists homeowner_documents_doc_type_idx on public.homeowner_documents(doc_type);

create index if not exists homeowner_documents_family_idx on public.homeowner_documents(family_id);

alter table public.homeowner_documents enable row level security;

create policy "parents_select_homeowner_documents" on public.homeowner_documents
  for select using (
    family_id = public.current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );

create policy "parents_insert_homeowner_documents" on public.homeowner_documents
  for insert with check (
    family_id = public.current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );

create policy "parents_delete_homeowner_documents" on public.homeowner_documents
  for delete using (
    family_id = public.current_user_family_id()::text
    and exists (select 1 from public.members m where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );

insert into storage.buckets (id, name, public)
  values ('homeowner-documents', 'homeowner-documents', false)
  on conflict (id) do nothing;

drop policy if exists homeowner_docs_storage_select on storage.objects;
create policy homeowner_docs_storage_select on storage.objects
  for select using (
    bucket_id = 'homeowner-documents'
    and (storage.foldername(name))[1] = public.current_user_family_id()::text
  );

drop policy if exists homeowner_docs_storage_insert on storage.objects;
create policy homeowner_docs_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'homeowner-documents'
    and (storage.foldername(name))[1] = public.current_user_family_id()::text
  );

drop policy if exists homeowner_docs_storage_delete on storage.objects;
create policy homeowner_docs_storage_delete on storage.objects
  for delete using (
    bucket_id = 'homeowner-documents'
    and (storage.foldername(name))[1] = public.current_user_family_id()::text
  );
