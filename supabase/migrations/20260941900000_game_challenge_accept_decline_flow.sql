-- Family Games — challenge lifecycle for game_sessions (Tic-Tac-Toe/Memory
-- multiplayer). Mirrors chore_handoff_accept_flow.sql's three-function
-- offer/accept/decline shape, but — unlike that migration — cross-checks
-- every caller-identity parameter against resolve_active_member_id()
-- (claim_pool_quest's stricter pattern, not chore-handoff's looser one):
-- a game has real competitive stakes, so "submit a move/accept a
-- challenge as a DIFFERENT family member than the one actually driving
-- this session" is a real cheat vector worth closing, unlike a household
-- chore where the two roles being conflated is low-stakes.
create or replace function public.create_game_challenge(
  p_family_id text, p_game_type text, p_difficulty text,
  p_challenger_id text, p_challenged_id text
)
returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_result public.game_sessions;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_challenger_id then
    raise exception 'caller is not member %', p_challenger_id;
  end if;

  if p_challenger_id = p_challenged_id then
    raise exception 'cannot challenge yourself';
  end if;

  if p_game_type not in ('tic_tac_toe', 'memory') then
    raise exception 'game_type % is not a 2-player challenge game', p_game_type;
  end if;

  -- Avoid duplicate spam-challenges — one pending challenge at a time
  -- between the same two members for the same game.
  if exists (
    select 1 from public.game_sessions
    where game_type = p_game_type
      and status = 'pending'
      and ((challenger_id = p_challenger_id and challenged_id = p_challenged_id)
        or (challenger_id = p_challenged_id and challenged_id = p_challenger_id))
  ) then
    raise exception 'a pending % challenge already exists between these two members', p_game_type;
  end if;

  insert into public.game_sessions (
    family_id, game_type, mode, difficulty, challenger_id, challenged_id, status
  ) values (
    p_family_id, p_game_type, 'multiplayer', p_difficulty, p_challenger_id, p_challenged_id, 'pending'
  )
  returning * into v_result;

  return v_result;
end;
$$;

-- Challenged member accepts: status -> 'active', initializes board_state
-- for the game_type, challenger always goes first (simple, consistent
-- rule — the person who initiated plays first).
create or replace function public.accept_game_challenge(p_session_id text, p_member_id text)
returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_result public.game_sessions;
  v_board jsonb;
  v_pair_count int;
  v_cards jsonb;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_result from public.game_sessions where id = p_session_id for update;
  if v_result.id is null then
    raise exception 'game session % not found', p_session_id;
  end if;
  if v_result.challenged_id is distinct from p_member_id then
    raise exception 'session % has no pending challenge to member %', p_session_id, p_member_id;
  end if;
  if v_result.status != 'pending' then
    raise exception 'session % is not pending (status=%)', p_session_id, v_result.status;
  end if;

  if v_result.game_type = 'tic_tac_toe' then
    v_board := jsonb_build_object('cells', jsonb_build_array(
      null, null, null, null, null, null, null, null, null
    ));
  else
    -- memory: pair_count driven by difficulty (easy=6, medium=8, hard=12),
    -- matching the client's own grid sizing (4x3/4x4/6x4). Cards are
    -- shuffled server-side so neither player's client ever independently
    -- computes (and could manipulate) the deck order.
    v_pair_count := case v_result.difficulty
      when 'easy' then 6 when 'medium' then 8 when 'hard' then 12
    end;
    select jsonb_agg(
      jsonb_build_object('id', ord - 1, 'pairId', (ord - 1) % v_pair_count, 'faceUp', false, 'matchedBy', null)
      order by random()
    ) into v_cards
    from generate_series(1, v_pair_count * 2) as ord;
    v_board := jsonb_build_object('cards', v_cards, 'flippedIds', '[]'::jsonb);
  end if;

  update public.game_sessions
    set status = 'active',
        board_state = v_board,
        current_turn_member_id = v_result.challenger_id,
        started_at = now(),
        move_count = 0,
        time_limit_seconds = case
          when v_result.game_type = 'memory' and v_result.difficulty = 'medium' then 90
          when v_result.game_type = 'memory' and v_result.difficulty = 'hard' then 120
          else null
        end,
        updated_at = now()
    where id = p_session_id
    returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.decline_game_challenge(p_session_id text, p_member_id text)
returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_member_id text;
  v_result public.game_sessions;
begin
  v_active_member_id := public.resolve_active_member_id();
  if v_active_member_id is null or v_active_member_id is distinct from p_member_id then
    raise exception 'caller is not member %', p_member_id;
  end if;

  select * into v_result from public.game_sessions where id = p_session_id for update;
  if v_result.id is null then
    raise exception 'game session % not found', p_session_id;
  end if;
  if v_result.challenged_id is distinct from p_member_id then
    raise exception 'session % has no pending challenge to member %', p_session_id, p_member_id;
  end if;
  if v_result.status != 'pending' then
    raise exception 'session % is not pending (status=%)', p_session_id, v_result.status;
  end if;

  update public.game_sessions
    set status = 'declined', updated_at = now()
    where id = p_session_id
    returning * into v_result;

  return v_result;
end;
$$;

comment on function public.create_game_challenge(text, text, text, text, text) is 'Creates a pending 2-player game challenge (Tic-Tac-Toe/Memory). Raises on self-challenge or a duplicate pending challenge between the same pair.';
comment on function public.accept_game_challenge(text, text) is 'Challenged member accepts — initializes board_state for the game_type/difficulty, challenger goes first.';
comment on function public.decline_game_challenge(text, text) is 'Challenged member declines — no board changes.';

grant execute on function public.create_game_challenge(text, text, text, text, text) to authenticated;
grant execute on function public.accept_game_challenge(text, text) to authenticated;
grant execute on function public.decline_game_challenge(text, text) to authenticated;
