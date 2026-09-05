-- Family Games feature — shared leaderboard table for Snake (always solo)
-- and solo-vs-AI Memory (multiplayer Memory results stay in
-- game_sessions.result/winner_id — a win/loss against another human isn't
-- a personal-best leaderboard entry the same way beating the clock/AI is).
-- One shared table rather than a table per game: both are "personal best,
-- filterable by game_type + difficulty" with the same query/RPC shape;
-- the handful of game-specific detail columns are cheap to leave nullable
-- side-by-side, the same trade-off game_sessions.board_state already makes
-- for genre differences via jsonb instead of per-game tables.
create table if not exists public.game_scores (
  id                   text primary key default gen_random_uuid()::text,
  family_id            text not null,
  member_id            text not null references public.members(id) on delete cascade,
  game_type            text not null check (game_type in ('snake', 'memory')),
  difficulty           text not null check (difficulty in ('easy', 'medium', 'hard')),

  -- The single sortable leaderboard number — higher is always better,
  -- across both game types (see scoring formulas in gameStore.ts /
  -- snakeLogic.ts / memoryLogic.ts), so every leaderboard query can sort
  -- `score desc` universally without a per-game direction flag.
  score                int not null,

  -- Snake-specific detail — null for memory rows.
  snake_length         int,
  snake_food_eaten     int,

  -- Memory-specific detail — null for snake rows.
  memory_moves         int,
  memory_time_seconds  int,

  -- Traceability back to the solo_ai game_sessions row this score came
  -- from, if it was a solo Memory game. Always null for snake (snake never
  -- uses game_sessions at all).
  session_id           text references public.game_sessions(id) on delete set null,

  created_at           timestamptz not null default now()
);

create index if not exists game_scores_leaderboard_idx on public.game_scores(family_id, game_type, difficulty, score desc);
create index if not exists game_scores_member_idx on public.game_scores(member_id, game_type);

comment on table public.game_scores is
  'Shared leaderboard for Snake (always solo) and solo-vs-AI Memory. Multiplayer Memory results live in game_sessions instead. score is always "higher is better" regardless of game_type.';

alter table public.game_scores enable row level security;

-- Same current_user_family_id() pattern as game_sessions/uno_games.
create policy "game_scores family read"
  on public.game_scores for select
  using (family_id = public.current_user_family_id()::text);

-- Writes go through submit_score() (submit_game_score_rpc.sql) — same
-- RPC-only-write philosophy as game_sessions, so score submission can be
-- validated server-side (e.g. sane bounds on score/moves/time) rather than
-- trusting a raw client insert of an arbitrary leaderboard number.
revoke insert, update, delete on public.game_scores from authenticated, anon;
grant select on public.game_scores to authenticated;
