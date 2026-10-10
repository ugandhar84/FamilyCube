-- Adds "remind me N days before due date" to home maintenance reminders.
-- reminder_days_before: 1, 2, or 7 (null = no reminder set).
-- reminder_sent_at: one-shot guard so homeowner-reminder-notifier's daily
-- sweep doesn't re-fire the same push every run; reset to null whenever
-- due_date or reminder_days_before changes (store/homeownerNotesStore.ts),
-- or when a recurring note's due_date rolls forward on completion.
alter table homeowner_notes
  add column if not exists reminder_days_before smallint,
  add column if not exists reminder_sent_at timestamptz;

alter table homeowner_notes
  add constraint homeowner_notes_reminder_days_before_check
  check (reminder_days_before is null or reminder_days_before in (1, 2, 7));
