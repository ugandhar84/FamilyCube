-- Soft-delete support for Roster's "delete profile" (non-auth members —
-- kids/seniors with no auth_user_id) and Profile's "delete account"
-- (auth-linked members). Both use the same 7-day soft-delete + notify +
-- permanent-purge pattern, per user direction ("do soft delete.. and after
-- a week complete delete.. give that notification to user").
--
-- profiles.deleted_at already exists (PawBond's own delete-account flow) —
-- reused as-is for the account-deletion path, just on a 7-day window
-- instead of that flow's original 30. members has no equivalent column at
-- all yet, needed for the profile-deletion path.
alter table public.members
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_notified_at timestamptz;

create index if not exists idx_members_deleted_at on public.members (deleted_at) where deleted_at is not null;
