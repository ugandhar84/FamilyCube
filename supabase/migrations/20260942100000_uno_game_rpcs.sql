-- Family Games — Uno gameplay RPCs. A standard Uno deck is 108 cards:
-- per color (red/yellow/green/blue) one 0, two each of 1-9, two Skip, two
-- Reverse, two Draw Two = 19 cards/color x 4 colors = 76, plus 4 Wild and
-- 4 Wild Draw Four = 108 total.
--
-- Card shape (jsonb): { "color": "red"|"yellow"|"green"|"blue"|"wild",
--                        "value": "0".."9"|"skip"|"reverse"|"draw2"|"wild"|"wild4" }
--
-- Same caller-identity discipline as the Tic-Tac-Toe/Memory RPCs
-- (resolve_active_member_id() cross-checked against every p_member_id,
-- not trusted from the client outright) — a card game has the same
-- competitive-stakes reasoning for closing that gap.

create or replace function public._build_shuffled_uno_deck()
returns jsonb
language sql
as $$
  select jsonb_agg(card order by random())
  from (
    -- One 0, two each 1-9, two Skip/Reverse/Draw2, per color.
    select jsonb_build_object('color', color, 'value', value) as card
    from (values ('red'),('yellow'),('green'),('blue')) as colors(color)
    cross join lateral (
      select '0' as value
      union all select v::text from generate_series(1,9) as v, generate_series(1,2)
      union all select 'skip' from generate_series(1,2)
      union all select 'reverse' from generate_series(1,2)
      union all select 'draw2' from generate_series(1,2)
    ) as values_per_color
    union all
    -- 4 Wild, 4 Wild Draw Four.
    select jsonb_build_object('color', 'wild', 'value', v)
    from (select 'wild' as v from generate_series(1,4) union all select 'wild4' from generate_series(1,4)) as wilds
  ) as deck(card);
$$;

comment on function public._build_shuffled_uno_deck() is
  'Internal helper — a fresh, shuffled 108-card Uno deck. Not exposed to clients directly (no grant); only called from create_uno_game.';

-- Creates a game + player rows for a mix of human members and AI seats,
-- shuffles a fresh deck, deals 7 cards/player, flips the first discard
-- (re-drawing if it's a Wild/Wild Draw Four — house rule: the opening
-- card is never a wild, avoiding an undefined "who picks the color"
-- moment before anyone has even taken a turn), and goes straight to
-- 'active' once at least 2 seats are filled (never stays in 'lobby' since
-- callers supply the full seat list up front — no separate join-in-
-- progress flow for v1).
create or replace function public.create_uno_game(
  p_family_id text, p_created_by text,
  p_human_member_ids text[], p_ai_difficulties text[]
)
returns public.uno_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_game public.uno_games;
  v_deck jsonb;
  v_seat int := 0;
  v_member_id text;
  v_difficulty text;
  v_hand jsonb;
  v_first_discard jsonb;
  v_total_seats int;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_created_by then
    raise exception 'caller is not member %', p_created_by;
  end if;

  -- NULL-safe guards, explicit and up front — an all-AI table (no human
  -- seats at all) is never a valid Uno game, and every downstream check
  -- (the creator-is-seated check, the 2-4 seat-count check, the FOREACH
  -- dealing loop) silently no-ops or skips on a NULL array rather than
  -- erroring, per Postgres's NULL-propagation rules — `array_length(NULL,1)`
  -- is NULL (not 0), `x = any(NULL)` is NULL (not false), and
  -- `FOREACH ... IN ARRAY NULL` iterates zero times without complaint. Left
  -- unguarded, a NULL p_human_member_ids call would silently create a
  -- human-less game with no seat-count validation at all, with created_by
  -- pointing at a member seated nowhere in it.
  if p_human_member_ids is null or array_length(p_human_member_ids, 1) is null then
    raise exception 'at least one human seat is required';
  end if;
  if not (p_created_by = any(p_human_member_ids)) then
    raise exception 'creator % must be one of the human seats', p_created_by;
  end if;

  v_total_seats := array_length(p_human_member_ids, 1) + coalesce(array_length(p_ai_difficulties, 1), 0);
  if v_total_seats < 2 or v_total_seats > 4 then
    raise exception 'uno needs 2-4 total seats, got %', v_total_seats;
  end if;

  v_deck := public._build_shuffled_uno_deck();

  insert into public.uno_games (family_id, status, created_by, draw_pile, discard_pile)
  values (p_family_id, 'active', p_created_by, '[]'::jsonb, '[]'::jsonb)
  returning * into v_game;

  -- Deal 7 cards/player off the top of v_deck (last element = "top", same
  -- append-only convention as draw_pile/discard_pile), tracking the
  -- consumed count so we can slice the remainder in one go afterward.
  foreach v_member_id in array p_human_member_ids loop
    v_hand := (select jsonb_agg(c) from (select c from jsonb_array_elements(v_deck) with ordinality as t(c, ord) order by ord desc limit 7) s(c));
    v_deck := (select jsonb_agg(c) from (select c from jsonb_array_elements(v_deck) with ordinality as t(c, ord) order by ord desc offset 7) s(c));
    insert into public.uno_players (game_id, seat, member_id, is_ai, hand)
    values (v_game.id, v_seat, v_member_id, false, v_hand);
    v_seat := v_seat + 1;
  end loop;

  if p_ai_difficulties is not null then
    foreach v_difficulty in array p_ai_difficulties loop
      v_hand := (select jsonb_agg(c) from (select c from jsonb_array_elements(v_deck) with ordinality as t(c, ord) order by ord desc limit 7) s(c));
      v_deck := (select jsonb_agg(c) from (select c from jsonb_array_elements(v_deck) with ordinality as t(c, ord) order by ord desc offset 7) s(c));
      insert into public.uno_players (game_id, seat, is_ai, ai_difficulty, hand)
      values (v_game.id, v_seat, true, v_difficulty, v_hand);
      v_seat := v_seat + 1;
    end loop;
  end if;

  -- Flip the first discard — re-draw from the deck if it's a Wild/Wild
  -- Draw Four (house rule, see header comment) rather than looping
  -- indefinitely on bad luck; 4 wild4 + 4 wild out of a ~80-card remaining
  -- deck after dealing makes repeated re-draws practically impossible, but
  -- the loop is bounded defensively anyway.
  loop
    v_first_discard := (select c from jsonb_array_elements(v_deck) with ordinality as t(c, ord) order by ord desc limit 1);
    v_deck := (select jsonb_agg(c) from (select c from jsonb_array_elements(v_deck) with ordinality as t(c, ord) order by ord desc offset 1) s(c));
    exit when v_first_discard->>'color' != 'wild' or jsonb_array_length(v_deck) = 0;
    -- Put the rejected wild back at the bottom (front) and keep drawing.
    v_deck := jsonb_build_array(v_first_discard) || v_deck;
  end loop;

  update public.uno_games
    set draw_pile = coalesce(v_deck, '[]'::jsonb),
        discard_pile = jsonb_build_array(v_first_discard),
        current_turn_seat = 0,
        updated_at = now()
    where id = v_game.id
    returning * into v_game;

  return v_game;
end;
$$;

-- Applies special-card effects and advances current_turn_seat by
-- direction. p_chosen_color is required (and only meaningful) when the
-- played card is a Wild/Wild Draw Four.
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

  -- Legality check: card must actually be in hand, and must match the
  -- top-of-discard's color/value (accounting for an active wild color) or
  -- be a Wild/Wild Draw Four itself.
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

  -- NULL-safe: `p_chosen_color not in (...)` alone evaluates to NULL (not
  -- true) when p_chosen_color is NULL — its own default — so `IF` would
  -- silently treat the whole condition as false and skip this check
  -- entirely for the single most common way a client forgets to pass a
  -- color. That let a wild card get played with active_wild_color left
  -- NULL, after which every future legality check's
  -- `coalesce(active_wild_color, top_card_color)` fell back to the top
  -- card's own color — literally 'wild' for a wild card — permanently
  -- softlocking the game to "only wild cards are ever legal again" until
  -- someone happened to hold one. The explicit `is null or` makes the
  -- missing-color case its own true branch instead of an accidental NULL.
  if (p_card->>'color' = 'wild') and (p_chosen_color is null or p_chosen_color not in ('red','yellow','green','blue')) then
    raise exception 'a color must be chosen when playing a wild card';
  end if;

  -- Remove the played card from hand, push it onto discard.
  v_hand := (select jsonb_agg(c) from jsonb_array_elements(v_hand) with ordinality as t(c, ord) where ord - 1 != v_card_idx);
  update public.uno_players set hand = coalesce(v_hand, '[]'::jsonb), updated_at = now() where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);

  -- Empty hand: this player just won. No further turn advancement needed.
  if jsonb_array_length(coalesce(v_hand, '[]'::jsonb)) = 0 then
    update public.uno_games
      set discard_pile = v_game.discard_pile || jsonb_build_array(p_card),
          status = 'completed', winner_id = p_member_id,
          active_wild_color = case when p_card->>'color' = 'wild' then p_chosen_color else null end,
          updated_at = now()
      where id = p_game_id
      returning * into v_game;
    return v_game;
  end if;

  -- Special-card effects. direction only flips on Reverse; Skip/Draw2/
  -- Draw4 all skip exactly one additional seat beyond the normal advance
  -- (Draw2/Draw4 additionally stack a pending draw penalty rather than
  -- resolving it immediately — the next player can play their own
  -- matching Draw card to pass the stacked total further along, or must
  -- draw the accumulated total if they can't/don't).
  v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;

  if p_card->>'value' = 'reverse' then
    update public.uno_games set direction = direction * -1 where id = p_game_id;
    select * into v_game from public.uno_games where id = p_game_id;
    v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;
    -- In a 2-player game, Reverse acts like a Skip (turn comes right back
    -- to the same player who played it) — standard Uno house rule.
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

-- A player with no legal play (or choosing not to play one they have)
-- draws. If pending_draw_count > 0 (a Draw Two/Four is owed), draws that
-- entire stacked amount at once and the turn passes immediately — this
-- house rule variant does not let a Draw-card recipient "pass along" the
-- penalty by playing their own Draw card AFTER already drawing; passing
-- along only works by playing a matching Draw card via play_uno_card
-- BEFORE calling draw_uno_card at all (matches how the play/draw split is
-- exposed to the client — draw_uno_card is always a terminal action for
-- the current turn, never followed by a play in the same turn once a
-- penalty was owed).
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
      -- Reshuffle: everything except the current top-of-discard becomes
      -- the new draw pile.
      v_top := v_discard->(jsonb_array_length(v_discard) - 1);
      v_draw_pile := (
        select jsonb_agg(c order by random())
        from jsonb_array_elements(v_discard) with ordinality as t(c, ord)
        where ord - 1 != jsonb_array_length(v_discard) - 1
      );
      v_discard := jsonb_build_array(v_top);
      if v_draw_pile is null or jsonb_array_length(v_draw_pile) = 0 then
        exit; -- genuinely no cards left anywhere — deal with fewer than requested
      end if;
    end if;
    v_card := v_draw_pile->(jsonb_array_length(v_draw_pile) - 1);
    v_draw_pile := (select jsonb_agg(c) from jsonb_array_elements(v_draw_pile) with ordinality as t(c, ord) where ord - 1 != jsonb_array_length(v_draw_pile) - 1);
    v_drawn := v_drawn || jsonb_build_array(v_card);
  end loop;

  update public.uno_players set hand = v_player.hand || v_drawn, updated_at = now() where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);
  v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;

  update public.uno_games
    set draw_pile = v_draw_pile, discard_pile = v_discard,
        pending_draw_count = 0, current_turn_seat = v_next_seat,
        updated_at = now()
    where id = p_game_id
    returning * into v_game;

  return v_game;
end;
$$;

-- Marks a player as having declared "UNO" (down to one card). Purely a
-- flag for other players/AI to react to (e.g. challenge a missed call in
-- a future ruleset pass) — v1 does not yet enforce a draw-two penalty for
-- forgetting to call it before someone else notices, tracked as a
-- follow-up rather than blocking this migration.
create or replace function public.call_uno(p_game_id text, p_member_id text)
returns public.uno_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_player public.uno_players;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_player from public.uno_players where game_id = p_game_id and member_id = p_member_id for update;
  if v_player.id is null then
    raise exception 'member % is not seated in game %', p_member_id, p_game_id;
  end if;

  update public.uno_players set has_called_uno = true where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;

comment on function public.create_uno_game(text, text, text[], text[]) is
  'Creates an Uno table (2-4 seats: named human members + AI seats by difficulty), shuffles/deals a fresh 108-card deck, flips a non-wild opening discard.';
comment on function public.play_uno_card(text, text, jsonb, text) is
  'Turn- and legality-validated card play. Applies Skip/Reverse/Draw2/Wild4 effects and advances current_turn_seat by direction. Sets status=completed on an empty hand.';
comment on function public.draw_uno_card(text, text) is
  'Draws pending_draw_count cards (or 1 if none owed), reshuffling discard-minus-top into the draw pile if it runs out. Always ends the caller''s turn.';
comment on function public.call_uno(text, text) is
  'Flags a player as having declared UNO at one card remaining.';

grant execute on function public.create_uno_game(text, text, text[], text[]) to authenticated;
grant execute on function public.play_uno_card(text, text, jsonb, text) to authenticated;
grant execute on function public.draw_uno_card(text, text) to authenticated;
grant execute on function public.call_uno(text, text) to authenticated;
