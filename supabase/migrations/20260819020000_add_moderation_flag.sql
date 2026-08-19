-- Content moderation, two layers:
-- 1. Fast client-side blocklist (lib/contentModeration.ts) blocks obvious
--    profanity before send — never reaches the DB, no column needed for it.
-- 2. Slower AI moderation (moderate-message edge function) runs
--    fire-and-forget AFTER a message is sent, and writes a flag here for
--    subtler issues (harassment/bullying tone) a keyword list can't catch.
--    Visible to parent accounts only — never a public callout on the
--    message itself, to avoid publicly embarrassing a kid over a
--    borderline/false-positive AI judgment.
alter table public.chat_messages
  add column if not exists moderation_flag jsonb; -- { severity, reason, flagged_at }

alter table public.ask_cube_messages
  add column if not exists moderation_flag jsonb;
