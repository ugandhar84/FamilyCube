-- Follow-up to 20260925097000: adds the actual constraint once duplicate
-- created-families have been resolved (see that migration's comment and
-- admin_list_duplicate_family_creators() for how to find/clean them up
-- first). Run this migration only after confirming zero duplicates remain
-- — it will fail loudly (by design) otherwise, the same way
-- 20260925097000's own attempt did during authoring.
create unique index idx_families_created_by_unique
  on public.families (created_by)
  where created_by is not null;

comment on index public.idx_families_created_by_unique is
  'Enforces one-created-family-per-auth-account. Does NOT limit how many families an account can JOIN (members.auth_user_id has no such constraint, deliberately — see 20260904100000_add_member_email_invite_support.sql).';
