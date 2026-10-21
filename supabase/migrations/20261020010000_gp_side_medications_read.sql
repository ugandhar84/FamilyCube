-- A grandparent can read the medications of the grandparent(s) on the same side of the family (same linked parent),
-- on top of their own. Everyone else keeps the existing rule (parents: whole family, others: own rows only).
create or replace function public.member_is_my_gp_side(target text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.members me
    join public.members t on t.linked_parent_id is not distinct from me.linked_parent_id
    where me.id::text = public.resolve_active_member_id()
      and me.role = 'grandparent' and t.role = 'grandparent'
      and me.linked_parent_id is not null
      and t.id::text = target
  )
$$;

drop policy if exists "family_medications_select" on public.family_medications;
create policy "family_medications_select" on public.family_medications for select
  using (family_id = (current_user_family_id())::text
         and (public.active_member_sees_whole_family()
              or member_id::text = public.resolve_active_member_id()
              or public.member_is_my_gp_side(member_id::text)));
