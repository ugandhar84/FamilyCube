-- Found via local-Postgres testing (applying only the COMMITTED migration
-- files to a fresh database): play_uno_card/draw_uno_card write
-- `updated_at = now()` into uno_players, but no committed migration ever
-- adds that column to uno_players' CREATE TABLE
-- (20260941700000_create_uno_tables.sql has no updated_at for this
-- table). Replaying migrations from scratch fails outright with "column
-- \"updated_at\" of relation \"uno_players\" does not exist."
--
-- Turned out to be schema DRIFT, not a live bug: querying the actual
-- production database confirmed the column already exists there (added
-- out-of-band, outside any committed migration, at some undocumented
-- point). This migration is idempotent (`if not exists`) and simply
-- documents/backfills that already-live column into the migration
-- history, so a fresh environment built from migrations alone (a new
-- Supabase project, a local dev stack) matches production instead of
-- hitting this exact error.
alter table public.uno_players add column if not exists updated_at timestamptz not null default now();

-- Re-create play_uno_card/draw_uno_card exactly as they are in
-- 20260962000000_uno_realtime_broadcast.sql (the latest version, which
-- includes the _broadcast_uno_update calls) — no other logic changed,
-- only the now-valid updated_at column reference.
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
