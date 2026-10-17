-- Removal from a family is separate from deleting an account: the login lives on and can join or create another family.
-- 1) what a removed person sees, 2) how an admin undoes a removal within 7 days, 3) who is on the removed list.

create or replace function public.my_removal_notice()
returns table (family_name text, removed_at timestamptz, has_active boolean)
language sql stable security definer set search_path = public as $$
  select f.name, m.deleted_at,
         exists (select 1 from public.members a where a.auth_user_id = auth.uid() and a.deleted_at is null)
  from public.members m
  join public.families f on f.id = m.family_id
  where m.auth_user_id = auth.uid() and m.deleted_at is not null and m.removed_by is not null
  order by m.deleted_at desc
  limit 1;
$$;
grant execute on function public.my_removal_notice() to authenticated;

create or replace function public.list_removed_members()
returns table (id text, name text, role text, removed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.role, m.deleted_at
  from public.members m
  where m.family_id = public.current_user_family_id()
    and m.deleted_at is not null and m.deleted_at > now() - interval '60 days'
    and exists (select 1 from public.members me where me.id = public.resolve_active_member_id() and me.role = 'parent')
  order by m.deleted_at desc;
$$;
grant execute on function public.list_removed_members() to authenticated;

create or replace function public.restore_removed_member(p_member_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  if not exists (select 1 from public.members me where me.id = public.resolve_active_member_id() and me.role = 'parent') then
    raise exception 'only a parent can restore a removed member';
  end if;
  select family_id into v_family from public.members where id = p_member_id and deleted_at is not null;
  if v_family is null or v_family <> public.current_user_family_id() then
    raise exception 'member not found in this family';
  end if;
  update public.members set deleted_at = null, removed_by = null, deletion_notified_at = null where id = p_member_id;
end;
$$;
grant execute on function public.restore_removed_member(text) to authenticated;
