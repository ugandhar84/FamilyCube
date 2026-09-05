-- Hardens submit_score against the exact bug just cleaned up in
-- 20260942425000: a completed solo Memory round with memory_moves = 0 but
-- a nonzero score is impossible under real play (finishing requires
-- flipping cards, which always increments the player's own move count) —
-- it can only ever be a scoring-formula bug on the client, the same class
-- already found once. submit_score previously only sanity-checked
-- p_score >= 0 (a deliberate choice, since a leaderboard number has no
-- further consequence beyond display ordering) — this adds the one
-- additional narrow, high-confidence check that would have caught this
-- specific bug at the source instead of only after a user noticed a
-- leaderboard entry that didn't add up.
create or replace function public.submit_score(
  p_family_id text, p_member_id text, p_game_type text, p_difficulty text,
  p_score int,
  p_snake_length int default null, p_snake_food_eaten int default null,
  p_memory_moves int default null, p_memory_time_seconds int default null,
  p_session_id text default null
)
returns public.game_scores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_result public.game_scores;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  if p_game_type not in ('snake', 'memory') then
    raise exception 'game_type % has no leaderboard', p_game_type;
  end if;
  if p_score < 0 then
    raise exception 'score cannot be negative';
  end if;
  if p_game_type = 'memory' and coalesce(p_memory_moves, 0) = 0 and p_score > 0 then
    raise exception 'a completed memory round with zero moves cannot have a nonzero score';
  end if;

  -- A solo Memory score tied to a real session must actually BE that
  -- member's own completed solo_ai session for this game/difficulty —
  -- prevents attaching a fabricated score to someone else's session id,
  -- or to a multiplayer session (multiplayer Memory results live in
  -- game_sessions only, never the leaderboard — see game_scores.sql's own
  -- header comment).
  if p_session_id is not null then
    if not exists (
      select 1 from public.game_sessions
      where id = p_session_id
        and game_type = p_game_type
        and mode = 'solo_ai'
        and challenger_id = p_member_id
        and status = 'completed'
    ) then
      raise exception 'session % is not a completed solo game for member %', p_session_id, p_member_id;
    end if;
  end if;

  insert into public.game_scores (
    family_id, member_id, game_type, difficulty, score,
    snake_length, snake_food_eaten, memory_moves, memory_time_seconds, session_id
  ) values (
    p_family_id, p_member_id, p_game_type, p_difficulty, p_score,
    p_snake_length, p_snake_food_eaten, p_memory_moves, p_memory_time_seconds, p_session_id
  )
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.submit_score(text, text, text, text, int, int, int, int, int, text) to authenticated;
