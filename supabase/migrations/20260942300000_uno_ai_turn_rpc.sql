-- Family Games — server-side Uno AI turn resolution. AI seats have no
-- member_id and no client ever sees an AI seat's hand: uno_players_public
-- redacts `hand` to everyone except the row matching the CALLER's own
-- active member id (by design — see 20260941700000's own security
-- comment), and an AI seat's member_id is null, so no client's identity
-- can ever match it. That means no client has enough information to
-- decide (let alone submit) a legal move on an AI seat's behalf — the
-- decision has to happen here, with real access to the hand.
--
-- Any authenticated family member seated at the table may call this for
-- the CURRENT turn's seat, but only if that seat is actually AI and it is
-- actually that seat's turn — this mirrors client behavior where whichever
-- device notices it's an AI's turn (via the same 2s poll driving realtime
-- elsewhere in Family Games) is the one that "drives" the AI, and a second
-- device noticing moments later simply finds the turn has already moved
-- on. Difficulty logic is a deliberately simplified server-side mirror of
-- unoAI.ts's own three-tier logic (easy/medium/hard) — not copy-paste
-- identical since PL/pgSQL and TypeScript can't share code, but the same
-- shape: easy=first legal card, medium=prefer action cards, hard=prefer
-- disrupting whichever opponent has the fewest cards.
create or replace function public.play_uno_ai_turn(p_game_id text)
returns public.uno_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_game public.uno_games;
  v_ai_player public.uno_players;
  v_hand jsonb;
  v_top jsonb;
  v_effective_color text;
  v_legal jsonb;
  v_chosen jsonb;
  v_chosen_color text;
  v_leader_seat int;
  v_leader_count int;
  v_disruptive jsonb;
  v_non_action jsonb;
begin
  -- Caller must be a real, currently-seated family member of this game
  -- (not necessarily the AI seat itself, which has no member_id) — this
  -- just proves "some legitimate player at this table is driving the AI",
  -- same trust boundary as every other game RPC in this schema.
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null then
    raise exception 'no active member';
  end if;
  if not exists (
    select 1 from public.uno_players where game_id = p_game_id and member_id = v_active_member_id
  ) then
    raise exception 'caller is not seated in game %', p_game_id;
  end if;

  select * into v_game from public.uno_games where id = p_game_id for update;
  if v_game.id is null then
    raise exception 'uno game % not found', p_game_id;
  end if;
  if v_game.status != 'active' then
    raise exception 'game % is not active (status=%)', p_game_id, v_game.status;
  end if;

  select * into v_ai_player from public.uno_players where game_id = p_game_id and seat = v_game.current_turn_seat for update;
  if v_ai_player.id is null or v_ai_player.is_ai is not true then
    raise exception 'seat % is not an AI seat', v_game.current_turn_seat;
  end if;

  v_hand := v_ai_player.hand;
  v_top := v_game.discard_pile->(jsonb_array_length(v_game.discard_pile) - 1);
  v_effective_color := coalesce(v_game.active_wild_color, v_top->>'color');

  -- Legal cards: same rule as play_uno_card's own check (wild always
  -- legal; otherwise color or value must match).
  v_legal := (
    select coalesce(jsonb_agg(c), '[]'::jsonb)
    from jsonb_array_elements(v_hand) as c
    where c->>'color' = 'wild' or c->>'color' = v_effective_color or c->>'value' = v_top->>'value'
  );

  if jsonb_array_length(v_legal) = 0 then
    -- No legal card — draw via the exact same RPC a human would use, just
    -- invoked here with the AI's own identity context bypassed (we call
    -- its logic inline rather than recursing into draw_uno_card, since
    -- that RPC re-validates p_member_id against resolve_active_member_id()
    -- which would reject an AI seat's null member_id).
    perform public._draw_uno_card_internal(p_game_id, v_ai_player.id);
    select * into v_game from public.uno_games where id = p_game_id;
    return v_game;
  end if;

  if v_ai_player.ai_difficulty = 'easy' then
    v_chosen := v_legal->0;
  elsif v_ai_player.ai_difficulty = 'medium' then
    v_non_action := (
      select c from jsonb_array_elements(v_legal) as c
      where c->>'value' in ('skip','reverse','draw2','wild4') limit 1
    );
    v_chosen := coalesce(v_non_action, v_legal->0);
  else
    -- hard: prefer a disruptive card (skip/draw2/wild4) if the leading
    -- opponent (fewest cards among OTHER seats) has 3 or fewer cards.
    select p.seat, jsonb_array_length(p.hand) into v_leader_seat, v_leader_count
    from public.uno_players p
    where p.game_id = p_game_id and p.id != v_ai_player.id
    order by jsonb_array_length(p.hand) asc
    limit 1;

    v_disruptive := (
      select c from jsonb_array_elements(v_legal) as c
      where c->>'value' in ('skip','draw2','wild4') limit 1
    );
    if v_leader_count is not null and v_leader_count <= 3 and v_disruptive is not null then
      v_chosen := v_disruptive;
    else
      v_non_action := (
        select c from jsonb_array_elements(v_legal) as c
        where c->>'color' != 'wild' and c->>'value' not in ('skip','reverse','draw2','wild4') limit 1
      );
      v_chosen := coalesce(v_non_action, v_legal->0);
    end if;
  end if;

  if v_chosen->>'color' = 'wild' then
    -- Choose the most common real color remaining in hand AFTER this card
    -- is removed (mirrors unoAI.ts's mostCommonColor over the remaining
    -- hand); ties broken by red/yellow/green/blue order.
    select c->>'color' into v_chosen_color
    from jsonb_array_elements(v_hand) as c, jsonb_array_elements_text('["red","yellow","green","blue"]'::jsonb) as pref(color)
    where c->>'color' = pref.color and c != v_chosen
    group by c->>'color'
    order by count(*) desc,
      array_position(array['red','yellow','green','blue'], c->>'color')
    limit 1;
    v_chosen_color := coalesce(v_chosen_color, 'red');
  end if;

  perform public._play_uno_card_internal(p_game_id, v_ai_player.id, v_chosen, v_chosen_color);
  select * into v_game from public.uno_games where id = p_game_id;
  return v_game;
end;
$$;

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
    where id = p_game_id;
end;
$$;

comment on function public.play_uno_ai_turn(text) is
  'Resolves the current AI seat''s turn server-side (the only place an AI seat''s hand is ever readable) — any seated family member may trigger it, but only when it is genuinely an AI seat''s turn.';

grant execute on function public.play_uno_ai_turn(text) to authenticated;
