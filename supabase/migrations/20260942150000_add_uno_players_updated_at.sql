-- Fix: uno_players was missing updated_at (every other mutable table in
-- this schema has one) — caught by testing play_uno_card/draw_uno_card
-- against a real Postgres instance before shipping: both RPCs write
-- `updated_at = now()` on a hand update, which fails outright against the
-- live schema (column does not exist).
alter table public.uno_players
  add column if not exists updated_at timestamptz not null default now();

-- Recreate uno_players_public to also expose it (was created before this
-- column existed).
drop view if exists public.uno_players_public;

create view public.uno_players_public as
  select
    p.id, p.game_id, p.seat, p.member_id, p.is_ai, p.ai_difficulty, p.has_called_uno,
    p.created_at, p.updated_at,
    jsonb_array_length(p.hand) as hand_count,
    case
      when p.member_id = public.resolve_active_member_id() then p.hand
      else null
    end as hand
  from public.uno_players p
  join public.uno_games g on g.id = p.game_id
  where g.family_id = public.current_user_family_id()::text;

grant select on public.uno_players_public to authenticated;
