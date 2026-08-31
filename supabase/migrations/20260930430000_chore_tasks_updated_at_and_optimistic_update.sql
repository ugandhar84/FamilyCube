-- Real gap found by direct QA trace of the parent-to-parent (P2P) private
-- lane: chore_tasks has no updated_at/version column at all, and every
-- direct edit (updateChore()'s plain .update().eq('id', id)) is a blind,
-- unconditional write. Two parents editing the same chore's title within
-- the same instant produce a genuine last-write-wins race with ZERO signal
-- to whichever parent's edit was silently discarded — the same failure
-- shape as the bulk-write/identity-spoofing bugs already fixed elsewhere
-- this session, just triggered by an ordinary double-edit instead of a
-- batch operation.
--
-- Fix, part 1: add updated_at, auto-stamped by trigger on every UPDATE so
-- no write path (RPC or plain client write) can forget to set it.
alter table public.chore_tasks add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_chore_tasks_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists chore_tasks_touch_updated_at on public.chore_tasks;
create trigger chore_tasks_touch_updated_at
  before update on public.chore_tasks
  for each row
  execute function public.touch_chore_tasks_updated_at();

-- Fix, part 2: an RPC for the specific fields most at risk of a genuine
-- concurrent double-edit — the free-text fields a parent types into
-- directly (title/description/parent_note) plus the small set of scalar
-- fields also editable from the same edit sheet. Other chore_tasks writes
-- (status transitions, claim/assign, approvals, etc.) already go through
-- their own dedicated, identity-verified RPCs elsewhere in this schema and
-- are out of scope here. The client passes back the updated_at it last
-- read; if the row has moved on since, the write is rejected with a clear
-- stale-write error instead of silently overwriting someone else's edit.
create or replace function public.update_chore_task_checked(
  p_chore_id text,
  p_title text default null,
  p_has_title boolean default false,
  p_description text default null,
  p_has_description boolean default false,
  p_parent_note text default null,
  p_has_parent_note boolean default false,
  p_due_date text default null,
  p_has_due_date boolean default false,
  p_due_time text default null,
  p_has_due_time boolean default false,
  p_coins_reward int default null,
  p_has_coins_reward boolean default false,
  p_base_points int default null,
  p_has_base_points boolean default false,
  p_expected_updated_at timestamptz default null
)
returns public.chore_tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active_member_id text;
  v_current public.chore_tasks;
  v_result public.chore_tasks;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null then
    raise exception 'caller is not a verified family member';
  end if;

  select * into v_current from public.chore_tasks where id = p_chore_id for update;
  if v_current.id is null then
    raise exception 'chore % not found', p_chore_id;
  end if;

  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_write: chore % was changed by someone else since you last loaded it', p_chore_id;
  end if;

  update public.chore_tasks set
    title         = case when p_has_title         then p_title         else title end,
    description   = case when p_has_description   then p_description   else description end,
    parent_note   = case when p_has_parent_note    then p_parent_note   else parent_note end,
    due_date      = case when p_has_due_date       then p_due_date      else due_date end,
    due_time      = case when p_has_due_time       then p_due_time      else due_time end,
    coins_reward  = case when p_has_coins_reward   then p_coins_reward  else coins_reward end,
    base_points   = case when p_has_base_points    then p_base_points   else base_points end
  where id = p_chore_id
  returning * into v_result;

  return v_result;
end;
$function$;
