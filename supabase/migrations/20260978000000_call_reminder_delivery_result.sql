-- call-reminder-sweeper's send result (sent/failed/skipped counts + APNs/FCM
-- error strings from sendVoipPush) previously only ever existed in the HTTP
-- response of the exact cron invocation that rang — nothing was persisted,
-- so a real reminder that claimed successfully (call_reminder_log row
-- written) but failed to deliver to every token left zero trace anywhere.
-- Confirmed live: a reminder showed "alreadyRung: 1" on a later poll with no
-- way to tell whether it actually reached the device or silently failed at
-- the APNs/FCM layer. Persisting the delivery result makes every future
-- failure diagnosable after the fact instead of only in a 60-90s window.
alter table public.call_reminder_log
  add column if not exists delivery_result jsonb;
