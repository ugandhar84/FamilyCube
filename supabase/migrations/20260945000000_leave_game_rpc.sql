-- Family Games — lets a player in an ACTIVE multiplayer session explicitly
-- leave/forfeit. Previously there was no way to end a game in progress at
-- all: the only exit was the shared ArcadeScreen back chevron, which just
-- calls router.back() with no store action, no status change, and no
-- notification to the opponent (live-reported: "if the other person should
-- fore exit from the game if he lost the intrest inbetween and that let
-- tha other player also know that he is no longer in the game").
--
-- Sets status straight to 'abandoned' (not a 30-minute grace window —
-- that window is for a SILENT disconnect, handled by the sweep's own
-- inactivity check in game-challenge-sweep/index.ts, not an explicit
-- "I'm done" tap) and records who left as the loser via winner_id, so the
-- remaining player's UI can show a clear "X left the game" result instead
-- of an ambiguous still-active board.
create or replace function public.leave_game(p_session_id text, p_member_id text)
returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_result public.game_sessions;
  v_opponent_id text;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_result from public.game_sessions where id = p_session_id for update;
  if v_result.id is null then
    raise exception 'game session % not found', p_session_id;
  end if;
  if v_result.challenger_id is distinct from p_member_id and v_result.challenged_id is distinct from p_member_id then
    raise exception 'member % is not a participant in session %', p_member_id, p_session_id;
  end if;
  if v_result.status != 'active' then
    raise exception 'session % is not active (status=%)', p_session_id, v_result.status;
  end if;

  v_opponent_id := case when v_result.challenger_id = p_member_id then v_result.challenged_id else v_result.challenger_id end;

  update public.game_sessions
    set status = 'abandoned',
        winner_id = v_opponent_id,
        result = null,
        current_turn_member_id = null,
        completed_at = now(),
        updated_at = now()
    where id = p_session_id
    returning * into v_result;

  return v_result;
end;
$$;

comment on function public.leave_game(text, text) is 'A participant explicitly leaves/forfeits an active session — sets status to abandoned immediately and credits the opponent as winner, distinct from the 30-minute silent-disconnect sweep timeout.';

grant execute on function public.leave_game(text, text) to authenticated;
