-- Device recovery codes: lets a parent generate a short-lived, PIN-gated
-- code that lets an ALREADY-ACTIVE member (one who already has an
-- auth_user_id — typically a kid or email-less senior whose original
-- device was lost/wiped) get a working session on a new device, without
-- ever creating a new auth.users row.
--
-- Deliberately a separate table from family_invites: that table is scoped
-- to claiming a still-PENDING member row (a first-time join), and
-- join-family's own claim guard permanently blocks re-stamping an already-
-- ACTIVE member's auth_user_id — by design, to stop a genuine double-claim
-- race. This table's whole purpose is the opposite case: the member is
-- already active, and recover-device (a new edge function) re-authenticates
-- the new device as that member's EXISTING auth_user_id (via
-- admin.generateLink + verifyOtp — validated end-to-end against a live
-- throwaway anonymous user before this migration was written) rather than
-- ever touching members.auth_user_id at all.
create table if not exists public.device_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id text not null references public.members(id) on delete cascade,
  code text not null,
  status text not null default 'pending', -- pending | used | expired | revoked
  created_by uuid not null references auth.users(id), -- the auth.users id of the calling PARENT, not members.id (same gotcha generate-invite-code's created_by hit)
  used_at timestamptz,
  -- Much shorter TTL than family_invites' 7 days: this re-authenticates an
  -- already-established identity on demand, not a first-time invite sitting
  -- in someone's inbox for a week — an hour is plenty for "parent generates
  -- it, hands the phone to the kid, kid types it in right now."
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now()
);

-- One live code per member at a time — regenerating replaces it, mirroring
-- family_invites' idx_family_invites_member_pending pattern.
create unique index if not exists idx_device_recovery_member_pending
  on public.device_recovery_codes(member_id) where status = 'pending';
create index if not exists idx_device_recovery_family_id
  on public.device_recovery_codes(family_id);

alter table public.device_recovery_codes enable row level security;

-- Same shape as family_invites' RLS: authenticated + family-scoped only.
-- No anonymous/unauthenticated access at all — a brand-new/wiped device
-- redeeming a code has no session yet, so redemption always goes through
-- the recover-device edge function on the service-role key, exactly like
-- join-family does for family_invites (see that function's own comment on
-- why RLS deliberately can't cover an unauthenticated redemption).
drop policy if exists "device_recovery_codes family select" on public.device_recovery_codes;
drop policy if exists "device_recovery_codes family insert" on public.device_recovery_codes;
drop policy if exists "device_recovery_codes family update" on public.device_recovery_codes;

create policy "device_recovery_codes family select" on public.device_recovery_codes for select
  to authenticated
  using (family_id = public.current_user_family_id());
create policy "device_recovery_codes family insert" on public.device_recovery_codes for insert
  to authenticated
  with check (created_by = auth.uid() and family_id = public.current_user_family_id());
create policy "device_recovery_codes family update" on public.device_recovery_codes for update
  to authenticated
  using (family_id = public.current_user_family_id())
  with check (family_id = public.current_user_family_id());

comment on table public.device_recovery_codes is
  'Parent-generated, PIN-gated codes that re-authenticate a new/wiped device as an ALREADY-ACTIVE member''s existing auth_user_id (never creates a new auth.users row). Distinct from family_invites, which is for first-time claims of a still-pending member.';
