-- Household members today all share ONE Supabase Auth session per device —
-- a parent signs up for real, and every kid/teen/grandparent PIN-profile
-- added afterward just gets auth_user_id stamped as a copy of whatever
-- auth.uid() happened to be live at creation time. This adds a second,
-- genuinely independent way to become a member: an email invite that the
-- invitee accepts with their OWN real Supabase Auth login. (The existing
-- 6-digit family_invites code path is being changed, client-side only, to
-- call signInAnonymously() on the joining device instead of riding on the
-- inviter's session — no schema change needed for that half.)
--
-- auth_user_id was never asserted unique on members (see
-- 20260818192700_fix_member_auth_identity.sql's own reasoning) — every RLS
-- policy in this app is scoped by family_id, not by how many members share
-- one auth session, so this is additive and doesn't require touching any
-- existing RLS function.

alter table public.members
  add column if not exists email text,
  add column if not exists invite_status text not null default 'active'
    check (invite_status = any (array['active'::text, 'invited'::text]));

-- Scoped per-family, not global — the same person can legitimately belong
-- to two households (e.g. a grandparent invited into two of their
-- children's families).
create unique index if not exists idx_members_family_email_unique
  on public.members (family_id, lower(email))
  where email is not null;

-- New invitation table, modeled on family_invitations' (pet-care invite
-- system) proven token+email+expiry shape, but scoped to members/families
-- instead of pets — that table is not part of this live household schema
-- and is not reused here.
create table public.member_invitations (
  id           uuid not null default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  token        uuid not null default gen_random_uuid(),
  email        text not null,
  role         text not null check (role = any (array['parent'::text, 'child'::text, 'teenager'::text, 'grandparent'::text])),
  invited_by   uuid not null references auth.users(id),
  status       text not null default 'pending' check (status = any (array['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])),
  member_id    text references public.members(id) on delete set null,
  accepted_by  uuid references auth.users(id),
  accepted_at  timestamptz,
  message      text,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now(),
  constraint member_invitations_pkey primary key (id),
  constraint member_invitations_token_key unique (token)
);

create index idx_member_invitations_family_id on public.member_invitations (family_id);
create index idx_member_invitations_email on public.member_invitations (lower(email));
-- DB-level duplicate-invite guard, mirrors the app-layer check the edge
-- function also performs.
create unique index idx_member_invitations_family_email_pending
  on public.member_invitations (family_id, lower(email))
  where status = 'pending';

alter table public.member_invitations enable row level security;

-- Parents can list their own family's invitations.
create policy "member_invitations parent select"
  on public.member_invitations for select
  to authenticated
  using (
    family_id = public.current_user_family_id()
    and exists (select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent')
  );

-- Any authenticated user can read ONE invitation by its own token/id — the
-- accept screen needs this before the accepting user is a member of the
-- family at all. Same exposure class as family_invites' code readability
-- elsewhere in this app: a caller would need to already know/guess a
-- specific row's id/token to retrieve it this way, not enumerate by listing
-- (PostgREST still requires an explicit .eq() filter to return anything
-- useful from a USING(true) policy in practice).
create policy "member_invitations token select"
  on public.member_invitations for select
  to authenticated
  using (true);

-- Parents can revoke their own family's pending invitations — only allowed
-- to transition INTO revoked/expired, never back to pending/accepted.
create policy "member_invitations parent revoke"
  on public.member_invitations for update
  to authenticated
  using (
    family_id = public.current_user_family_id()
    and exists (select 1 from public.members m
      where m.id = public.resolve_active_member_id() and m.role = 'parent')
  )
  with check (status in ('revoked', 'expired'));

-- No INSERT policy for `authenticated` — every invite is created by the
-- send-member-invite edge function (service role), same convention
-- generate-invite-code/join-family already use for membership writes. This
-- keeps the duplicate-check, family-membership-check, and email-send atomic
-- server-side rather than trusting a client-only insert path.

comment on table public.member_invitations is
  'Email-based household member invitations — accepting one gives the invitee their own real Supabase Auth login (members.auth_user_id = their own auth.uid()), distinct from the existing 6-digit family_invites code path.';
comment on column public.members.email is
  'Set once a member has independent auth (real signup via member_invitations, or anonymous auth via the invite-code join) — null for a locally-added PIN-only profile riding on another member''s session.';
