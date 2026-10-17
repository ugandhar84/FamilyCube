-- 1) A day can hold only one meal of each type. The existing duplicates were test data; keep the oldest of each and
--    remove the rest, then enforce it. (The kiosk and phone screens already refuse a second one; this makes it hold
--    for every client.)
delete from public.family_meals m
using (
  select id, row_number() over (
    partition by family_id, week_of, day, lower(type) order by id
  ) as rn
  from public.family_meals
) d
where m.id = d.id and d.rn > 1;

create unique index if not exists family_meals_one_type_per_day
  on public.family_meals (family_id, week_of, day, lower(type));

-- 2) Kids (role child/kid) are read-only on the meal plan. Teens, grandparents and parents keep editing, as on the
--    phone. A session with no resolvable active member keeps the old family-scoped behaviour, so legacy sessions are
--    not locked out.
create or replace function public.active_member_is_kid() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select role in ('child', 'kid') from public.members where id::text = public.resolve_active_member_id()), false)
$$;

drop policy if exists "family_meals_insert" on public.family_meals;
drop policy if exists "family_meals_update" on public.family_meals;
drop policy if exists "family_meals_delete" on public.family_meals;

create policy "family_meals_insert" on public.family_meals for insert
  with check (family_id = public.current_user_family_id()::text and not public.active_member_is_kid());
create policy "family_meals_update" on public.family_meals for update
  using (family_id = public.current_user_family_id()::text and not public.active_member_is_kid())
  with check (family_id = public.current_user_family_id()::text and not public.active_member_is_kid());
create policy "family_meals_delete" on public.family_meals for delete
  using (family_id = public.current_user_family_id()::text and not public.active_member_is_kid());
