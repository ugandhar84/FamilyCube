-- Fix: accept_game_challenge's Memory pair-count CASE had no ELSE — caught
-- by an independent review pass, same class of bug as a similar Uno RPC
-- fix earlier this session (a bare CASE with no matching branch and no
-- ELSE returns NULL rather than raising). Concretely: if difficulty were
-- ever anything other than exactly 'easy'/'medium'/'hard' (a typo, or a
-- future value added to the CHECK constraint without a matching update
-- here), v_pair_count silently became NULL, generate_series(1, NULL)
-- silently returned zero rows, and the session activated anyway with a
-- null card deck — an unplayable game with no error raised anywhere near
-- the actual root cause. difficulty IS check-constrained at the table
-- level to exactly these three values today, so this should be
-- unreachable in practice; the fix exists purely so it fails loudly and
-- immediately at accept time instead of silently corrupting the game if
-- that ever changes.
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
    if v_result.difficulty = 'easy' then v_pair_count := 6;
    elsif v_result.difficulty = 'medium' then v_pair_count := 8;
    elsif v_result.difficulty = 'hard' then v_pair_count := 12;
    else
      raise exception 'unknown memory difficulty %', v_result.difficulty;
    end if;

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

grant execute on function public.accept_game_challenge(text, text) to authenticated;
