-- FamilyNeedsHandSection.tsx's "I'll Handle It" self-claim of a plain
-- household chore a parent flagged open_to_gp — deliberately distinct from
-- claim_pool_quest (which requires is_pool=true) and from GP-sponsored
-- quests (invite_grandparents/categoryType='grandparent_quest'). A
-- GP-welcome chore is a regular todo chore made GP-visible via open_to_gp
-- alone, with no is_pool involvement — the last remaining raw write from
-- the original audit's raw-write list, previously a single unconditional
-- updateChore call with no CAS (two GPs tapping "I'll Handle It" on the
-- same open_to_gp chore simultaneously could both succeed, last-writer-wins).
create or replace function public.claim_gp_welcome_chore(p_chore_id text, p_gp_member_id text)
returns table (claimed boolean, chore public.chore_tasks)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
  v_transition_id uuid := gen_random_uuid();
begin
  select * into v_result from public.chore_tasks where id = p_chore_id for update;

  if v_result.id is null or not coalesce(v_result.open_to_gp, false)
     or v_result.status != 'todo' or v_result.assigned_to_id is not null then
    return query select false, null::public.chore_tasks;
    return;
  end if;

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_gp_member_id, 'assignee', 'claimed')
    on conflict (chore_id, member_id, role) do nothing;

  update public.chore_tasks
    set assigned_to_id = p_gp_member_id, status = 'in_progress', is_pool = false
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_gp_member_id, 'claimed', 'todo', 'in_progress', v_transition_id, 'grandparent handling GP-welcome chore');

  return query select true, v_result;
end;
$$;

comment on function public.claim_gp_welcome_chore(text, text) is 'Grandparent self-claims a plain household chore flagged open_to_gp (not a pool item, not a GP-sponsored quest) — atomic version of FamilyNeedsHandSection.tsx''s "I''ll Handle It", the last raw-write action from the original assignment-drift audit.';
