-- Live-DB QA verification found store/rewardStore.ts has been reading and
-- writing a `rewards` table that never actually existed in production —
-- `select * from rewards` returns 42P01 "relation does not exist". The only
-- reward-catalog table that was ever deployed is `reward_items` (from the
-- original bootstrap schema), which has a completely different, narrower
-- column set (no family scoping, no emoji/available/requires_approval/
-- eligible_member_ids/expires_at/max_per_member) and is not referenced by
-- any app code — it's dead/legacy from initial setup, never wired to the
-- client.
--
-- Effect of the missing table: syncFromDB's rewards query always failed
-- silently (caught, ignored), so the app fell back to SEED_REWARDS forever;
-- addReward/updateReward/deleteReward (the parent's reward-catalog editor)
-- all silently no-opped against the DB while appearing to work locally; and
-- every redemption card (Pending Approvals, My Redemptions) rendered the
-- fallback '🎁'/'Perk' placeholder instead of the real reward's title/emoji,
-- since the redemption's own row only stores reward_id/reward_title/
-- coin_cost — the client always tried to look up the full Reward object by
-- id from a rewards array that was actually always empty.
--
-- Creates the real table matching rewardToRow/rewardFromRow's existing
-- column mapping exactly, adds family_id (missing from the row mappers
-- entirely — every other write in this app is family-scoped, and RLS below
-- needs it), and RLS matching the same family-membership pattern
-- reward_redemptions already uses.
create table if not exists public.rewards (
  id                  text primary key,
  family_id           uuid not null references public.families(id) on delete cascade,
  title               text not null,
  emoji               text,
  description         text,
  category            text,
  cost                integer not null default 0,
  stock               integer,
  available           boolean not null default true,
  eligible_member_ids text[],
  max_per_member      integer,
  expires_at          timestamptz,
  icon_color          text,
  requires_approval   boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by_id       text
);

create index if not exists rewards_family_id_idx on public.rewards (family_id);

alter table public.rewards enable row level security;

create policy "rewards family read"
  on public.rewards for select
  using (family_id = current_user_family_id());

create policy "rewards family insert"
  on public.rewards for insert
  with check (family_id = current_user_family_id());

create policy "rewards family update"
  on public.rewards for update
  using (family_id = current_user_family_id())
  with check (family_id = current_user_family_id());

create policy "rewards family delete"
  on public.rewards for delete
  using (family_id = current_user_family_id());
