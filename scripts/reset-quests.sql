-- Wipes all quest/chore test data for a clean re-test.
-- Leaves members, family, chat, rewards, and everything else untouched.
--
-- Run: supabase db query --linked --file scripts/reset-quests.sql
--
-- Order matters: point_transactions and errands restrict-delete against
-- chore_tasks (no cascade), so they have to go first. responsibility_history
-- and parent_quest_assignments cascade automatically but are included
-- explicitly for clarity/speed.

delete from point_transactions where chore_instance_id in (select id from chore_tasks);
delete from errands where chore_id in (select id from chore_tasks);
delete from responsibility_history where chore_id in (select id from chore_tasks);
delete from parent_quest_assignments;
delete from call_reminder_log;
delete from chore_tasks;
