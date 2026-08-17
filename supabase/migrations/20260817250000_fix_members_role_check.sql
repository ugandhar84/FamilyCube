-- members_role_check only allowed ('parent','child','kid','grandparent') —
-- 'teenager' and 'senior' were never added, even though RosterTab's
-- EditMemberModal writes role='teenager' directly (and would write
-- 'senior' too) when a parent edits a member's role. Every such edit was
-- silently failing the CHECK constraint, and the app never surfaced the
-- error (saveMember's update() call doesn't check for one), so it looked
-- like "not saving" with no explanation. 'kid' is kept alongside 'child'
-- for backward compat — some existing code paths already wrote 'kid'.
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check
  check (role = any (array['parent','child','kid','teenager','grandparent','senior']));
