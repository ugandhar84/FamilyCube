-- Fixes a real bug: KidNeedsYouSection's full-screen celebration
-- (chore/quest approved, cheer received, permission approved) replays on
-- every fresh mount of the Kid Hub (app relaunch, or switching away and
-- back to this kid's profile) for anything still un-dismissed — the
-- in-memory celebratedKeys ref that was meant to prevent replay resets to
-- empty on every mount, so it only ever suppressed a replay WITHIN one
-- continuous session, never across app restarts. Live-reported: "even
-- there is no latest approvals or good news then animation still
-- playing."
--
-- Fix: a per-member watermark timestamp. Only a celebratable item newer
-- than this watermark plays; anything older is treated as already seen,
-- REGARDLESS of whether the kid ever tapped dismiss on its row (a kid who
-- saw the celebration and just navigated away without tapping X
-- shouldn't get it replayed next login). Bumped to now() the moment ANY
-- celebration actually plays — see KidNeedsYouSection.tsx's own trigger
-- effect — covering every item celebrated in that batch, not just the
-- one that happened to fire last.
alter table public.members
  add column if not exists last_celebration_seen_at timestamptz;
