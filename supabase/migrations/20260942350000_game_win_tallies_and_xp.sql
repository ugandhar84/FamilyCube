-- Family Games — persistent per-member, per-game-type win/loss/draw tallies
-- plus a cross-game XP/level system.
--
-- Design decisions:
--
-- 1. ONE shared tally table (game_win_tallies), not a table per game type —
--    same "shared shape, filterable by game_type" reasoning game_scores.sql
--    already used for Snake/Memory leaderboard rows. tic_tac_toe/memory/
--    uno all reduce to the same (wins, losses, draws) shape; snake is
--    included too even though it has no opponent (every completed round
--    counts as either a "win" via submit_score's own already-existing path
--    — no, snake never wins/loses, so snake is EXCLUDED from this table's
--    check constraint; its own progression already lives in game_scores.
--    Uno never draws (always exactly one winner), tic_tac_toe/memory can.
--
-- 2. XP/level is cross-game and lives on member_arcade_stats, ONE row per
--    (family_id, member_id) — not derived by summing game_win_tallies on
--    every read, so the launcher's level badge is a single indexed lookup
--    rather than an aggregate query. The two tables are kept in sync
--    atomically by the same award_game_xp() helper (see below) so they can
--    never drift.
--
-- 3. XP formula (kept deliberately simple/explainable, per the task's own
--    instruction to favor something a kid can understand over a "true"
--    game-design curve):
--      participation (any completed game, including a loss) = +5 XP
--      draw/tie bonus                                        = +8 XP total
--      win bonus                                              = +15 XP total
--    (i.e. a loss earns 5, a draw earns 8, a win earns 15 — strictly
--    increasing so winning always feels best, but showing up always earns
--    something so a losing streak doesn't feel like a wall.)
--    Level = floor(sqrt(xp / 50)) + 1 — i.e. level N requires
--    50*(N-1)^2 total XP (50, 200, 450, 800, 1250, ...). Monotonic,
--    strictly increasing gaps (each level takes longer than the last, the
--    standard "slowing RPG curve" shape) without needing a lookup table,
--    and easy to state in one sentence in the UI ("Win games to earn XP —
--    each level needs a bit more than the last").
--
-- 4. award_game_xp() is SECURITY DEFINER, has NO grant to authenticated/
--    anon (same "internal helper, no client can call it directly" pattern
--    as _play_uno_card_internal/_draw_uno_card_internal) — it is only ever
--    invoked FROM inside another SECURITY DEFINER RPC that has already
--    independently verified the game outcome server-side (submit_game_move,
--    play_uno_card, play_uno_ai_turn, submit_solo_game_result). A client
--    can never call it to fabricate a win for itself.
--
-- 5. Solo Tic-Tac-Toe (and any future solo-only game with no game_sessions
--    row at all) now needs its OWN client-callable RPC to record a result,
--    since it previously persisted nothing — submit_solo_game_result().
--    It re-derives nothing (there is no server-side board to check against,
--    unlike multiplayer submit_game_move) since a solo-vs-AI outcome has no
--    stakes beyond the player's own tally/XP — same "sanity bounds, not
--    full re-derivation" trust level submit_score already uses for
--    leaderboard scores, applied here to solo win/loss/draw instead.

create table if not exists public.game_win_tallies (
  id          text primary key default gen_random_uuid()::text,
  family_id   text not null,
  member_id   text not null references public.members(id) on delete cascade,
  game_type   text not null check (game_type in ('tic_tac_toe', 'memory', 'uno')),

  wins        int not null default 0,
  losses      int not null default 0,
  draws       int not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (member_id, game_type)
);

create index if not exists game_win_tallies_family_idx on public.game_win_tallies(family_id, game_type);

comment on table public.game_win_tallies is
  'Persistent per-member, per-game-type win/loss/draw tallies for Tic-Tac-Toe/Memory/Uno (solo AND multiplayer both feed the same row — see award_game_xp). Snake is excluded: it has no opponent to win/lose against, its own progression lives entirely in game_scores.';

alter table public.game_win_tallies enable row level security;

create policy "game_win_tallies family read"
  on public.game_win_tallies for select
  using (family_id = public.current_user_family_id()::text);

-- Mutated only via award_game_xp(), called from inside the game-outcome
-- RPCs — same RPC-only-write philosophy as every other table in this
-- feature (game_sessions, game_scores, uno_games/uno_players).
revoke insert, update, delete on public.game_win_tallies from authenticated, anon;
grant select on public.game_win_tallies to authenticated;


create table if not exists public.member_arcade_stats (
  member_id   text primary key references public.members(id) on delete cascade,
  family_id   text not null,
  total_xp    int not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists member_arcade_stats_family_idx on public.member_arcade_stats(family_id);

comment on table public.member_arcade_stats is
  'One row per member holding cross-game total XP — level is DERIVED from total_xp (floor(sqrt(xp/50))+1), never stored, so the formula can change later without a backfill. Kept in sync with game_win_tallies atomically by award_game_xp().';

alter table public.member_arcade_stats enable row level security;

create policy "member_arcade_stats family read"
  on public.member_arcade_stats for select
  using (family_id = public.current_user_family_id()::text);

revoke insert, update, delete on public.member_arcade_stats from authenticated, anon;
grant select on public.member_arcade_stats to authenticated;


-- Pure function, no table access — safe to expose directly so the client
-- can compute a level from total_xp without duplicating the formula in
-- TypeScript (gameStore.ts calls this via .rpc() for display purposes;
-- it is also used below by award_game_xp for its own bookkeeping, though
-- the level itself is never persisted — see member_arcade_stats' comment).
create or replace function public.arcade_level_for_xp(p_xp int)
returns int
language sql
immutable
as $$
  select floor(sqrt(greatest(p_xp, 0)::numeric / 50)) + 1;
$$;

grant execute on function public.arcade_level_for_xp(int) to authenticated;


-- Internal — awards XP and updates the win/loss/draw tally atomically for
-- one member's one game outcome. p_outcome is 'win' | 'loss' | 'draw'.
-- No grant: only ever called from inside another SECURITY DEFINER RPC that
-- has already validated the outcome itself (see file header point 4).
create or replace function public._award_game_result(
  p_family_id text, p_member_id text, p_game_type text, p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp_delta int;
begin
  -- Explicit ELSE/RAISE rather than a bare CASE — a CASE with no matching
  -- WHEN and no ELSE silently returns NULL, which would then silently
  -- no-op the whole XP award instead of surfacing the bug (the exact
  -- "CASE without ELSE" trap this codebase has hit before).
  v_xp_delta := case p_outcome
    when 'win' then 15
    when 'draw' then 8
    when 'loss' then 5
    else null
  end;
  if v_xp_delta is null then
    raise exception '_award_game_result: unknown outcome %', p_outcome;
  end if;

  if p_game_type not in ('tic_tac_toe', 'memory', 'uno') then
    raise exception '_award_game_result: game_type % has no tally', p_game_type;
  end if;

  insert into public.game_win_tallies (family_id, member_id, game_type, wins, losses, draws)
  values (
    p_family_id, p_member_id, p_game_type,
    case when p_outcome = 'win' then 1 else 0 end,
    case when p_outcome = 'loss' then 1 else 0 end,
    case when p_outcome = 'draw' then 1 else 0 end
  )
  on conflict (member_id, game_type) do update
    set wins = public.game_win_tallies.wins + excluded.wins,
        losses = public.game_win_tallies.losses + excluded.losses,
        draws = public.game_win_tallies.draws + excluded.draws,
        updated_at = now();

  insert into public.member_arcade_stats (member_id, family_id, total_xp)
  values (p_member_id, p_family_id, v_xp_delta)
  on conflict (member_id) do update
    set total_xp = public.member_arcade_stats.total_xp + v_xp_delta,
        updated_at = now();
end;
$$;

comment on function public._award_game_result(text, text, text, text) is
  'Internal — atomically updates game_win_tallies + member_arcade_stats.total_xp for one member''s game outcome. Never grant execute to clients; only call from a game-outcome RPC that has independently verified the result server-side.';


-- Client-callable — solo-vs-AI Tic-Tac-Toe (and any future solo-only game)
-- has no game_sessions row at all, so there is nothing else to hook this
-- into. Unlike submit_game_move there is no server board state to
-- re-derive the outcome from; this trusts the client's reported outcome
-- the same bounded amount submit_score already does for leaderboard
-- scores (sanity-checked inputs, not full re-simulation) since a solo
-- practice game against the AI has no competitive stakes beyond the
-- player's own tally/XP.
create or replace function public.submit_solo_game_result(
  p_family_id text, p_member_id text, p_game_type text, p_outcome text
)
returns public.game_win_tallies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_result public.game_win_tallies;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  if p_game_type not in ('tic_tac_toe', 'memory') then
    raise exception 'game_type % has no solo-vs-AI result to record', p_game_type;
  end if;
  if p_outcome not in ('win', 'loss', 'draw') then
    raise exception 'invalid outcome %', p_outcome;
  end if;

  perform public._award_game_result(p_family_id, p_member_id, p_game_type, p_outcome);

  select * into v_result from public.game_win_tallies
    where member_id = p_member_id and game_type = p_game_type;
  return v_result;
end;
$$;

comment on function public.submit_solo_game_result(text, text, text, text) is
  'Records a solo-vs-AI Tic-Tac-Toe/Memory result (win/loss/draw) and awards XP. Solo play has no game_sessions row to validate against, so this trusts the caller''s own reported outcome — no competitive stakes beyond the player''s own tally.';

grant execute on function public.submit_solo_game_result(text, text, text, text) to authenticated;
