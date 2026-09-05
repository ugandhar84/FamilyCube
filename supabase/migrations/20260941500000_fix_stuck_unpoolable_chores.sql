-- Live-reported permanent dead-end bug: choreStore.ts's addParentQuest
-- cleared a chore's assigned_to_id for delegation but left is_pool at
-- whatever it was before (false, for a chore directly assigned at
-- creation) — once the fresh delegation's own parent_quest_assignments
-- row resolved to a terminal status (e.g. claim_pool_quest failing and
-- rolling the assignment back to COMPLETED), the chore fell back to
-- looking like a bare, claimable pool card (assigned_to_id is null) that
-- could NEVER actually be claimed, since claim_pool_quest's own
-- server-side check requires is_pool = true. Every tap produced "Someone
-- else already took that," forever, with no way for the user to recover
-- short of a direct DB fix.
--
-- This is the exact broken combination: no assignee, but is_pool still
-- false, on a chore that isn't in a terminal status already (a genuinely
-- done/declined/expired chore should stay however it landed). Setting
-- is_pool = true makes these chores actually claimable/delegatable again,
-- matching the code fix (same migration session) that now sets isPool:
-- true at the moment assigned_to_id gets cleared for delegation, so this
-- combination won't recur going forward.
update public.chore_tasks
set is_pool = true
where assigned_to_id is null
  and coalesce(is_pool, false) = false
  and status not in ('approved', 'auto_approved', 'completed', 'declined', 'expired');
