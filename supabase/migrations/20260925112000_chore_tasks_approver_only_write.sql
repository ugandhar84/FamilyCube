-- Master-flow audit finding, same class as bounty_claims (see
-- 20260925111000_bounty_claims_approver_only_write.sql, the template this
-- migration follows): chore_tasks' "chore_tasks family write" policy
-- (20260815000012_fix_chore_tasks_rls.sql) is `for all`, scoped only by
-- family membership — no role check at all. The client's own canApprove()
-- (store/choreStore.ts) correctly refuses to let anyone but a parent (or an
-- active temporary-approver grant) approve a chore, but that check runs
-- entirely client-side. Confirmed live in this codebase: approveChore,
-- requestRedo, adjustTeenReward/declineTeenReward, the dispute-reversal
-- flow, and grandparentApproveAndCheer all write chore_tasks directly via
-- a raw `supabase.from('chore_tasks').update(...)` (choreStore.ts's
-- updateChore -> dbUpdate helper) — NOT through the approve_chore/
-- request_redo RPCs that already exist with server-side auth checks
-- (approve_chore in particular is dead code, never called from the
-- client). Any family member's valid session — a grandparent's, a kid's,
-- a teenager's — could write status:'approved' directly to chore_tasks
-- via a raw PostgREST call and trigger a real coin payout via the DB
-- trigger/notification paths that key off that status, completely
-- bypassing the app UI's canApprove() gate.
--
-- 20260824010000_block_kid_self_approval.sql already added a trigger that
-- blocks the single narrowest case (a child/teenager approving their OWN
-- assigned chore) — that trigger is untouched by this migration and stays
-- as defense-in-depth. It does nothing for the much bigger hole: anyone
-- approving/declining/redo-requesting someone ELSE's chore, or a
-- grandparent/adult self-approving via a raw call the trigger doesn't
-- cover (trigger only fires on child/teenager roles).
--
-- Fix, mirroring bounty_claims' shape: chore_tasks has FAR more legitimate
-- non-parent self-service write paths than bounty_claims did (a kid
-- submitting/claiming their own work goes through submit_chore/
-- claim_pool_quest RPCs which are SECURITY DEFINER and bypass RLS
-- entirely — untouched by this policy either way; a grandparent
-- auto-completing their own invite-grandparents errand, a parent
-- self-assigning and auto-completing their own task, a kid/GP declining
-- or releasing their own assignment back to the pool, claiming an
-- unclaimed pool/bounty chore). None of those are "someone else's
-- approval decision" — they're a member's own row. The actual rule that
-- matches canApprove()'s real authorization boundary: a WRITE that moves
-- status INTO an approval/payout-adjacent terminal state (approved,
-- auto_approved, completed, declined, redo_requested) on a chore that
-- ISN'T assigned to the caller requires is_approver(). A member's own
-- self-service transitions on their OWN row (claiming, submitting via
-- RPC, declining/releasing their own assignment, self-completing their
-- own errand/delegated task) are unaffected — those aren't reviewing
-- someone else's work, they're the member working (or backing out of)
-- their own slot, same reasoning bounty_claims_update used for a kid's
-- own claim.
--
-- One extra wrinkle chore_tasks has that bounty_claims didn't:
-- grandparent_quest's pending_grandparent_approval -> completed step
-- (grandparentApproveAndCheer) is approved by the QUEST'S SPONSOR — the
-- grandparent who created/funded it (chore_tasks.sponsor_user_id) — not
-- necessarily a parent. A grandparent's real DB role is 'grandparent', so
-- is_approver() (parent role, or an active temporary_approvers grant)
-- would wrongly block a GP verifying and paying for their own sponsored
-- quest. ParentView.tsx also calls the same action for a parent reviewing
-- it, so both is_approver() and "caller is this row's sponsor" must be
-- allowed.

alter table public.chore_tasks enable row level security;

-- ── SELECT — unchanged from 20260815000012, re-created identically since
-- this must be a new migration file, not an edit to an already-applied one.
drop policy if exists "chore_tasks family read" on public.chore_tasks;

create policy "chore_tasks family read"
  on public.chore_tasks for select
  using (
    family_id in (
      select family_id::text from public.family_members where owner_id = auth.uid()
    )
    and (
      category_type is distinct from 'parent_only_quest'
      or exists (
        select 1 from public.family_members
        where owner_id = auth.uid()
          and role = 'parent'
          and family_id::text = chore_tasks.family_id
      )
    )
  );

-- Replace the old blanket "chore_tasks family write" (for all, family-only)
-- with operation-specific policies.
drop policy if exists "chore_tasks family write" on public.chore_tasks;

-- INSERT — creating a chore/proposal is not an approval decision (matches
-- bounty_claims_insert's reasoning). Plenty of non-parents legitimately
-- create rows this way: addChore (any member with quest-creation UI),
-- createGrandparentQuest (a GP sponsoring a quest), the team-clone rows
-- approveGrandparentQuestAsParent writes for 2+ targeted kids,
-- createAndAddParentQuest. Kid-proposed chores go through the
-- propose_kid_chore RPC (SECURITY DEFINER, bypasses RLS) instead of a raw
-- insert, so they're unaffected by this policy either way. Stay
-- family-scoped only.
create policy "chore_tasks_insert"
  on public.chore_tasks for insert
  with check (
    family_id in (
      select family_id::text from public.family_members where owner_id = auth.uid()
    )
  );

-- UPDATE — the actual fix. A write that leaves status alone, or moves it
-- to a non-terminal/non-approval status (todo, in_progress,
-- pending_approval, pending_grandparent_approval, pending_parent_approval,
-- pending_kid_proposal, gp_offer_pending, terms_changed,
-- kid_disputed_redo, etc.), is always allowed within the family — that
-- covers claiming an open pool/bounty chore (assigned_to_id was null),
-- declining/releasing your own assignment back to the pool, GP offer
-- accept/decline/withdraw, terms-change proposals, and every other
-- non-payout status shuffle. A write that moves status INTO an
-- approval/payout-adjacent terminal state (approved, auto_approved,
-- completed, declined, redo_requested) requires EITHER that the row is
-- (or was) assigned to the caller themselves (their own self-service
-- completion — e.g. a GP's no-receipt errand auto-complete, a parent
-- self-assigning and auto-completing, a delegate completing their own
-- parent-quest chore, a kid/GP declining their own assignment), OR that
-- the caller is this row's grandparent_quest sponsor (verifying/paying
-- for their own sponsored quest), OR is_approver() (parent role, or an
-- active temporary-approver grant) — the real authorization boundary for
-- approving/declining/redo-requesting someone ELSE's submitted work.
--
-- Checking OLD.assigned_to_id (via USING, evaluated against the
-- pre-update row) rather than only NEW.assigned_to_id matters here: a kid
-- declining their own assignment clears assigned_to_id to null in the
-- same write that sets status='declined' — gating on the post-write value
-- alone would incorrectly require is_approver() for that self-service
-- decline. WITH CHECK re-checks the same condition against the resulting
-- row so a non-approver can't smuggle in a change that reassigns AND
-- terminal-statuses a chore to/from someone else in one write.
create policy "chore_tasks_update"
  on public.chore_tasks for update
  using (
    family_id in (
      select family_id::text from public.family_members where owner_id = auth.uid()
    )
    and (
      status not in ('approved', 'auto_approved', 'completed', 'declined', 'redo_requested')
      or assigned_to_id = public.resolve_active_member_id()
      or sponsor_user_id = public.resolve_active_member_id()
      or public.is_approver()
    )
  )
  with check (
    family_id in (
      select family_id::text from public.family_members where owner_id = auth.uid()
    )
    and (
      status not in ('approved', 'auto_approved', 'completed', 'declined', 'redo_requested')
      or assigned_to_id = public.resolve_active_member_id()
      or sponsor_user_id = public.resolve_active_member_id()
      or public.is_approver()
    )
  );

-- DELETE — nothing in the client deletes someone else's chore; the two
-- reachable delete call sites are a GP canceling their own
-- pending-sponsor quest (AwaitingParentCard) and a parent canceling a
-- pool quest (PoolQuestCard, typically one they created). Scope to the
-- creator/sponsor/assignee deleting their own chore, with the approver
-- escape hatch for parity with chore_tasks_update rather than locking
-- delete to self-only in a way that could surprise a future admin/cleanup
-- path.
create policy "chore_tasks_delete"
  on public.chore_tasks for delete
  using (
    family_id in (
      select family_id::text from public.family_members where owner_id = auth.uid()
    )
    and (
      created_by_id = public.resolve_active_member_id()
      or sponsor_user_id = public.resolve_active_member_id()
      or assigned_to_id = public.resolve_active_member_id()
      or public.is_approver()
    )
  );
