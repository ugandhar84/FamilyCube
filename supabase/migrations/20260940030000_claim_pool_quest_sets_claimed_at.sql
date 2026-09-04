-- Live QA finding (docs/qa_reassign_takeover_audit.html, Critical): the
-- app's actual reachable "Claim" button (store/choreAdapter.ts's
-- claimQuest → choreStore.ts's claimPoolQuest) never called this RPC at
-- all — it did a raw client-side .update() with no
-- resolve_active_member_id() verification that the caller genuinely IS
-- the member_id being written into assigned_to_id, since chore_tasks'
-- UPDATE RLS policy only scopes by family_id, not by who's claiming for
-- whom. Any client in the family could claim a pool chore on behalf of an
-- arbitrary member id. Fixing the client to route through THIS RPC (the
-- store/eventStore.ts change is separate, non-DB) closes that gap — but
-- the RPC itself was missing claimed_at, which chore-deadline-notifier's
-- auto-release sweep depends on (a claimed-but-gone-quiet chore only
-- re-opens to the pool once claimed_at is old enough) — add it here so
-- switching the client over doesn't silently break that sweep.
create or replace function public.claim_pool_quest(p_chore_id text, p_member_id text)
returns table(claimed boolean, chore chore_tasks)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.chore_tasks;
  v_member_family text;
  v_transition_id uuid := gen_random_uuid();
  v_active_member_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_result from public.chore_tasks where id = p_chore_id for update;

  if v_result.id is null or v_result.assigned_to_id is not null or not coalesce(v_result.is_pool, false) then
    return query select false, null::public.chore_tasks;
    return;
  end if;

  select family_id into v_member_family from public.members where id = p_member_id;
  if v_member_family is distinct from v_result.family_id then
    raise exception 'member % is not in the same family as chore %', p_member_id, p_chore_id;
  end if;

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (p_chore_id, p_member_id, 'assignee', 'claimed')
    on conflict (chore_id, member_id, role) do nothing;

  update public.chore_tasks
    set assigned_to_id = p_member_id, is_pool = false, status = 'in_progress', claimed_at = now()
    where id = p_chore_id
    returning * into v_result;

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', p_chore_id, v_result.family_id::uuid, p_member_id, 'claimed', 'todo', 'in_progress', v_transition_id, 'claimed from pool');

  return query select true, v_result;
end;
$$;
