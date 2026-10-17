-- 1) toggle_medication_dose was SECURITY DEFINER with no identity check and executable by the public anon key, so
--    anyone could mark any family's medication doses by id. It now requires a real caller who is the medication's
--    own member or a parent in the same family, and p_modified_by must be that caller.
create or replace function public.toggle_medication_dose(
  p_med_id uuid, p_entry text, p_mark_taken boolean, p_today text, p_modified_by uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_freq_times jsonb;
  v_times text[];
  v_new_dates jsonb;
  v_all_taken boolean;
  v_expected_entry text;
  v_actor text;
  v_actor_role text;
  v_actor_family text;
  v_med_member text;
  v_med_family text;
begin
  v_actor := public.resolve_active_member_id();
  if v_actor is null then
    raise exception 'not signed in';
  end if;
  if p_modified_by is not null and p_modified_by::text is distinct from v_actor then
    raise exception 'caller is not member %', p_modified_by;
  end if;

  select frequency_times, member_id::text, family_id::text
    into v_freq_times, v_med_member, v_med_family
  from family_medications where id = p_med_id for update;
  if not found then
    return null;
  end if;

  select role, family_id::text into v_actor_role, v_actor_family from public.members where id::text = v_actor;
  if v_actor_family is distinct from v_med_family then
    raise exception 'medication is not in your family';
  end if;
  if v_actor is distinct from v_med_member and v_actor_role is distinct from 'parent' then
    raise exception 'only the person taking it or a parent can log this dose';
  end if;

  if p_mark_taken then
    update family_medications
    set taken_dates = (
      case when taken_dates @> to_jsonb(array[p_entry])
        then taken_dates
        else taken_dates || to_jsonb(array[p_entry])
      end
    )
    where id = p_med_id
    returning taken_dates into v_new_dates;
  else
    update family_medications
    set taken_dates = (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from jsonb_array_elements_text(taken_dates) elem
      where elem <> p_entry
    )
    where id = p_med_id
    returning taken_dates into v_new_dates;
  end if;

  select coalesce(array_agg(value::text), array['08:00'])
  into v_times
  from jsonb_array_elements_text(coalesce(v_freq_times, '[]'::jsonb));

  v_all_taken := true;
  for i in 1 .. array_length(v_times, 1) loop
    v_expected_entry := p_today || (case when array_length(v_times, 1) > 1 then '|' || v_times[i] else '' end);
    if not (v_new_dates @> to_jsonb(array[v_expected_entry])) then
      v_all_taken := false;
      exit;
    end if;
  end loop;

  update family_medications
  set taken_date = case when v_all_taken then p_today else null end,
      modified_by = p_modified_by,
      updated_at = now()
  where id = p_med_id;

  return v_new_dates;
end;
$function$;

revoke execute on function public.toggle_medication_dose(uuid, text, boolean, text, uuid) from anon;
grant execute on function public.toggle_medication_dose(uuid, text, boolean, text, uuid) to authenticated;

-- 2) A kid could insert a recipe already "approved" and could flip their own to approved. Only a parent can approve:
--    a non-parent's new recipe is stored as pending, and only a parent can move one from pending to approved.
--    Service-role writes (no signed-in member) are left alone.
create or replace function public.family_recipes_approval_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor text;
  v_role text;
begin
  v_actor := public.resolve_active_member_id();
  if v_actor is null then
    return new;
  end if;
  select role into v_role from public.members where id::text = v_actor;
  if v_role is distinct from 'parent' then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    elsif tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved' then
      raise exception 'only a parent can approve a recipe';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists family_recipes_approval_guard on public.family_recipes;
create trigger family_recipes_approval_guard before insert or update on public.family_recipes
  for each row execute function public.family_recipes_approval_guard();
