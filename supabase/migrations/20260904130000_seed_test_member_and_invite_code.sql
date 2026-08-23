-- One-off, user-requested: add a dummy PIN-only member to Ugandhar's family
-- and generate a matching invite code (same 3-letter-family-prefix + 5
-- random alphanumeric format generate-invite-code now produces), so the
-- code can be handed back for a live sign-in-with-code test. Uses PL/pgSQL
-- DO block + RAISE NOTICE since there's no ad-hoc SQL runner available
-- outside of a migration file in this session.
do $$
declare
  v_family_id uuid;
  v_family_name text;
  v_member_id text := 'test-dummy-' || substr(md5(random()::text), 1, 8);
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_prefix text := '';
  v_suffix text := '';
  v_code text;
  i int;
begin
  -- Match by member name (case-insensitive) or family creator's linked
  -- member name — whichever finds the family first.
  select f.id, f.name into v_family_id, v_family_name
  from public.families f
  where exists (
    select 1 from public.members m
    where m.family_id = f.id and m.name ilike '%ugandhar%'
  )
  limit 1;

  if v_family_id is null then
    raise notice 'NO_MATCH: no family found with a member named like %%ugandhar%%';
    return;
  end if;

  -- Insert the dummy member — PIN-only (no email, no auth_user_id), same
  -- shape as a parent manually adding a local profile.
  insert into public.members (id, name, role, avatar, family_id, coins, xp, level, max_xp, streak)
  values (v_member_id, 'Test Dummy', 'child', '🧪', v_family_id, 0, 0, 1, 100, 0);

  -- 3-letter family-name prefix, matching generate-invite-code's own logic.
  v_prefix := upper(regexp_replace(coalesce(v_family_name, ''), '[^A-Za-z0-9]', '', 'g'));
  v_prefix := substr(v_prefix, 1, 3);
  while length(v_prefix) < 3 loop
    v_prefix := v_prefix || substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1);
  end loop;

  for i in 1..5 loop
    v_suffix := v_suffix || substr(v_alphabet, (floor(random() * length(v_alphabet)) + 1)::int, 1);
  end loop;
  v_code := v_prefix || v_suffix;

  -- Replace any existing pending code for this family, same upsert
  -- semantics generate-invite-code uses (one active code per family).
  update public.family_invites set status = 'expired' where family_id = v_family_id and status = 'pending';
  insert into public.family_invites (family_id, code, status, created_by, expires_at)
  values (v_family_id, v_code, 'pending', null, now() + interval '7 days');

  raise notice 'FAMILY_ID: %', v_family_id;
  raise notice 'FAMILY_NAME: %', v_family_name;
  raise notice 'MEMBER_ID: %', v_member_id;
  raise notice 'INVITE_CODE: %', v_code;
end $$;
