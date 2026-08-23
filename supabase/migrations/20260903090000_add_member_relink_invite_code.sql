-- "Login with Code" re-link support: a parent can generate a code scoped to
-- one existing member (not just the family), so that member's *existing*
-- profile (coins/xp/streak intact) gets re-attached to a new/wiped device
-- instead of join-family creating a brand-new duplicate member row.
-- member_id is nullable — null means the existing "join as a new member" code.
-- members.id is text (not uuid) in this schema.
alter table public.family_invites
  add column if not exists member_id text references public.members(id) on delete cascade;

comment on column public.family_invites.member_id is
  'When set, this code re-links auth_user_id onto this existing member instead of creating a new member row.';
