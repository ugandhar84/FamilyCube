-- Family Games — the core turn-validated move-submission RPC for
-- game_sessions (Tic-Tac-Toe/Memory multiplayer). Re-validates everything
-- server-side (turn order, move legality, win/draw/match detection) rather
-- than trusting the client's own local game logic, which only exists for
-- instant UI feedback/AI opponents — the server copy is the actual source
-- of truth two racing/rushed clients can't desync.
--
-- p_move shape:
--   tic_tac_toe: { "cell": 0-8 }
--   memory:      { "cardId": 0-23 }   -- one flip per call; the CLIENT
--                                        calls this twice per human turn
--                                        (once per card), matching how a
--                                        real player flips one card, sees
--                                        it, then flips a second
create or replace function public.submit_game_move(
  p_session_id text, p_member_id text, p_move jsonb
)
returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_result public.game_sessions;
  v_cells jsonb;
  v_cell_idx int;
  v_symbol text;
  v_winner_symbol text;
  v_cards jsonb;
  v_flipped jsonb;
  v_card_id int;
  v_card jsonb;
  v_first_card jsonb;
  v_second_card jsonb;
  v_all_matched boolean;
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
  if v_result.status != 'active' then
    raise exception 'session % is not active (status=%)', p_session_id, v_result.status;
  end if;
  if v_result.current_turn_member_id is distinct from p_member_id then
    raise exception 'it is not member %''s turn', p_member_id;
  end if;

  v_opponent_id := case when v_result.challenger_id = p_member_id then v_result.challenged_id else v_result.challenger_id end;

  if v_result.game_type = 'tic_tac_toe' then
    v_cell_idx := (p_move->>'cell')::int;
    if v_cell_idx is null or v_cell_idx < 0 or v_cell_idx > 8 then
      raise exception 'invalid cell %', p_move->>'cell';
    end if;
    v_cells := v_result.board_state->'cells';
    if v_cells->v_cell_idx is not null and v_cells->v_cell_idx != 'null'::jsonb then
      raise exception 'cell % is already occupied', v_cell_idx;
    end if;

    -- Challenger always plays 'X', challenged always plays 'O' — fixed at
    -- accept time (challenger goes first), no separate symbol column needed.
    v_symbol := case when p_member_id = v_result.challenger_id then 'X' else 'O' end;
    v_cells := jsonb_set(v_cells, array[v_cell_idx::text], to_jsonb(v_symbol));

    -- Win check: all 8 lines (rows, columns, diagonals), explicit
    -- enumeration — clearer and less error-prone than trying to be clever
    -- with generate_series here.
    v_winner_symbol := (
      select l.sym from (
        values
          (v_cells->>0, v_cells->>1, v_cells->>2),
          (v_cells->>3, v_cells->>4, v_cells->>5),
          (v_cells->>6, v_cells->>7, v_cells->>8),
          (v_cells->>0, v_cells->>3, v_cells->>6),
          (v_cells->>1, v_cells->>4, v_cells->>7),
          (v_cells->>2, v_cells->>5, v_cells->>8),
          (v_cells->>0, v_cells->>4, v_cells->>8),
          (v_cells->>2, v_cells->>4, v_cells->>6)
      ) as lines(a, b, c)
      cross join lateral (select a as sym) as l
      where a is not null and a = b and b = c
      limit 1
    );

    if v_winner_symbol is not null then
      update public.game_sessions
        set board_state = jsonb_set(v_result.board_state, '{cells}', v_cells),
            status = 'completed', result = 'win',
            winner_id = p_member_id, completed_at = now(),
            current_turn_member_id = null,
            move_count = coalesce(v_result.move_count, 0) + 1,
            updated_at = now()
        where id = p_session_id
        returning * into v_result;
    elsif (
      select bool_and(v is not null and v != 'null'::jsonb)
      from jsonb_array_elements(v_cells) as v
    ) then
      -- Board full, no winner: draw.
      update public.game_sessions
        set board_state = jsonb_set(v_result.board_state, '{cells}', v_cells),
            status = 'completed', result = 'draw',
            completed_at = now(), current_turn_member_id = null,
            move_count = coalesce(v_result.move_count, 0) + 1,
            updated_at = now()
        where id = p_session_id
        returning * into v_result;
    else
      update public.game_sessions
        set board_state = jsonb_set(v_result.board_state, '{cells}', v_cells),
            current_turn_member_id = v_opponent_id,
            move_count = coalesce(v_result.move_count, 0) + 1,
            updated_at = now()
        where id = p_session_id
        returning * into v_result;
    end if;

    return v_result;
  end if;

  -- ── memory ──────────────────────────────────────────────────────────────
  v_card_id := (p_move->>'cardId')::int;
  if v_card_id is null then
    raise exception 'invalid cardId %', p_move->>'cardId';
  end if;

  v_cards := v_result.board_state->'cards';
  v_card := (select c from jsonb_array_elements(v_cards) as c where (c->>'id')::int = v_card_id);
  if v_card is null then
    raise exception 'card % not found', v_card_id;
  end if;
  if (v_card->>'faceUp')::boolean or v_card->>'matchedBy' is not null then
    raise exception 'card % is already face up or matched', v_card_id;
  end if;

  v_flipped := v_result.board_state->'flippedIds';

  if jsonb_array_length(v_flipped) = 0 then
    -- First flip of the turn: just flip it, keep the same player's turn.
    v_cards := (
      select jsonb_agg(case when (c->>'id')::int = v_card_id then jsonb_set(c, '{faceUp}', 'true') else c end)
      from jsonb_array_elements(v_cards) as c
    );
    update public.game_sessions
      set board_state = jsonb_build_object('cards', v_cards, 'flippedIds', jsonb_build_array(v_card_id)),
          move_count = coalesce(v_result.move_count, 0) + 1,
          updated_at = now()
      where id = p_session_id
      returning * into v_result;
    return v_result;
  end if;

  -- Second flip of the turn: resolve match/no-match.
  v_cards := (
    select jsonb_agg(case when (c->>'id')::int = v_card_id then jsonb_set(c, '{faceUp}', 'true') else c end)
    from jsonb_array_elements(v_cards) as c
  );
  v_first_card := (select c from jsonb_array_elements(v_cards) as c where (c->>'id')::int = (v_flipped->>0)::int);
  v_second_card := (select c from jsonb_array_elements(v_cards) as c where (c->>'id')::int = v_card_id);

  if (v_first_card->>'pairId') = (v_second_card->>'pairId') then
    -- Match: both cards marked matchedBy this player, SAME player's turn
    -- continues (standard Memory rule — a match earns another turn).
    v_cards := (
      select jsonb_agg(
        case when (c->>'id')::int in ((v_flipped->>0)::int, v_card_id)
          then jsonb_set(c, '{matchedBy}', to_jsonb(p_member_id))
          else c end
      )
      from jsonb_array_elements(v_cards) as c
    );
    v_all_matched := (select bool_and(c->>'matchedBy' is not null) from jsonb_array_elements(v_cards) as c);

    if v_all_matched then
      declare
        v_my_pairs int := (select count(*) filter (where c->>'matchedBy' = p_member_id) from jsonb_array_elements(v_cards) as c);
        v_opp_pairs int := (select count(*) filter (where c->>'matchedBy' = v_opponent_id) from jsonb_array_elements(v_cards) as c);
      begin
        update public.game_sessions
          set board_state = jsonb_build_object('cards', v_cards, 'flippedIds', '[]'::jsonb),
              status = 'completed',
              result = case when v_my_pairs = v_opp_pairs then 'tie' else 'win' end,
              winner_id = case when v_my_pairs = v_opp_pairs then null
                               when v_my_pairs > v_opp_pairs then p_member_id
                               else v_opponent_id end,
              completed_at = now(), current_turn_member_id = null,
              move_count = coalesce(v_result.move_count, 0) + 1,
              updated_at = now()
          where id = p_session_id
          returning * into v_result;
      end;
    else
      update public.game_sessions
        set board_state = jsonb_build_object('cards', v_cards, 'flippedIds', '[]'::jsonb),
            move_count = coalesce(v_result.move_count, 0) + 1,
            updated_at = now()
        where id = p_session_id
        returning * into v_result;
    end if;
  else
    -- No match: flip both back face-down, turn passes to the opponent.
    v_cards := (
      select jsonb_agg(
        case when (c->>'id')::int in ((v_flipped->>0)::int, v_card_id)
          then jsonb_set(c, '{faceUp}', 'false')
          else c end
      )
      from jsonb_array_elements(v_cards) as c
    );
    update public.game_sessions
      set board_state = jsonb_build_object('cards', v_cards, 'flippedIds', '[]'::jsonb),
          current_turn_member_id = v_opponent_id,
          move_count = coalesce(v_result.move_count, 0) + 1,
          updated_at = now()
      where id = p_session_id
      returning * into v_result;
  end if;

  return v_result;
end;
$$;

comment on function public.submit_game_move(text, text, jsonb) is
  'Turn- and move-legality-validated move submission for Tic-Tac-Toe/Memory. Re-derives win/draw/match state server-side rather than trusting the client.';

grant execute on function public.submit_game_move(text, text, jsonb) to authenticated;
