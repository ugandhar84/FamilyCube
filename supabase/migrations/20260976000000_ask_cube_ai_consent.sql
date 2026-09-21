-- App Store rejection (guidelines 5.1.1(i)/5.1.2(i)): must obtain and be
-- able to demonstrate the user's consent before sending their message to
-- a third-party AI provider. AsyncStorage alone (client-only) isn't a
-- durable, auditable record — a reinstall/new device loses it, and there's
-- no way to prove to Apple (or answer a user's own "did I agree to this")
-- what consent text a member actually saw and when. This table is the
-- real record; AsyncStorage stays as a fast local cache so the consent
-- sheet doesn't have to round-trip the DB on every Ask Cube open.
create table if not exists public.ask_cube_ai_consents (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  consent_version text not null default 'v1',
  -- The exact disclosure text shown at consent time — not just a version
  -- number, so the actual wording a member agreed to is preserved even if
  -- the copy changes later.
  consent_text text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ask_cube_ai_consents_member_idx on public.ask_cube_ai_consents (member_id, consented_at desc);

alter table public.ask_cube_ai_consents enable row level security;

create policy "members can read their own consent records"
  on public.ask_cube_ai_consents for select
  using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );

create policy "members can record their own consent"
  on public.ask_cube_ai_consents for insert
  with check (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );
