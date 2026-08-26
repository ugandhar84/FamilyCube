-- Master-flow audit finding: bounty_claims' RLS policy was `for all`,
-- scoped only by family_id — no role check at all. The client's own
-- canApprove() (choreStore.ts) correctly refuses to let anyone but a
-- parent (or an active temporary-approver grant) approve/decline a kid's
-- claim, but that check runs entirely in the requesting device's own JS —
-- it's a UX courtesy, not a security boundary. Any family member's valid
-- session — a grandparent's, or even a kid's — could write
-- status:'approved' directly to bounty_claims via a raw PostgREST call
-- and trigger a real coin payout, completely bypassing the app UI.
--
-- Fix: a shared is_approver() helper (same shape/reasoning as
-- canApprove() — parent role, OR an active non-revoked non-expired
-- temporary_approvers grant to THIS resolved member) that RLS enforces
-- on writes to SOMEONE ELSE'S claim. A kid's own self-service actions on
-- their OWN claim (submitBountyClaim moving in_progress→pending_approval,
-- withdrawBountyClaim deleting their own still-in-progress row) must stay
-- unrestricted — those aren't approval decisions, they're the kid working
-- their own slot. Only a write that targets a DIFFERENT member's claim
-- (approve/decline) needs approval authority.
create or replace function public.is_approver()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_member_id text;
  v_role text;
begin
  v_member_id := public.resolve_active_member_id();
  if v_member_id is null then
    return false;
  end if;

  select role into v_role from public.members where id = v_member_id;
  if v_role = 'parent' then
    return true;
  end if;

  return exists (
    select 1 from public.temporary_approvers
    where granted_to_member_id = v_member_id
      and revoked_at is null
      and expires_at > now()
  );
end;
$$;

comment on function public.is_approver is
  'True if the resolved active member is a parent, or holds an active (non-revoked, unexpired) temporary_approvers grant. Server-side equivalent of choreStore.ts''s canApprove() — the real authorization boundary for approving/declining someone ELSE''s bounty claim, not just a client-side UX check.';

revoke all on function public.is_approver() from public;
grant execute on function public.is_approver() to authenticated;

drop policy if exists "bounty_claims family access" on public.bounty_claims;

create policy "bounty_claims_select"
  on public.bounty_claims for select
  using (
    chore_id in (
      select ct.id from public.chore_tasks ct
      where ct.family_id = (current_user_family_id())::text
    )
  );

-- A kid claiming an open slot is self-service, not an approval decision —
-- family-wide, same as before.
create policy "bounty_claims_insert"
  on public.bounty_claims for insert
  with check (
    chore_id in (
      select ct.id from public.chore_tasks ct
      where ct.family_id = (current_user_family_id())::text
    )
  );

-- Split: a member updating THEIR OWN claim (submit, or any future
-- self-service transition) is always allowed within the family — that's
-- the kid working their own slot, not an approval. Updating a DIFFERENT
-- member's claim (approve/decline someone else's submission) requires
-- is_approver(). This is the actual fix — the old policy let anyone in
-- the family flip ANY claim's status, including someone else's.
create policy "bounty_claims_update"
  on public.bounty_claims for update
  using (
    chore_id in (
      select ct.id from public.chore_tasks ct
      where ct.family_id = (current_user_family_id())::text
    )
    and (member_id = public.resolve_active_member_id() or public.is_approver())
  )
  with check (
    chore_id in (
      select ct.id from public.chore_tasks ct
      where ct.family_id = (current_user_family_id())::text
    )
    and (member_id = public.resolve_active_member_id() or public.is_approver())
  );

-- Delete: a kid withdrawing their own still-in-progress claim
-- (withdrawBountyClaim) is self-service; nothing in the app deletes
-- someone ELSE'S claim, but keep the approver escape hatch for parity
-- with update rather than locking delete to self-only in a way that
-- could surprise a future admin/cleanup path.
create policy "bounty_claims_delete"
  on public.bounty_claims for delete
  using (
    chore_id in (
      select ct.id from public.chore_tasks ct
      where ct.family_id = (current_user_family_id())::text
    )
    and (member_id = public.resolve_active_member_id() or public.is_approver())
  );
