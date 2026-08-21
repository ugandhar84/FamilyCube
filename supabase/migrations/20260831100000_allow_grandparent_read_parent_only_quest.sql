-- Coordinated live-DB QA (Round 22, Medium) found chore_tasks' own
-- parent_only_quest read exception only allowed role='parent', but
-- addParentQuest's code comments (store/choreStore.ts) explicitly
-- document grandparents as valid assignees/assigners of parent_only_quest
-- delegations too, and the client-side sync filter already allows
-- role==='senior' through. A grandparent given a direct parent-to-GP
-- delegation would have the row silently filtered out by RLS despite the
-- client believing it should be visible — a client/server contract
-- mismatch. Widen the same exception to include grandparent.
drop policy if exists "chore_tasks family read" on public.chore_tasks;

create policy "chore_tasks family read"
on public.chore_tasks
for select
using (
  family_id = (current_user_family_id())::text
  and (
    category_type is distinct from 'parent_only_quest'
    or exists (
      select 1 from public.members
      where members.auth_user_id = auth.uid()
        and members.role in ('parent', 'grandparent')
        and (members.family_id)::text = chore_tasks.family_id
    )
  )
);
