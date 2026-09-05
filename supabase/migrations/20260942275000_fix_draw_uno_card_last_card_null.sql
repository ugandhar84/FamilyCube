-- Fix: draw_uno_card's own draw-pile-shrinking loop can set v_draw_pile to
-- SQL NULL (not '[]'::jsonb) via `jsonb_agg(...) where ord-1 != ...` when
-- that WHERE excludes every remaining row — i.e. exactly when the card
-- just taken was the LAST one in the pile. jsonb_agg over zero input rows
-- returns NULL, not an empty array. The final `update uno_games set
-- draw_pile = v_draw_pile` then tries to write NULL into a NOT NULL
-- column and the whole draw fails outright — a real production bug that
-- would surface any time a player's draw happens to exhaust the pile down
-- to exactly zero cards (a realistic, not rare, event once a game runs
-- long enough), crashing what should be a routine draw. Caught while
-- building the new play_uno_ai_turn RPC, which shares this exact drawing
-- loop shape and hit the same failure immediately under scratch-DB
-- testing. Same class of NULL-propagation bug already fixed twice
-- elsewhere in this migration set (the Uno wild-color check, and
-- accept_game_challenge's missing-ELSE CASE) — jsonb_agg/array
-- aggregates over an empty set silently produce NULL rather than an empty
-- container, and every consumer needs its own explicit coalesce.
create or replace function public.draw_uno_card(p_game_id text, p_member_id text)
returns public.uno_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_game public.uno_games;
  v_player public.uno_players;
  v_draw_pile jsonb;
  v_discard jsonb;
  v_top jsonb;
  v_draw_count int;
  v_drawn jsonb := '[]'::jsonb;
  v_seat_count int;
  v_next_seat int;
  v_i int;
  v_card jsonb;
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

  v_draw_count := greatest(1, v_game.pending_draw_count);
  v_draw_pile := v_game.draw_pile;
  v_discard := v_game.discard_pile;

  for v_i in 1..v_draw_count loop
    if jsonb_array_length(v_draw_pile) = 0 then
      v_top := v_discard->(jsonb_array_length(v_discard) - 1);
      v_draw_pile := coalesce((
        select jsonb_agg(c order by random())
        from jsonb_array_elements(v_discard) with ordinality as t(c, ord)
        where ord - 1 != jsonb_array_length(v_discard) - 1
      ), '[]'::jsonb);
      v_discard := jsonb_build_array(v_top);
      if jsonb_array_length(v_draw_pile) = 0 then
        exit; -- genuinely no cards left anywhere — deal with fewer than requested
      end if;
    end if;
    v_card := v_draw_pile->(jsonb_array_length(v_draw_pile) - 1);
    v_draw_pile := coalesce((select jsonb_agg(c) from jsonb_array_elements(v_draw_pile) with ordinality as t(c, ord) where ord - 1 != jsonb_array_length(v_draw_pile) - 1), '[]'::jsonb);
    v_drawn := v_drawn || jsonb_build_array(v_card);
  end loop;

  update public.uno_players set hand = v_player.hand || v_drawn, updated_at = now() where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);
  v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;

  update public.uno_games
    set draw_pile = coalesce(v_draw_pile, '[]'::jsonb), discard_pile = v_discard,
        pending_draw_count = 0, current_turn_seat = v_next_seat,
        updated_at = now()
    where id = p_game_id
    returning * into v_game;

  return v_game;
end;
$$;

grant execute on function public.draw_uno_card(text, text) to authenticated;
