-- Real per-event audit trail — previously no history/log infrastructure
-- existed anywhere in the app (a similar-looking `history` field on chores
-- is always empty, never populated). Every meaningful change to a
-- calendar_events row (created, deleted, date/time change, recurrence
-- change, driver/helper assignment or reassignment, GP/Teen-welcome
-- toggle, notes edit) gets one row here, capturing who made the change
-- and what it was — surfaced via a small history icon on each event card
-- opening a log-trail sheet.
create table if not exists public.calendar_event_history (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null,
  family_id    uuid not null references public.families(id) on delete cascade,
  actor_id     text,               -- member.id of whoever made the change; null for system-driven changes (e.g. auto-dispatch)
  action       text not null,      -- 'created' | 'deleted' | 'date_changed' | 'time_changed' | 'recurrence_changed' | 'recurrence_cancelled' | 'driver_assigned' | 'driver_reassigned' | 'driver_removed' | 'gp_welcome_changed' | 'teen_welcome_changed' | 'notes_changed' | 'other'
  field        text,               -- which field changed, e.g. 'date', 'helper', 'isOpenToGrandparents' — null for created/deleted
  old_value    text,
  new_value    text,
  note         text,               -- free-text context, e.g. a decline reason
  created_at   timestamptz not null default now()
);

create index if not exists calendar_event_history_event_id_idx on public.calendar_event_history (event_id, created_at desc);
create index if not exists calendar_event_history_family_id_idx on public.calendar_event_history (family_id);

alter table public.calendar_event_history enable row level security;

-- Same family-membership boundary every other per-family table in this
-- app uses — a family member can read the full history for their own
-- family's events, and any family member can write a history row (the
-- write always happens as a side effect of a normal event mutation
-- they're already authorized to make, same trust boundary as
-- calendar_events itself).
create policy "family members read calendar_event_history"
  on public.calendar_event_history for select
  using (
    family_id in (select family_id from public.members where id = auth.uid()::text)
  );

create policy "family members insert calendar_event_history"
  on public.calendar_event_history for insert
  with check (
    family_id in (select family_id from public.members where id = auth.uid()::text)
  );
