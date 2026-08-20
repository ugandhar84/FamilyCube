-- call_reminder_log was keyed only by (item_type, item_id), so once a
-- chore/event's alert_call reminder rang once, it could never ring again —
-- even if the user later edited the due time (e.g. moved an appointment
-- from 3pm to 5pm the next day). The sweeper (call-reminder-sweeper) now
-- computes a per-row due_at (the actual UTC instant the reminder is for,
-- rounded to the minute) and keys dedup on (item_type, item_id, due_at)
-- instead, so an edited time is a distinct key that's eligible to ring
-- again, while retries of the same unmodified item within the 90s sweep
-- window still collide on the identical due_at and stay deduped.

alter table public.call_reminder_log
  add column if not exists due_at timestamptz;

-- Backfill: no reliable way to reconstruct the original due_at for rows
-- logged under the old scheme, so stamp them with fired_at as a reasonable
-- approximation — worst case, an already-rung item with an unchanged time
-- gets treated as a "new" due_at once and rings one extra time, which is
-- far safer than the old bug (never ringing again after any edit).
update public.call_reminder_log set due_at = fired_at where due_at is null;

alter table public.call_reminder_log
  alter column due_at set not null;

alter table public.call_reminder_log
  drop constraint if exists call_reminder_log_item_type_item_id_key;

drop index if exists call_reminder_log_item_type_item_id_key;

alter table public.call_reminder_log
  add constraint call_reminder_log_item_type_item_id_due_at_key
  unique (item_type, item_id, due_at);
