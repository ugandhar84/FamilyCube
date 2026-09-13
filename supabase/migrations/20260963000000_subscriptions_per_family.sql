-- Subscriptions were keyed strictly per-purchasing-user (unique on
-- user_id), contradicting the "Family Plan" premise entirely: a parent
-- subscribing never propagated premium status to their kids' PIN
-- profiles, since every read/write went through one specific auth user,
-- not the family as a whole [explicitly confirmed as a gap this session:
-- "subscription per family id right"].
--
-- Adds family_id, backfills it from members.auth_user_id for any
-- existing rows (none exist in production as of this migration — the
-- feature has never had a real purchase go through it yet — but this
-- keeps the migration correct regardless), and re-keys uniqueness to
-- family_id instead of user_id. user_id is kept (nullable now) purely as
-- a record of which specific family member's purchase originated the
-- subscription — not used for entitlement lookups anymore.
alter table public.subscriptions
  add column if not exists family_id uuid references public.families(id) on delete cascade;

update public.subscriptions s
set family_id = m.family_id
from public.members m
where s.family_id is null
  and m.auth_user_id = s.user_id;

-- A subscription row with no resolvable family (the purchasing user has
-- no members row, e.g. a since-deleted account) can't be family-scoped —
-- drop it rather than leave an orphaned row that would fail the coming
-- NOT NULL constraint. Zero rows expected in practice per this
-- migration's own header comment.
delete from public.subscriptions where family_id is null;

alter table public.subscriptions
  alter column family_id set not null;

-- Replace the per-user uniqueness with per-family — one active
-- subscription record per family, not per member.
drop index if exists subscriptions_user_id_idx;
create unique index if not exists subscriptions_family_id_idx on public.subscriptions(family_id);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

-- RLS: every family member (not just the original purchaser) can read
-- the family's own subscription row.
drop policy if exists "Users can read own subscription" on public.subscriptions;
create policy "Family members can read family subscription"
  on public.subscriptions for select
  using (family_id = public.current_user_family_id());

-- Service-role policy is unchanged (webhook/sync functions use the
-- service role key, bypassing RLS entirely, but keeping this explicit
-- policy documents intent and covers any future non-service-role write
-- path).
