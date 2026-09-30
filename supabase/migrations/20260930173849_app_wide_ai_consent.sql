-- App Store rejection (guidelines 5.1.1(i)/5.1.2(i)): every feature that
-- sends a member's personal data (photos, recordings, documents) to a
-- third-party AI provider must disclose what's sent and obtain consent
-- first — not just Ask Cube, which already has its own
-- ask_cube_ai_consents table. This is the same pattern generalized to a
-- single app-wide consent that covers every other AI-calling feature
-- (prescription scan, flyer scan, receipt scan, appointment recording
-- analysis, medical record analysis) so each doesn't need its own table
-- and its own one-time interruption for the member.
create table if not exists public.ai_consents (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  consent_version text not null default 'v1',
  -- The exact disclosure text shown at consent time — preserved verbatim
  -- so what a member actually agreed to survives later copy changes.
  consent_text text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ai_consents_member_idx on public.ai_consents (member_id, consented_at desc);

alter table public.ai_consents enable row level security;

create policy "members can read their own ai consent records"
  on public.ai_consents for select
  using (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );

create policy "members can record their own ai consent"
  on public.ai_consents for insert
  with check (
    member_id in (select id from public.members where auth_user_id = auth.uid())
  );
