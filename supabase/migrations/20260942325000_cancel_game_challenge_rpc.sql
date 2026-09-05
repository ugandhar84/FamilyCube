-- Family Games — lets the CHALLENGER cancel their own outgoing pending
-- challenge. decline_game_challenge already exists but only the challenged
-- member can call it (checks p_member_id = challenged_id) — there was no
-- way for the person who SENT a challenge to back out of it, so a stale
-- pending challenge (e.g. the challenged member never opens the app) sat
-- untouched for the full 24h expiry window with the challenger seeing
-- nothing but "a pending challenge already exists between these two
-- members" on every retry, no cancel option anywhere in the UI.
create or replace function public.cancel_game_challenge(p_session_id text, p_member_id text)
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
  if v_result.challenger_id is distinct from p_member_id then
    raise exception 'member % did not create session %', p_member_id, p_session_id;
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

comment on function public.cancel_game_challenge(text, text) is 'Challenger cancels their own outgoing pending challenge — reuses the declined status since there is no functional difference downstream.';

grant execute on function public.cancel_game_challenge(text, text) to authenticated;
