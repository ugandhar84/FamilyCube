-- Cross-role visibility fix (V-A3, V-A4, V-A5) — add `members`,
-- `kid_requests`, and `parent_quest_assignments` to the `supabase_realtime`
-- publication so postgres_changes subscriptions on these tables actually
-- receive INSERT/UPDATE/DELETE events.
--
-- Without this, the new realtime channels added to familyStore.ts,
-- kidRequestStore.ts, and choreStore.ts's second `.on('postgres_changes', ...)`
-- handler (for parent_quest_assignments) will subscribe successfully but
-- never receive any events — the client-side code is a no-op until these
-- tables are actually part of the publication.
--
-- Idempotent: ALTER PUBLICATION ... ADD TABLE fails if the table is already
-- a member, so this guards with a check against pg_publication_tables first
-- (mirrors how chore_tasks/calendar_events/trips were presumably already
-- added to this publication outside of a tracked migration in this repo —
-- confirmed no prior migration file adds them, so they were likely added
-- directly via the Supabase dashboard; this migration makes the three
-- tables this fix depends on explicit and reproducible).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'members'
  ) then
    alter publication supabase_realtime add table public.members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'kid_requests'
  ) then
    alter publication supabase_realtime add table public.kid_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parent_quest_assignments'
  ) then
    alter publication supabase_realtime add table public.parent_quest_assignments;
  end if;
end $$;
