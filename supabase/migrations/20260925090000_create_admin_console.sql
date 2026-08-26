-- Admin console for the app owner: a real is_app_admin()-style gate, plus
-- the two new dynamic systems requested (extended feature-flag toggling
-- already has its table — see 20260903160000_create_feature_flags.sql —
-- this only adds writers via is_app_admin(); paywall groups are entirely
-- new here).
--
-- app_admins is a DEDICATED platform-admin table, deliberately NOT folded
-- into the family-scoped `members` table (which has no concept of a
-- platform operator, only family roles) and NOT reusing `profiles.is_admin`
-- (that column belongs to the unrelated, unmodified PawBond template admin
-- section under app/admin — features/admin — which queries pet-app tables
-- that don't exist in Family Cube's schema and is being replaced by this
-- migration's gate, not extended).

create table if not exists public.app_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  note         text
);

alter table public.app_admins enable row level security;

-- An admin can see their own row (so the client-side gate can check
-- membership without needing a security-definer RPC round trip). No one
-- else can read this table — deliberately not "any authenticated user",
-- since even the mere existence/count of admin rows is not public.
drop policy if exists app_admins_select_self on public.app_admins;
create policy app_admins_select_self
  on public.app_admins for select
  using (auth_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy at all — app_admins is seeded/managed only
-- via SQL run directly against the project (Table Editor / migration),
-- never from the app itself. This is intentional: an admin console that
-- could grant itself more admins from the client would defeat the point.

comment on table public.app_admins is
  'Platform-admin allowlist for the app owner''s admin console (features/admin). Distinct from members.role (family-scoped) and from the legacy/unused profiles.is_admin column read by the old PawBond-template admin gate. Seeded manually — no app-side write path.';

-- is_app_admin() — security-definer helper for RLS write policies below,
-- same style as resolve_active_member_id()/current_user_family_id().
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.app_admins where auth_user_id = auth.uid()
  );
$$;

comment on function public.is_app_admin is
  'True if the current auth session belongs to a platform admin (row in app_admins). Security definer so RLS write policies can call it without granting callers direct SELECT on app_admins.';

-- feature_flags already exists (20260903160000_create_feature_flags.sql)
-- with an open SELECT policy and NO write policy (comment there says "no
-- app-side write path today" — true until now). Add one, scoped to
-- is_app_admin(), so the new Feature Flags admin screen's upsert() calls
-- actually succeed under RLS instead of silently failing.
drop policy if exists feature_flags_admin_write on public.feature_flags;
create policy feature_flags_admin_write
  on public.feature_flags for all
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ─── Paywall groups ─────────────────────────────────────────────────────────
-- The dynamic tier system: an admin defines/edits/removes these groups from
-- the UI at runtime — nothing about tier names or count is hardcoded in
-- application code. Seeded with a starter free/plus/premium set (a family
-- organizer app doesn't need more than a couple of paid tiers), but the
-- admin can rename/delete/add more immediately after this migration runs.
create table if not exists public.paywall_groups (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  label       text not null,
  description text,
  created_at  timestamptz not null default now()
);

alter table public.paywall_groups enable row level security;

drop policy if exists paywall_groups_select on public.paywall_groups;
create policy paywall_groups_select
  on public.paywall_groups for select
  using (auth.uid() is not null);

drop policy if exists paywall_groups_admin_write on public.paywall_groups;
create policy paywall_groups_admin_write
  on public.paywall_groups for all
  using (public.is_app_admin())
  with check (public.is_app_admin());

insert into public.paywall_groups (key, label, description) values
  ('plus',    'Plus',    'Entry paid tier — small conveniences beyond the free feature set.'),
  ('premium', 'Premium', 'Full unlock — every gated feature, for households that want it all.')
on conflict (key) do nothing;

-- ─── Feature → paywall group assignments ───────────────────────────────────
-- One row per feature_flags.key that the admin has explicitly assigned to a
-- paywall group. A feature with NO row here is unrestricted/free by
-- default — this table is additive-only restriction, never a second source
-- of "is this feature on at all" (that's still feature_flags).
create table if not exists public.feature_paywall_assignments (
  id               uuid primary key default gen_random_uuid(),
  feature_key      text not null unique,
  paywall_group_id uuid not null references public.paywall_groups(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.feature_paywall_assignments enable row level security;

drop policy if exists feature_paywall_assignments_select on public.feature_paywall_assignments;
create policy feature_paywall_assignments_select
  on public.feature_paywall_assignments for select
  using (auth.uid() is not null);

drop policy if exists feature_paywall_assignments_admin_write on public.feature_paywall_assignments;
create policy feature_paywall_assignments_admin_write
  on public.feature_paywall_assignments for all
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.paywall_groups is
  'Admin-defined subscription/paywall tiers, managed entirely at runtime from features/admin/screens/paywall-groups.tsx — no hardcoded tier list in application code.';
comment on table public.feature_paywall_assignments is
  'Maps a feature_flags.key to a paywall_groups row. No row for a given feature_key means that feature is free/unrestricted. Read via lib/featurePaywall.ts''s useFeaturePaywallGroup().';

-- ── Manual follow-up ────────────────────────────────────────────────────────
-- This migration does NOT seed app_admins itself — see the follow-up
-- migration 20260925091000_seed_app_admin.sql, which inserts the confirmed
-- admin account (ugandhar.nellore@gmail.com, looked up directly via the
-- Supabase Auth Admin API) as a separate, reviewable step.
