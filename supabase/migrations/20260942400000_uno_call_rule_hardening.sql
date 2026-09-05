-- Hardens the real Uno "call UNO" rule, which previously existed only as
-- a cosmetic flag with zero enforcement (see call_uno's own prior comment:
-- "v1 does not yet enforce a draw-two penalty for forgetting to call it").
--
-- Real-Uno rule being implemented:
--   1. A player must call "UNO" after playing the card that brings them
--      down to exactly one card left — at any point before their NEXT
--      turn begins.
--   2. has_called_uno only means anything for the CURRENT one-card state —
--      drawing or playing invalidates a prior call (you can't call it once
--      and have it cover every future time you happen to hit one card).
--   3. Any other player can "catch" someone sitting at exactly one card
--      without a valid call and force them to draw 2 as a penalty.
--   4. call_uno itself should reject being called at any hand size other
--      than exactly one card — it was previously callable at any time,
--      which let a player "pre-call" before they were actually eligible.
--
-- play_uno_card and draw_uno_card are both redefined here (via `create or
-- replace function`, per this migration set's own rule: never edit an
-- already-applied migration file in place) purely to add
-- `has_called_uno = false` to their existing hand-mutating UPDATE
-- statements — no other logic in either function changes.

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

  -- has_called_uno resets on every play: whatever was true about the
  -- HAND SIZE before this card was played no longer applies once it's
  -- gone. A player who calls UNO at one card, then somehow ends up back
  -- at one card again later (e.g. after being forced to draw and playing
  -- back down) needs to call it again — the old call doesn't carry over.
  update public.uno_players set hand = coalesce(v_hand, '[]'::jsonb), has_called_uno = false, updated_at = now() where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);

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
        exit;
      end if;
    end if;
    v_card := v_draw_pile->(jsonb_array_length(v_draw_pile) - 1);
    v_draw_pile := coalesce((select jsonb_agg(c) from jsonb_array_elements(v_draw_pile) with ordinality as t(c, ord) where ord - 1 != jsonb_array_length(v_draw_pile) - 1), '[]'::jsonb);
    v_drawn := v_drawn || jsonb_build_array(v_card);
  end loop;

  -- Drawing always invalidates any standing call — you're no longer at
  -- the same one-card state (if you even were), so any earlier call no
  -- longer describes your hand.
  update public.uno_players set hand = v_player.hand || v_drawn, has_called_uno = false, updated_at = now() where id = v_player.id;

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

-- call_uno now actually validates hand size instead of accepting a call
-- at any time — you can only truthfully declare "I have one card" when
-- you genuinely do.
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
  if jsonb_array_length(v_player.hand) != 1 then
    raise exception 'can only call uno with exactly one card in hand (have %)', jsonb_array_length(v_player.hand);
  end if;

  update public.uno_players set has_called_uno = true where id = v_player.id returning * into v_player;
  return v_player;
end;
$$;

-- New: any OTHER seated player (human or, in principle, a client acting
-- for an AI seat — though AI seats never call this themselves) can catch
-- a player sitting at exactly one card who hasn't called it, forcing them
-- to draw a 2-card penalty. This is the real-Uno "gotcha" mechanic that
-- gives the UNO call actual stakes instead of being purely decorative.
create or replace function public.catch_missed_uno(p_game_id text, p_catcher_member_id text, p_target_player_id text)
returns public.uno_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_game public.uno_games;
  v_catcher public.uno_players;
  v_target public.uno_players;
  v_draw_pile jsonb;
  v_discard jsonb;
  v_top jsonb;
  v_drawn jsonb := '[]'::jsonb;
  v_i int;
  v_card jsonb;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_catcher_member_id then
    raise exception 'caller is not member %', p_catcher_member_id;
  end if;

  -- Lock uno_games FIRST, uno_players second — matching play_uno_card's/
  -- draw_uno_card's own lock order exactly. Locking uno_players before
  -- uno_games (the original draft here) let two concurrent calls against
  -- the same game — one playing/drawing, one catching — acquire the two
  -- tables' row locks in opposite orders, the classic Postgres deadlock
  -- setup. Same order everywhere means no cycle can form.
  select * into v_game from public.uno_games where id = p_game_id for update;
  if v_game.id is null then
    raise exception 'uno game % not found', p_game_id;
  end if;
  if v_game.status != 'active' then
    raise exception 'game % is not active (status=%)', p_game_id, v_game.status;
  end if;

  select * into v_catcher from public.uno_players where game_id = p_game_id and member_id = p_catcher_member_id;
  if v_catcher.id is null then
    raise exception 'catcher % is not seated in game %', p_catcher_member_id, p_game_id;
  end if;

  select * into v_target from public.uno_players where id = p_target_player_id and game_id = p_game_id for update;
  if v_target.id is null then
    raise exception 'target player % not found in game %', p_target_player_id, p_game_id;
  end if;
  if v_target.id = v_catcher.id then
    raise exception 'cannot catch yourself';
  end if;
  if jsonb_array_length(v_target.hand) != 1 then
    raise exception 'target does not have exactly one card (has %) — nothing to catch', jsonb_array_length(v_target.hand);
  end if;
  if v_target.has_called_uno then
    raise exception 'target already called uno — nothing to catch';
  end if;

  -- Draw 2 penalty cards for the target, same reshuffle-on-empty logic as
  -- draw_uno_card (duplicated here rather than shared since this doesn't
  -- advance the turn or touch pending_draw_count — a caught player simply
  -- gains 2 cards and their turn proceeds normally whenever it comes).
  -- v_game's draw_pile/discard_pile were already locked+fetched above.
  v_draw_pile := v_game.draw_pile;
  v_discard := v_game.discard_pile;

  for v_i in 1..2 loop
    if jsonb_array_length(v_draw_pile) = 0 then
      v_top := v_discard->(jsonb_array_length(v_discard) - 1);
      v_draw_pile := coalesce((
        select jsonb_agg(c order by random())
        from jsonb_array_elements(v_discard) with ordinality as t(c, ord)
        where ord - 1 != jsonb_array_length(v_discard) - 1
      ), '[]'::jsonb);
      v_discard := jsonb_build_array(v_top);
      if jsonb_array_length(v_draw_pile) = 0 then
        exit;
      end if;
    end if;
    v_card := v_draw_pile->(jsonb_array_length(v_draw_pile) - 1);
    v_draw_pile := coalesce((select jsonb_agg(c) from jsonb_array_elements(v_draw_pile) with ordinality as t(c, ord) where ord - 1 != jsonb_array_length(v_draw_pile) - 1), '[]'::jsonb);
    v_drawn := v_drawn || jsonb_build_array(v_card);
  end loop;

  update public.uno_players set hand = v_target.hand || v_drawn, has_called_uno = false, updated_at = now()
    where id = v_target.id
    returning * into v_target;

  update public.uno_games set draw_pile = coalesce(v_draw_pile, '[]'::jsonb), discard_pile = v_discard, updated_at = now()
    where id = p_game_id;

  return v_target;
end;
$$;

comment on function public.play_uno_card(text, text, jsonb, text) is
  'Turn- and legality-validated card play. Applies Skip/Reverse/Draw2/Wild4 effects, advances current_turn_seat by direction, and clears has_called_uno (a call never carries over past the hand it was made for). Sets status=completed on an empty hand.';
comment on function public.draw_uno_card(text, text) is
  'Draws pending_draw_count cards (or 1 if none owed), reshuffling discard-minus-top into the draw pile if it runs out, and clears has_called_uno. Always ends the caller''s turn.';
comment on function public.call_uno(text, text) is
  'Declares UNO — only valid with exactly one card in hand.';
comment on function public.catch_missed_uno(text, text, text) is
  'Any other seated player catches a target sitting at exactly one card without having called UNO, forcing a 2-card draw penalty.';

grant execute on function public.play_uno_card(text, text, jsonb, text) to authenticated;
grant execute on function public.draw_uno_card(text, text) to authenticated;
grant execute on function public.call_uno(text, text) to authenticated;
grant execute on function public.catch_missed_uno(text, text, text) to authenticated;

-- The two internal helpers backing play_uno_ai_turn (an AI seat has no
-- member_id/auth identity to call call_uno itself, so it can never
-- forget it — an AI auto-declares UNO the instant its own play brings it
-- to exactly one card, exactly as a correctly-programmed AI opponent
-- would; this also keeps human-vs-AI play fair, since a human could
-- otherwise farm free catch-penalties against an AI for a rules
-- technicality it has no way to react to itself).
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
  update public.uno_players
    set hand = coalesce(v_hand, '[]'::jsonb),
        has_called_uno = (jsonb_array_length(coalesce(v_hand, '[]'::jsonb)) = 1),
        updated_at = now()
    where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);

  if jsonb_array_length(coalesce(v_hand, '[]'::jsonb)) = 0 then
    update public.uno_games
      set discard_pile = v_game.discard_pile || jsonb_build_array(p_card),
          status = 'completed', winner_id = null,
          active_wild_color = case when p_card->>'color' = 'wild' then p_chosen_color else null end,
          updated_at = now()
      where id = p_game_id;
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

create or replace function public._draw_uno_card_internal(p_game_id text, p_player_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
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
  select * into v_game from public.uno_games where id = p_game_id for update;
  select * into v_player from public.uno_players where id = p_player_id for update;

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
        exit;
      end if;
    end if;
    v_card := v_draw_pile->(jsonb_array_length(v_draw_pile) - 1);
    v_draw_pile := coalesce((select jsonb_agg(c) from jsonb_array_elements(v_draw_pile) with ordinality as t(c, ord) where ord - 1 != jsonb_array_length(v_draw_pile) - 1), '[]'::jsonb);
    v_drawn := v_drawn || jsonb_build_array(v_card);
  end loop;

  update public.uno_players set hand = v_player.hand || v_drawn, has_called_uno = false, updated_at = now() where id = v_player.id;

  v_seat_count := (select count(*) from public.uno_players where game_id = p_game_id);
  v_next_seat := (v_game.current_turn_seat + v_game.direction + v_seat_count) % v_seat_count;

  update public.uno_games
    set draw_pile = coalesce(v_draw_pile, '[]'::jsonb), discard_pile = v_discard,
        pending_draw_count = 0, current_turn_seat = v_next_seat,
        updated_at = now()
    where id = p_game_id;
end;
$$;
