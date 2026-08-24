-- CRITICAL BUG FOUND VIA REAL DB TESTING (not caught by code review) —
-- propose_kid_chore has never actually worked for a single real kid since
-- it was deployed. The RPC checked `v_proposer_role is distinct from
-- 'kid'`, but the members.role column stores raw DB values ('child',
-- 'teenager', 'parent', 'grandparent') — the 'kid'/'teen'/'senior' names
-- only exist as a CLIENT-SIDE mapping (store/familyStore.ts's fromRow:
-- role === 'child' ? 'kid' : role === 'grandparent' ? 'senior' : role ===
-- 'teenager' ? 'teen' : role). A real kid's role is literally never the
-- string 'kid' in this column, so `is distinct from 'kid'` was true for
-- every single real member, and every propose_kid_chore call failed with
-- "member % is not a kid" — confirmed live: qa20-kid-1 (role='child')
-- rejected outright.
--
-- Same bug, second instance, same function: `v_for_role in ('parent',
-- 'senior')` was meant to block a kid from proposing a chore FOR a
-- parent/grandparent, but a grandparent's real DB role is 'grandparent',
-- not 'senior' — so this check would have silently ALLOWED a kid to
-- target a grandparent (only 'parent' was ever actually blocked). Not
-- caught because 'parent' happens to be spelled the same in both layers,
-- masking that 'senior'/'kid'/'teen' are not.

create or replace function public.propose_kid_chore(
  p_family_id uuid, p_proposer_id text, p_for_member_id text,
  p_title text, p_description text default null, p_category text default 'other'
)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposer_role text;
  v_for_role text;
  v_chore public.chore_tasks;
  v_id text := 'chore_' || replace(gen_random_uuid()::text, '-', '');
  v_transition_id uuid := gen_random_uuid();
begin
  select role into v_proposer_role from public.members where id = p_proposer_id;
  if v_proposer_role is distinct from 'child' then
    raise exception 'member % is not a kid — only a kid can propose a chore this way', p_proposer_id;
  end if;

  select role into v_for_role from public.members where id = p_for_member_id;
  if v_for_role is null then
    raise exception 'target member % not found', p_for_member_id;
  end if;
  if v_for_role in ('parent', 'grandparent') then
    raise exception 'a kid cannot propose a chore for a parent/grandparent (member % is %)', p_for_member_id, v_for_role;
  end if;

  insert into public.chore_tasks (
    id, family_id, title, description, category_type, category,
    base_points, coins_reward, bonus_coins, xp_reward,
    status, is_pool, assigned_to_id, created_by_id, created_at
  ) values (
    v_id, p_family_id, p_title, p_description, 'general', p_category,
    0, 0, 0, 0,
    'pending_kid_proposal', false, p_for_member_id, p_proposer_id, now()
  )
  returning * into v_chore;

  insert into public.chore_participants (chore_id, member_id, role, status)
    values (v_id, p_proposer_id, 'requester', null);
  insert into public.chore_participants (chore_id, member_id, role, status)
    values (v_id, p_for_member_id, 'assignee', 'pending');

  insert into public.activity_log (entity_type, entity_id, family_id, actor_id, action, from_status, to_status, transition_id, note)
    values ('chore', v_id, p_family_id, p_proposer_id, 'created', null, 'pending_kid_proposal', v_transition_id,
      format('proposed by a kid, for member %s', p_for_member_id));

  return v_chore;
end;
$$;
