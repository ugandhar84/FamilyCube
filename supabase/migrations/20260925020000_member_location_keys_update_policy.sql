-- member_location_keys had SELECT/INSERT policies but no UPDATE policy —
-- the client writes via .upsert(..., { onConflict: 'member_id,device_id' }),
-- which Postgres runs as an INSERT for a new (member_id, device_id) pair but
-- an UPDATE when that pair already has a row (a re-wrap after the family's
-- device set changed, or simply a retry of an earlier successful wrap).
-- With RLS enabled and no UPDATE policy, that second case fell through to
-- the default deny-all — confirmed live: "new row violates row-level
-- security policy (USING expression) for table member_location_keys" on a
-- routine location refresh, the exact "missing verb policy" shape already
-- fixed once this session for notifications' missing DELETE policy.
create policy member_location_keys_update on member_location_keys
  for update using (
    exists (
      select 1 from members m
      where m.id = member_location_keys.member_id
        and m.family_id::text = (current_user_family_id())::text
    )
  ) with check (
    exists (
      select 1 from members m
      where m.id = member_location_keys.member_id
        and m.family_id::text = (current_user_family_id())::text
    )
  );
