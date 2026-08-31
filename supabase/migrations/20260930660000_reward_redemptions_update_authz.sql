-- Real gap found by a deep exploratory QA trace of Coins & Rewards — the
-- 11th instance of the "write-side RLS checks only family_id, no
-- per-actor check" pattern found this session. reward_redemptions'
-- UPDATE policy checked only that the redemption belonged to some member
-- of the caller's family — not that the caller was a parent, and not
-- that the caller even owned the redemption. Any family member's session
-- could self-approve their own requiresApproval:true reward (completely
-- defeating the approval flag), or approve/decline a SIBLING's redemption
-- outright.
--
-- Legitimate write paths, confirmed by reading every call site:
--   - approveRedemption/rejectRedemption: parent-gated in the UI, sets
--     status to 'approved'/'declined' on ANY redemption in the family.
--   - cancelRedemption: any member self-cancelling their OWN pending
--     redemption, also writes status='declined'.
-- Fix: a parent can update any redemption in the family; a non-parent can
-- only update their OWN redemption, and only while it's still pending
-- (matching cancelRedemption's actual use — self-cancelling something
-- already resolved makes no sense and isn't something the app does).
drop policy if exists "reward_redemptions family update" on public.reward_redemptions;
create policy "reward_redemptions family update" on public.reward_redemptions
for update
using (
  member_id in (select members.id from public.members where members.family_id = current_user_family_id())
  and (
    exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
    or (member_id = resolve_active_member_id() and status = 'pending')
  )
)
with check (
  member_id in (select members.id from public.members where members.family_id = current_user_family_id())
  and (
    exists (
      select 1 from public.members
      where members.id = resolve_active_member_id() and members.role = 'parent'
    )
    or member_id = resolve_active_member_id()
  )
);
