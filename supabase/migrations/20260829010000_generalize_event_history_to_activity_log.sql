-- Generalizes calendar_event_history (just pushed, no rows written yet)
-- into a shared activity_log covering BOTH calendar events and chores —
-- one history table, one log-trail sheet UI, parameterized by entity type,
-- instead of duplicating the whole mechanism per feature (user: "do the
-- same for chores too, all logs should present in the history sheet").
alter table public.calendar_event_history rename to activity_log;

alter table public.activity_log rename column event_id to entity_id;
alter table public.activity_log add column if not exists entity_type text not null default 'event';
alter table public.activity_log alter column entity_type drop default;

-- Chore-specific actions extend the same action vocabulary the event side
-- already uses: 'created' | 'deleted' | 'claimed' | 'submitted' | 'approved'
-- | 'declined' | 'reassigned' | 'status_changed' | 'reward_changed' |
-- 'due_date_changed' | 'notes_changed' | 'other' — enforced app-side, not
-- a DB check constraint, same as the event action vocabulary (keeps this
-- table extensible without a migration every time a new action is added).

create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
drop index if exists calendar_event_history_event_id_idx;
