-- Per-invitee invite system: a parent fills in a pending family member's
-- name/relationship/role FIRST (creating a real `members` row immediately,
-- invite_status = 'pending'), THEN generates a code scoped to that specific
-- member id. Replaces the old model where a single reusable family-wide
-- code created a brand-new member row from whatever name/role the joiner
-- typed in at claim time, and stayed live for reuse after being claimed.
--
-- family_invites.member_id already exists (see
-- 20260903090000_add_member_relink_invite_code.sql — it was added for a
-- narrower "re-link an existing member to a new device" case). This
-- migration makes member_id the PRIMARY path generate-invite-code/
-- join-family use, not just a re-link option: every new code is minted
-- against a pre-created member row, and claiming it consumes the code
-- (status -> 'accepted', not just 'used_by' bookkeeping while status stays
-- 'pending' — today's actual bug, where a claimed code stayed live for
-- anyone else who had it) and stamps invite_status -> 'active' on the
-- member row it claims.
--
-- members.invite_status already exists (20260904100000_add_member_email_
-- invite_support.sql) with check (active, invited) for the email-invite
-- system (member_invitations table). This reuses the SAME column rather
-- than adding a new one, per explicit instruction to check first — just
-- widens the allowed values to also cover the code-based pending state.

-- 'pending'    — parent created this member's row with name/relationship/
--                role, no code claimed yet (or a code was generated but
--                not yet redeemed).
-- 'active'     — already the default for members created directly (parent/
--                founding member) and reused by accept-member-invite (email
--                path) on acceptance.
-- 'invited'    — kept for backward compatibility (email-invite system state
--                that existed before this migration; not written by the new
--                code path, but not removed either since member_invitations
--                'pending' rows may still reference members in this state).
alter table public.members
  drop constraint if exists members_invite_status_check;
alter table public.members
  add constraint members_invite_status_check
  check (invite_status = any (array['active'::text, 'invited'::text, 'pending'::text]));

comment on column public.members.invite_status is
  'active = normal member; pending = pre-created by a parent via the per-invitee invite flow, code not yet claimed; invited = legacy email-invite-system state. Never a permission gate on its own.';

-- Claiming a code must actually invalidate it. Widen the status check so
-- join-family can write 'claimed' distinctly from the generic 'accepted'
-- state used elsewhere (family_invites.status already allowed 'accepted',
-- reused here for the code-claim outcome instead of adding a 4th status
-- value with overlapping meaning).
comment on column public.family_invites.status is
  'pending = live/redeemable; accepted = claimed (per-invitee code path — the code is now dead, no further redemptions); expired = past expiry or explicitly revoked.';

comment on column public.family_invites.member_id is
  'The pre-created member row this code is scoped to. Per-invitee invite system (see 20260924050000): every new code minted by generate-invite-code is scoped to one specific, already-existing member row — redeeming it claims that row (sets auth_user_id, flips invite_status to active) rather than creating a new one. NULL only on codes minted before this migration (legacy family-wide codes, which join-family still honors as a fallback until they expire).';

-- One row per member scoped this way — a member shouldn't have two
-- simultaneously-live codes outstanding (mirrors the old "one active code
-- per family" invariant generate-invite-code enforced, just re-scoped to
-- member_id instead of family_id).
create unique index if not exists idx_family_invites_member_pending
  on public.family_invites (member_id)
  where status = 'pending' and member_id is not null;

-- Fast lookup for Profile's pending-invitee list ("who's pending, what's
-- their latest code status").
create index if not exists idx_family_invites_member_id
  on public.family_invites (member_id)
  where member_id is not null;
