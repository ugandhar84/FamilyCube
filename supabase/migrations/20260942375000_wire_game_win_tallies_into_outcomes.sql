-- Wires _award_game_result (20260942350000) into every EXISTING
-- multiplayer win/draw branch. This is a NEW migration that
-- `create or replace function`s the three already-applied RPCs below —
-- per this repo's own rule, an applied migration file is never edited in
-- place, so the full (unchanged-except-for-the-new-tally-calls) bodies are
-- redefined here rather than touching 20260942000000/20260942100000/
-- 20260942300000 directly.
--
-- Tic-Tac-Toe/Memory multiplayer (submit_game_move): both participants get
-- a tally row on 'win'/'draw' branches — the loser's row is just as
-- important as the winner's (a member's loss count is part of their own
-- tally), so both challenger and opponent are awarded here, never just the
-- caller.
--
-- Uno (play_uno_card / _play_uno_card_internal): on the winning play, EVERY
-- other HUMAN seat at the table is tallied as a loss (an AI seat has no
-- member_id, so it's simply skipped — see uno_players' own is_ai/member_id
-- CHECK constraint). Uno has no draw outcome (exactly one winner always).

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

    v_symbol := case when p_member_id = v_result.challenger_id then 'X' else 'O' end;
    v_cells := jsonb_set(v_cells, array[v_cell_idx::text], to_jsonb(v_symbol));

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
      perform public._award_game_result(v_result.family_id, p_member_id, 'tic_tac_toe', 'win');
      perform public._award_game_result(v_result.family_id, v_opponent_id, 'tic_tac_toe', 'loss');
    elsif (
      select bool_and(v is not null and v != 'null'::jsonb)
      from jsonb_array_elements(v_cells) as v
    ) then
      update public.game_sessions
        set board_state = jsonb_set(v_result.board_state, '{cells}', v_cells),
            status = 'completed', result = 'draw',
            completed_at = now(), current_turn_member_id = null,
            move_count = coalesce(v_result.move_count, 0) + 1,
            updated_at = now()
        where id = p_session_id
        returning * into v_result;
      perform public._award_game_result(v_result.family_id, p_member_id, 'tic_tac_toe', 'draw');
      perform public._award_game_result(v_result.family_id, v_opponent_id, 'tic_tac_toe', 'draw');
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

  v_cards := (
    select jsonb_agg(case when (c->>'id')::int = v_card_id then jsonb_set(c, '{faceUp}', 'true') else c end)
    from jsonb_array_elements(v_cards) as c
  );
  v_first_card := (select c from jsonb_array_elements(v_cards) as c where (c->>'id')::int = (v_flipped->>0)::int);
  v_second_card := (select c from jsonb_array_elements(v_cards) as c where (c->>'id')::int = v_card_id);

  if (v_first_card->>'pairId') = (v_second_card->>'pairId') then
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

        if v_my_pairs = v_opp_pairs then
          perform public._award_game_result(v_result.family_id, p_member_id, 'memory', 'draw');
          perform public._award_game_result(v_result.family_id, v_opponent_id, 'memory', 'draw');
        elsif v_my_pairs > v_opp_pairs then
          perform public._award_game_result(v_result.family_id, p_member_id, 'memory', 'win');
          perform public._award_game_result(v_result.family_id, v_opponent_id, 'memory', 'loss');
        else
          perform public._award_game_result(v_result.family_id, v_opponent_id, 'memory', 'win');
          perform public._award_game_result(v_result.family_id, p_member_id, 'memory', 'loss');
        end if;
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
  'Turn- and move-legality-validated move submission for Tic-Tac-Toe/Memory. Re-derives win/draw/match state server-side rather than trusting the client. Awards game_win_tallies/XP to both participants on completion (20260942375000).';


-- ── Uno ──────────────────────────────────────────────────────────────────

create or replace function public.play_uno_card(
  p_game_id text, p_member_id text, p_card jsonb, p_chosen_color text default null
)
returns public.uno_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_game public.uno_games;
  v_player public.uno_players;
  v_top jsonb;
  v_hand jsonb;
  v_card_idx int;
  v_seat_count int;
  v_next_seat int;
  v_loser record;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_game from public.uno_games where id = p_game_id for update;
  if v_game.id is null then
    raise exception 'uno game % not found', p_game_id;
  end if;
  if v_game.status != 'active' then
    raise exception 'game % is not active (status=%)', p_game_id, v_game.status;
  end if;

  select * into v_player from public.uno_players where game_id = p_game_id and member_id = p_member_id for update;
  if v_player.id is null then
    raise exception 'member % is not seated in game %', p_member_id, p_game_id;
  end if;
  if v_player.seat != v_game.current_turn_seat then
    raise exception 'it is seat %''s turn, not seat %', v_game.current_turn_seat, v_player.seat;
  end if;

  v_hand := v_player.hand;
  v_card_idx := (
    select ord - 1 from jsonb_array_elements(v_hand) with ordinality as t(c, ord)
    where c->>'color' = p_card->>'color' and c->>'value' = p_card->>'value'
    limit 1
  );
  if v_card_idx is null then
    raise exception 'card not in hand';
  end if;

  v_top := v_game.discard_pile->(jsonb_array_length(v_game.discard_pile) - 1);
  if not (
    p_card->>'color' = 'wild'
    or p_card->>'color' = coalesce(v_game.active_wild_color, v_top->>'color')
    or p_card->>'value' = v_top->>'value'
  ) then
    raise exception 'card does not match the top of the discard pile';
  end if;

  if (p_card->>'color' = 'wild') and (p_chosen_color is null or p_chosen_color not in ('red','yellow','green','blue')) then
    raise exception 'a color must be chosen when playing a wild card';
  end if;

  v_hand := (select jsonb_agg(c) from jsonb_array_elements(v_hand) with ordinality as t(c, ord) where ord - 1 != v_card_idx);
  update public.uno_players set hand = coalesce(v_hand, '[]'::jsonb), updated_at = now() where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);

  if jsonb_array_length(coalesce(v_hand, '[]'::jsonb)) = 0 then
    update public.uno_games
      set discard_pile = v_game.discard_pile || jsonb_build_array(p_card),
          status = 'completed', winner_id = p_member_id,
          active_wild_color = case when p_card->>'color' = 'wild' then p_chosen_color else null end,
          updated_at = now()
      where id = p_game_id
      returning * into v_game;

    perform public._award_game_result(v_game.family_id, p_member_id, 'uno', 'win');
    -- Every OTHER human seat at the table is a loss — AI seats (member_id
    -- is null per the is_ai/member_id CHECK constraint) are skipped, they
    -- have no tally row to award.
    for v_loser in
      select member_id from public.uno_players
      where game_id = p_game_id and member_id is not null and member_id != p_member_id
    loop
      perform public._award_game_result(v_game.family_id, v_loser.member_id, 'uno', 'loss');
    end loop;

    return v_game;
  end if;

  v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;

  if p_card->>'value' = 'reverse' then
    update public.uno_games set direction = direction * -1 where id = p_game_id;
    select * into v_game from public.uno_games where id = p_game_id;
    v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;
    if v_seat_count = 2 then
      v_next_seat := v_game.current_turn_seat;
    end if;
  elsif p_card->>'value' = 'skip' then
    v_next_seat := (v_next_seat + v_game.direction + v_seat_count) % v_seat_count;
  elsif p_card->>'value' = 'draw2' then
    update public.uno_games set pending_draw_count = pending_draw_count + 2 where id = p_game_id;
  elsif p_card->>'value' = 'wild4' then
    update public.uno_games set pending_draw_count = pending_draw_count + 4 where id = p_game_id;
  end if;

  update public.uno_games
    set discard_pile = v_game.discard_pile || jsonb_build_array(p_card),
        current_turn_seat = v_next_seat,
        active_wild_color = case when p_card->>'color' = 'wild' then p_chosen_color else null end,
        updated_at = now()
    where id = p_game_id
    returning * into v_game;

  return v_game;
end;
$$;

comment on function public.play_uno_card(text, text, jsonb, text) is
  'Turn- and legality-validated card play. Applies Skip/Reverse/Draw2/Wild4 effects and advances current_turn_seat by direction. Sets status=completed on an empty hand. Awards game_win_tallies/XP to the winner and every other human seat on completion (20260942375000).';


-- Internal helpers factored out of play_uno_card/draw_uno_card's own logic
-- so play_uno_ai_turn can apply the identical state transitions without
-- going through resolve_active_member_id()-based caller identity checks
-- (an AI seat has no member_id/auth identity of its own to check against).
-- Not exposed to clients — no grant.
create or replace function public._play_uno_card_internal(
  p_game_id text, p_player_id text, p_card jsonb, p_chosen_color text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.uno_games;
  v_player public.uno_players;
  v_hand jsonb;
  v_card_idx int;
  v_seat_count int;
  v_next_seat int;
  v_loser record;
begin
  select * into v_game from public.uno_games where id = p_game_id for update;
  select * into v_player from public.uno_players where id = p_player_id for update;

  v_hand := v_player.hand;
  v_card_idx := (
    select ord - 1 from jsonb_array_elements(v_hand) with ordinality as t(c, ord)
    where c->>'color' = p_card->>'color' and c->>'value' = p_card->>'value'
    limit 1
  );
  if v_card_idx is null then
    raise exception 'ai card not in hand';
  end if;

  v_hand := (select jsonb_agg(c) from jsonb_array_elements(v_hand) with ordinality as t(c, ord) where ord - 1 != v_card_idx);
  update public.uno_players set hand = coalesce(v_hand, '[]'::jsonb), updated_at = now() where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);

  if jsonb_array_length(coalesce(v_hand, '[]'::jsonb)) = 0 then
    update public.uno_games
      set discard_pile = v_game.discard_pile || jsonb_build_array(p_card),
          status = 'completed', winner_id = null,
          active_wild_color = case when p_card->>'color' = 'wild' then p_chosen_color else null end,
          updated_at = now()
      where id = p_game_id;

    -- The AI seat just won — it has no member_id/tally row of its own
    -- (see uno_players' is_ai/member_id CHECK constraint), but every HUMAN
    -- seat at the table just lost and gets a loss tallied.
    for v_loser in
      select member_id from public.uno_players
      where game_id = p_game_id and member_id is not null
    loop
      perform public._award_game_result(v_game.family_id, v_loser.member_id, 'uno', 'loss');
    end loop;

    return;
  end if;

  v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;

  if p_card->>'value' = 'reverse' then
    update public.uno_games set direction = direction * -1 where id = p_game_id;
    select * into v_game from public.uno_games where id = p_game_id;
    v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;
    if v_seat_count = 2 then
      v_next_seat := v_game.current_turn_seat;
    end if;
  elsif p_card->>'value' = 'skip' then
    v_next_seat := (v_next_seat + v_game.direction + v_seat_count) % v_seat_count;
  elsif p_card->>'value' = 'draw2' then
    update public.uno_games set pending_draw_count = pending_draw_count + 2 where id = p_game_id;
  elsif p_card->>'value' = 'wild4' then
    update public.uno_games set pending_draw_count = pending_draw_count + 4 where id = p_game_id;
  end if;

  update public.uno_games
    set discard_pile = v_game.discard_pile || jsonb_build_array(p_card),
        current_turn_seat = v_next_seat,
        active_wild_color = case when p_card->>'color' = 'wild' then p_chosen_color else null end,
        updated_at = now()
    where id = p_game_id;
end;
$$;

-- draw_uno_card / call_uno are unchanged by this migration (drawing/calling
-- UNO never ends the game) — no need to redefine them here.

grant execute on function public.submit_game_move(text, text, jsonb) to authenticated;
grant execute on function public.play_uno_card(text, text, jsonb, text) to authenticated;
