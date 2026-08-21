-- Atomic slot claim for multi-claimant bounties — the (chore_id, member_id)
-- unique constraint on bounty_claims alone only stops the SAME kid
-- double-claiming; it does nothing to stop N+1 different kids all claiming
-- when max_claimants is N (each insert is a distinct row, so no constraint
-- conflict). A plain client-side count-then-insert has the identical race
-- every other CAS claim in this codebase (claimPoolQuest, claimBounty,
-- claimHelperSlot) was specifically built to avoid — two kids' claims both
-- reading "2 of 3 slots taken" before either insert lands. A single
-- transactional function is the only way to make the count-check-and-insert
-- genuinely atomic.
create or replace function public.claim_bounty_slot(p_chore_id text, p_member_id text)
returns table (claimed boolean, claim_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_current integer;
  v_new_id uuid;
begin
  select max_claimants into v_max from chore_tasks where id = p_chore_id for update;
  if v_max is null then
    return query select false, null::uuid;
    return;
  end if;

  select count(*) into v_current from bounty_claims
    where chore_id = p_chore_id and status != 'declined';

  if v_current >= v_max then
    return query select false, null::uuid;
    return;
  end if;

  insert into bounty_claims (chore_id, member_id, status)
    values (p_chore_id, p_member_id, 'in_progress')
    on conflict (chore_id, member_id) do nothing
    returning id into v_new_id;

  if v_new_id is null then
    return query select false, null::uuid; -- already claimed by this member
    return;
  end if;

  return query select true, v_new_id;
end;
$$;

comment on function public.claim_bounty_slot(text, text) is
  'Atomically claims one slot on a multi-claimant bounty. Row-locks the chore_tasks row (FOR UPDATE) for the duration of the count-check-and-insert so two concurrent claims cannot both pass the count check before either insert lands. Returns claimed=false if the bounty is full or this member already has a claim.';
