-- Live-DB QA audit (Kid-role agent) found chore approval had ZERO server-side
-- authorization: canApprove() in store/choreStore.ts is a purely client-side
-- check, and the existing "chore_tasks family write" RLS policy only
-- verifies family membership, not role. A kid (or anyone calling the
-- Supabase client directly, bypassing the app UI) could set their own
-- submitted chore straight to 'approved'/'auto_approved' — the same status
-- approveChore's real payout side-effect (awardPoints) keys off — and
-- effectively pay themselves for their own work with no parent review.
--
-- A blanket "only parents may write chore_tasks" policy would be too broad:
-- several legitimate flows have a NON-parent (a grandparent completing their
-- own invite_grandparents errand via submitGPErrandReceipt, or a parent
-- self-assigning and auto-completing their own task) transition a row
-- straight to 'approved'/'auto_approved' themselves, by design, without a
-- separate parent review step. The actual exploit this closes is narrower:
-- a child/teenager approving THEIR OWN submitted work. A trigger (not a
-- static RLS qual, which can't easily see old-vs-new the way a trigger can)
-- blocks exactly that case: the row's assigned_to_id belongs to the
-- authenticated caller AND that caller's role is child/teenager AND the
-- new status is approved/auto_approved.

create or replace function public.block_child_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id text;
  caller_role text;
begin
  -- Only care about transitions INTO an approved/paid terminal status.
  if new.status not in ('approved', 'auto_approved') then
    return new;
  end if;
  -- Already in that status (e.g. an unrelated field update on an
  -- already-approved row) — not a new approval, nothing to block.
  if old.status in ('approved', 'auto_approved') then
    return new;
  end if;

  select m.id, m.role into caller_id, caller_role
  from public.members m
  where m.auth_user_id = auth.uid()
  limit 1;

  if caller_role in ('child', 'teenager') and caller_id = new.assigned_to_id then
    raise exception 'A child/teenager cannot approve their own chore — requires a parent or an active temporary-approver grant.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists block_child_self_approval_trigger on public.chore_tasks;
create trigger block_child_self_approval_trigger
  before update on public.chore_tasks
  for each row
  execute function public.block_child_self_approval();

comment on function public.block_child_self_approval() is
  'Server-side backstop for the chore approval authorization gate (canApprove in store/choreStore.ts) that was previously enforced client-side only. Blocks a child/teenager from transitioning their own assigned chore to approved/auto_approved directly.';
