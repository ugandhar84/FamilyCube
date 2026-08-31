-- Real gap found by the deeper P2P schedule/calendar QA trace: two
-- co-parents independently editing start_time vs end_time on the same
-- event (each unaware of the other's latest value, since updateEvent only
-- ever sends the one changed field) can leave an event with its end time
-- strictly before its start time — no database constraint or client
-- validation caught this. Confirmed zero pre-existing violations before
-- adding this. Uses a plain string comparison (not <=, so a legitimate
-- zero-duration point-in-time entry with start=end still passes) since
-- both columns are consistently stored as zero-padded 24-hour "HH:MM"
-- text, confirmed live — lexicographic and chronological ordering agree
-- for that format within a single day.
alter table public.calendar_events
  add constraint calendar_events_end_not_before_start
  check (start_time is null or end_time is null or end_time >= start_time);
