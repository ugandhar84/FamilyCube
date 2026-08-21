-- Multi-slot bounty claiming — "up to N kids" already had a full built UI
-- (AddQuestAssignSection's picker, QuestCard's "Full — 2/3 claimed" copy,
-- Quest.maxClaimants field) but the backend never implemented it:
-- choreAdapter.ts's updateQuest explicitly no-ops maxClaimants ("pool
-- managed by isPool flag"), and claimBounty (store/choreStore.ts) only
-- ever supports exactly one claimant (`if (chore.assignedToId) return`).
--
-- A pre-existing quest_participants table looked like the right fit
-- (identical shape to the Quest.participants type this session confirmed)
-- but its quest_id column has a hard FK to a `quests` table — a dead,
-- pre-choreStore-migration table (14 stale legacy rows) structurally
-- unrelated to the live chore_tasks table (the real, actively-written
-- table every current store action uses). Reusing quest_participants would
-- require either dropping that FK (weakening a real constraint) or
-- populating the dead `quests` table in parallel with every chore_tasks
-- write (real, ongoing complexity for no benefit). A clean, purpose-built
-- table scoped correctly to chore_tasks is simpler and safer.

alter table public.chore_tasks
  add column if not exists max_claimants integer;

comment on column public.chore_tasks.max_claimants is
  'For categoryType=bounty pool chores: how many kids can independently claim a slot. NULL/1 = single-claimant (existing claimBounty behavior, unchanged). >1 = multi-slot, tracked via bounty_claims rather than assigned_to_id.';

create table if not exists public.bounty_claims (
  id uuid primary key default gen_random_uuid(),
  chore_id text not null references public.chore_tasks(id) on delete cascade,
  member_id text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'pending_approval', 'approved', 'declined')),
  claimed_at timestamptz not null default now(),
  submitted_at timestamptz,
  submission_photo_url text,
  submission_note text,
  approved_at timestamptz,
  reviewed_by_id text,
  declined_at timestamptz,
  rejection_reason text,
  coins_awarded integer,
  created_at timestamptz not null default now(),
  unique (chore_id, member_id)
);

comment on table public.bounty_claims is
  'One row per kid who claimed a slot on a multi-claimant bounty (chore_tasks.max_claimants > 1). Each claim is worked/submitted/approved/paid independently — mirrors the single-claimant chore_tasks lifecycle fields 1:1, scoped per participant instead of per chore.';

create index if not exists bounty_claims_chore_id_idx on public.bounty_claims(chore_id);

alter table public.bounty_claims enable row level security;

create policy "bounty_claims family access" on public.bounty_claims
  for all
  using (
    chore_id in (
      select ct.id from public.chore_tasks ct
      where ct.family_id = (current_user_family_id())::text
    )
  )
  with check (
    chore_id in (
      select ct.id from public.chore_tasks ct
      where ct.family_id = (current_user_family_id())::text
    )
  );
