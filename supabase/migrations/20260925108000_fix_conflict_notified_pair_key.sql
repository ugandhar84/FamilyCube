-- conflict_notified_at (20260925107000) was designed as a timestamptz but
-- schedule-conflict-sweep actually needs to store a PAIRING KEY (which two
-- event ids this notification covered), not just a timestamp, so it can
-- tell "already notified about a/b" apart from "notified about a
-- different conflict, a/c, that happens to also involve event a." Keeping
-- conflict_notified_at as a real timestamp (for anything that wants "when
-- was this last notified" later) and adding the pairing key as its own
-- column instead of repurposing the timestamp's type.
alter table public.calendar_events
  add column if not exists conflict_notified_pair text;
