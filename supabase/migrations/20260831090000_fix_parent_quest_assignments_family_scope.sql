-- Coordinated live-DB QA (Round 22, High/Critical) found
-- parent_quest_assignments' only RLS policy checked nothing but "does
-- this chore_id reference SOME row in chore_tasks" — no family scoping at
-- all, since the table has no family_id column of its own and the policy
-- never joined through one. Confirmed live: a raw insert assigning a
-- parent_only_quest to a member of an entirely different family succeeded
-- with zero rejection. Any authenticated member of any family could read
-- or write any other family's parent-to-parent delegation rows. A
-- misleading in-code comment (store/choreStore.ts) claimed this was
-- already scoped via the chore_tasks join — it was not.
--
-- Fixed by joining through chore_tasks.family_id, the same pattern
-- chore_tasks' own "family write"/"family read" policies already use via
-- current_user_family_id(). Adult-only role enforcement (parent vs kid)
-- remains client-side only for now — a separate, lower-severity finding
-- (also confirmed exploitable via raw insert) left as a documented
-- follow-up rather than folded into this urgent family-isolation fix.
drop policy if exists "family members can manage assignments" on public.parent_quest_assignments;

create policy "parent_quest_assignments family scoped"
on public.parent_quest_assignments
for all
using (
  exists (
    select 1 from public.chore_tasks ct
    where ct.id = parent_quest_assignments.chore_id
      and ct.family_id = (current_user_family_id())::text
  )
)
with check (
  exists (
    select 1 from public.chore_tasks ct
    where ct.id = parent_quest_assignments.chore_id
      and ct.family_id = (current_user_family_id())::text
  )
);
