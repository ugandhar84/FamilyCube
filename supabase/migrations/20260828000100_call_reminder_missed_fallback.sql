-- A VoIP call reminder that rings and is never answered currently just
-- disappears — call_reminder_log claims the (item_type,item_id,due_at) key
-- the instant the push is SENT, permanently, regardless of whether anyone
-- ever picked up. There was no way to tell "rang, answered" apart from
-- "rang, ignored/missed" after the fact, and no second chance for the
-- second case. answered tracks whether the native side ever saw
-- CXCall.hasConnected == true for that call; retry_count lets the sweeper
-- give an unanswered reminder exactly one follow-up (a retry call + a
-- normal push notification fallback) ~3 minutes later, never more than
-- once — this is a single quiet follow-up, not a repeating nag.
alter table public.call_reminder_log
  add column if not exists answered boolean not null default false,
  add column if not exists retry_count int not null default 0;

comment on column public.call_reminder_log.answered is 'Set true by the client (via mark-call-reminder-answered) when CXCall.hasConnected fires for this reminder''s call — distinguishes a genuinely answered call from one that rang out unanswered.';
comment on column public.call_reminder_log.retry_count is 'How many follow-up attempts the sweeper has made for this unanswered reminder. Capped at 1 by the sweeper''s own query (WHERE retry_count = 0) — a missed reminder gets exactly one retry call + one push notification, never a repeating loop.';
