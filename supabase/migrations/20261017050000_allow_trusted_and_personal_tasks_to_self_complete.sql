-- block_child_self_approval stopped a kid or teen from completing ANY task that moves to approved/auto_approved,
-- including two cases that are meant to complete with one tap:
--   1) a task a parent marked "trusted" (submit_chore auto-approves it), and
--   2) a personal reminder the kid created for themselves with no coins (the kiosk "Add my own task").
-- Both still go through submit_chore. Everything else a kid or teen finishes keeps needing a parent.
create or replace function public.block_child_self_approval() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  caller_id text;
  caller_role text;
  creator_role text;
  worth integer;
begin
  if new.status not in ('approved', 'auto_approved') then
    return new;
  end if;
  if old.status in ('approved', 'auto_approved') then
    return new;
  end if;

  caller_id := public.resolve_active_member_id();
  select m.role into caller_role from public.members m where m.id = caller_id;

  if caller_role in ('child', 'teenager') and caller_id = new.assigned_to_id then
    if new.status = 'auto_approved' and new.reviewed_at is not null then
      -- 1) trusted by a parent (and no photo proof required)
      if coalesce(new.trusted_auto_approve, false) and not coalesce(new.requires_photo, false) then
        select role into creator_role from public.members where id = new.created_by_id;
        if creator_role in ('parent', 'grandparent') then
          return new;
        end if;
      end if;
      -- 2) their own personal task worth nothing (no way to farm coins)
      worth := coalesce(nullif(new.base_points, 0), new.coins_reward, 0) + coalesce(new.bonus_coins, 0);
      if new.created_by_id is not null and new.created_by_id = new.assigned_to_id and worth = 0 then
        return new;
      end if;
    end if;
    raise exception 'A child/teenager cannot approve their own chore — requires a parent or an active temporary-approver grant.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
