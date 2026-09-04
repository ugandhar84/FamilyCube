-- Live-reported bug: a second parent (joined an existing family, didn't
-- create it) opening Profile > Data Recovery saw the "Set up a recovery
-- passcode" form even though the FIRST parent had already set one up —
-- Data Recovery's own logic (familyHasRecoveryKey, which just reads
-- families.encrypted_recovery_privkey) was correct, but the underlying
-- RLS policy on families' own SELECT silently returned zero rows for
-- anyone except the family's original creator.
--
-- The old "family members can read" policy's first clause compared
-- members.id = auth.uid()::text — members.id is a member ROW's own id,
-- never the Supabase auth user id (auth_user_id is the correct column
-- for that, established and used correctly by every other RLS policy in
-- this app, e.g. current_user_family_id()). That clause could never
-- match anyone at all. The only clause that ever worked was
-- created_by = auth.uid() — meaning ONLY the family's original creator
-- could read the families row (recovery-key status, family name,
-- currency settings, etc.) at all; every other parent/member silently
-- got nothing back, with no error surfaced anywhere.
drop policy if exists "family members can read" on public.families;

create policy "family members can read" on public.families
  for select
  using (
    id = public.current_user_family_id()
    or created_by = auth.uid()
  );
