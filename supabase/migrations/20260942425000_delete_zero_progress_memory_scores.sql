-- Cleanup: the client-side Memory scoring formula (computeMemoryScoreBreakdown
-- in features/games/memory/memoryLogic.ts) had a real bug — the round-over
-- score paid out the full 1000-point base plus the difficulty bonus (up to
-- +500 for Hard) regardless of whether the player had actually matched any
-- pairs. A round that ended via the TIME LIMIT expiring with zero matches
-- (confirmed live: a real player hit this exactly — 0/8 pairs, "Tie",
-- 0:00 on the clock, yet a submitted score of 1020) still wrote a fully
-- inflated score to the family leaderboard. submit_score's own RPC only
-- ever sanity-checked p_score >= 0, never re-derived the formula
-- server-side (a deliberate choice — see that migration's own comment:
-- "a leaderboard number has no further consequence beyond display
-- ordering"), so nothing caught this before it landed in game_scores.
--
-- game_scores never stored "pairs actually won" at all (only
-- memory_moves/memory_time_seconds), so a genuinely-bad row from this bug
-- can't be perfectly distinguished from a real one after the fact in
-- general. But memory_moves = 0 is an unambiguous signal: a completed
-- solo Memory round with ZERO moves recorded is impossible under real
-- play (finishing requires flipping cards, which always increments the
-- player's own move count) — the only way that combination exists is a
-- round that ended (via the time limit) before the player made a single
-- move, which is exactly this bug's own reproduction. This is a narrow,
-- high-confidence deletion — it does not touch any row where the player
-- demonstrably did something.
delete from public.game_scores
where game_type = 'memory'
  and memory_moves = 0;
