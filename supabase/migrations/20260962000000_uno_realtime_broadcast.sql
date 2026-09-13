-- Uno realtime — was a 2-second client-side setInterval poll
-- (store/gameStore.ts's ensureUnoRealtime), not real-time at all, because
-- uno_games/uno_players deliberately carry zero grants for authenticated
-- (see 20260941700000_create_uno_tables.sql's own header comment) —
-- Supabase's postgres_changes realtime evaluates a subscriber's SELECT
-- grant against the BASE TABLE before RLS ever runs, and postgres_changes
-- cannot subscribe to a VIEW at all (it has no independent WAL entries),
-- so the existing uno_games_public/uno_players_public redaction views
-- were never an option for push-based realtime either.
--
-- Fix: Supabase Realtime's Broadcast feature (realtime.send, SQL-callable)
-- doesn't depend on WAL/table grants at all — the RPC itself explicitly
-- pushes a message to a channel after committing its own write, same
-- trust boundary as the RPC's own security definer + resolve_active_
-- member_id() check that already gates the write itself. Callers
-- subscribe to `uno:{game_id}` and re-fetch through the existing
-- redaction views on receipt — the broadcast payload itself carries only
-- non-sensitive fields (game id + updated_at), never hand contents, so a
-- family member who is NOT seated at this table but somehow guessed its
-- id learns nothing from the broadcast alone; the actual data still comes
-- from uno_games_public/uno_players_public's own family/member scoping.
create or replace function public._broadcast_uno_update(p_game_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object('game_id', p_game_id, 'updated_at', now()),
    'uno_update',
    'uno:' || p_game_id,
    false
  );
end;
$$;

-- Re-create each RPC's tail to broadcast right before returning. Each
-- function already ends with `return v_game;` (play_uno_card,
-- draw_uno_card) or `return v_player;` (call_uno) — inserting the
-- broadcast call immediately before each existing return, no other logic
-- changed.
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
    perform public._broadcast_uno_update(p_game_id);
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

  perform public._broadcast_uno_update(p_game_id);
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
      v_draw_pile := (
        select jsonb_agg(c order by random())
        from jsonb_array_elements(v_discard) with ordinality as t(c, ord)
        where ord - 1 != jsonb_array_length(v_discard) - 1
      );
      v_discard := jsonb_build_array(v_top);
      if v_draw_pile is null or jsonb_array_length(v_draw_pile) = 0 then
        exit;
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

  perform public._broadcast_uno_update(p_game_id);
  return v_game;
end;
$$;

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
  perform public._broadcast_uno_update(p_game_id);
  return v_player;
end;
$$;

-- create_uno_game itself doesn't need a broadcast — the creator is the
-- only participant with the game_id before anyone else can be pointed at
-- it (via the existing uno_game_invite push), so there's no other
-- subscriber yet for it to reach.

grant execute on function public._broadcast_uno_update(text) to authenticated;
