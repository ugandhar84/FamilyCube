-- Uno had no way to leave a table at all — unlike Tic-Tac-Toe/Memory's
-- leave_game (1v1 forfeit), Uno's resume card only ever offered
-- "Resume Game," with no way to walk away from a stale/unwanted table
-- [live-reported: "why there is no leave option on the resume card"].
--
-- Ends the WHOLE table for every seated player rather than handing the
-- leaving player's seat to AI — simpler, matches how a real card game
-- breaks up when someone walks away, and avoids entangling this fix with
-- the existing AI-turn logic's own turn-order assumptions.
create or replace function public.leave_uno_game(p_game_id text, p_member_id text)
returns public.uno_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_game public.uno_games;
  v_player public.uno_players;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_game from public.uno_games where id = p_game_id for update;
  if v_game.id is null then
    raise exception 'uno game % not found', p_game_id;
  end if;
  if v_game.status not in ('lobby', 'active') then
    raise exception 'game % is not lobby/active (status=%)', p_game_id, v_game.status;
  end if;

  select * into v_player from public.uno_players where game_id = p_game_id and member_id = p_member_id;
  if v_player.id is null then
    raise exception 'member % is not seated in game %', p_member_id, p_game_id;
  end if;

  update public.uno_games set status = 'abandoned', updated_at = now()
    where id = p_game_id
    returning * into v_game;

  perform public._broadcast_uno_update(p_game_id);
  return v_game;
end;
$$;

comment on function public.leave_uno_game(text, text) is
  'Ends an Uno table for every seated player when one of them leaves — no AI takeover, matches leave_game''s own forfeit-ends-it-for-everyone shape for the 1v1 games.';

grant execute on function public.leave_uno_game(text, text) to authenticated;
