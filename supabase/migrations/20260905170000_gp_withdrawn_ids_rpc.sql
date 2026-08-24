-- gp_withdrawn_ids (a GP's "no guilt" pass on a GP-welcome invite) was
-- independently read-modify-written inline in TWO components
-- (QuestCard.tsx and QuestInvitationsSection.tsx), each doing its own
-- client-side array filter/append with no lock — two GPs passing/
-- reconsidering near-simultaneously on the same chore could race, with the
-- second write's stale array silently dropping the first GP's change. One
-- atomic RPC replaces both inline copies.
create or replace function public.set_gp_withdrawn(p_chore_id text, p_gp_member_id text, p_withdrawn boolean)
returns public.chore_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.chore_tasks;
begin
  if p_withdrawn then
    update public.chore_tasks
      set gp_withdrawn_ids = (
        select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
          select jsonb_array_elements_text(coalesce(gp_withdrawn_ids, '[]'::jsonb)) as x
          union select p_gp_member_id
        ) s
      )
      where id = p_chore_id
      returning * into v_result;
  else
    update public.chore_tasks
      set gp_withdrawn_ids = (
        select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_array_elements_text(coalesce(gp_withdrawn_ids, '[]'::jsonb)) as x
        ) s where x != p_gp_member_id
      )
      where id = p_chore_id
      returning * into v_result;
  end if;

  if v_result.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  return v_result;
end;
$$;

comment on function public.set_gp_withdrawn(text, text, boolean) is 'Atomically adds/removes a grandparent from a chore''s gp_withdrawn_ids ("no guilt" pass list) — row-locked via the UPDATE itself, replacing two independent non-atomic client-side array splices.';
