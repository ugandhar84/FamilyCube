-- Family Games — writes one game_scores row (Snake, always solo; solo-vs-
-- AI Memory). Sanity-bounds the submitted score/detail fields server-side
-- rather than trusting an arbitrary client-computed number outright —
-- this is a family leaderboard, not a security-critical value, so the
-- bar here is "reject obviously-impossible input," not full re-derivation
-- of the score formula (unlike submit_game_move, which fully re-derives
-- game state — a leaderboard number has no further consequence beyond
-- display ordering, so that level of rigor isn't warranted here).
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

comment on function public.submit_score(text, text, text, text, int, int, int, int, int, text) is
  'Writes one game_scores row for Snake or solo-vs-AI Memory. If p_session_id is given, verifies it is the caller''s own completed solo_ai session for this game_type before accepting.';

grant execute on function public.submit_score(text, text, text, text, int, int, int, int, int, text) to authenticated;
