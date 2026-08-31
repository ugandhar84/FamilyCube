-- Real gap found by a direct QA trace of onboarding: family creation and
-- the first parent's member row were two separate client-side inserts
-- (SetupFamilyScreen.tsx), with no transaction wrapping them. A crash or
-- network failure between the two left a permanently orphaned families
-- row with zero members — invisible, unrecoverable by the user (they just
-- retry and get a brand-new family), but a real, silently-accumulating
-- leak in the families table with no cleanup mechanism.
--
-- Fix: wrap both inserts in one RPC transaction — either both succeed or
-- neither does, closing the orphan window entirely. Only the fields the
-- client actually sets are parameterized; everything else keeps the same
-- database defaults the two separate inserts already relied on.
create or replace function public.create_family_with_first_parent(
  p_family_name text,
  p_member_id text,
  p_member_name text,
  p_avatar text,
  p_color text default null,
  p_pin text default null,
  p_expo_push_token text default null
)
returns table(family_id uuid, member_id text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_family_with_first_parent: no authenticated session';
  end if;

  insert into public.families (name, created_by)
  values (p_family_name, auth.uid())
  returning id into v_family_id;

  insert into public.members (
    id, name, role, avatar, color, family_id, auth_user_id,
    coins, xp, level, max_xp, streak, pin, expo_push_token, last_active
  ) values (
    p_member_id, p_member_name, 'parent', p_avatar, p_color, v_family_id, auth.uid(),
    0, 0, 1, 100, 0, p_pin, p_expo_push_token, now()
  );

  return query select v_family_id, p_member_id;
end;
$function$;
