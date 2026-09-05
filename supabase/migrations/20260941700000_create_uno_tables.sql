-- Family Games feature — Uno (2-4 players, human seats + AI-filled seats).
-- Genuinely different shape from game_sessions (N seats, per-player hands,
-- turn direction, a shared draw/discard pile) rather than a 2-player
-- challenge/board — a dedicated table pair fits better than forcing this
-- into game_sessions' 2-player shape.
--
-- Same type conventions as game_sessions.sql / verified-live
-- information_schema findings: id/family_id/member FKs all text.
create table if not exists public.uno_games (
  id                  text primary key default gen_random_uuid()::text,
  family_id           text not null,

  status              text not null default 'lobby'
    check (status in ('lobby', 'active', 'completed', 'abandoned')),

  -- +1 clockwise (seat order ascending), -1 after a Reverse card.
  direction           int not null default 1 check (direction in (1, -1)),
  current_turn_seat   int not null default 0,

  -- Remaining deck (shuffled) and played pile — top of discard_pile is
  -- discard_pile[jsonb_array_length(discard_pile)-1], not index 0, to keep
  -- both piles append-only (push new cards on top rather than unshift).
  draw_pile           jsonb not null default '[]'::jsonb,
  discard_pile        jsonb not null default '[]'::jsonb,

  -- Stacked Draw Two/Draw Four penalty owed to whoever's turn is next —
  -- house rule support for chaining Draw cards before someone finally
  -- draws the accumulated total.
  pending_draw_count  int not null default 0,

  -- Only meaningful when the top discard card is a Wild/Wild Draw Four —
  -- the color the player who dropped it chose.
  active_wild_color   text check (active_wild_color in ('red', 'yellow', 'green', 'blue')),

  winner_id           text references public.members(id) on delete set null,
  created_by          text not null references public.members(id) on delete cascade,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.uno_players (
  id                text primary key default gen_random_uuid()::text,
  game_id           text not null references public.uno_games(id) on delete cascade,
  seat              int not null,  -- 0-3, turn order (advances by uno_games.direction)

  -- Exactly one of member_id / is_ai=true is meaningful per row — a human
  -- seat has member_id set and is_ai=false; an AI-filled seat has
  -- member_id null, is_ai=true, and ai_difficulty set.
  member_id         text references public.members(id) on delete cascade,
  is_ai             boolean not null default false,
  ai_difficulty     text check (ai_difficulty in ('easy', 'medium', 'hard')),

  hand              jsonb not null default '[]'::jsonb,
  has_called_uno    boolean not null default false,

  created_at        timestamptz not null default now(),

  unique (game_id, seat),
  check (
    (is_ai = true and member_id is null and ai_difficulty is not null)
    or (is_ai = false and member_id is not null and ai_difficulty is null)
  )
);

create index if not exists uno_players_game_idx on public.uno_players(game_id);
create index if not exists uno_games_family_status_idx on public.uno_games(family_id, status);

comment on table public.uno_games is
  'One Uno table — 2-4 seats (uno_players), shared draw/discard piles, turn direction. Mutated only via play_uno_card/draw_uno_card/call_uno RPCs.';
comment on column public.uno_games.discard_pile is
  'Append-only — the top (currently active) card is the LAST element, not the first.';
comment on table public.uno_players is
  'One seat at an uno_games table. Exactly one of (member_id, is_ai) is set per the CHECK constraint — a human player or an AI-filled seat, never both/neither.';

-- No RLS policies granting select on the base tables at all — this repo
-- already hit and fixed exactly this trap once (see
-- 20260930190000_calendar_connections_grant_select_fix.sql): a
-- `security_invoker` view checks the base table's own grant BEFORE RLS
-- ever evaluates, so a view with security_invoker=true over a table with
-- no grant to `authenticated` returns nothing for every real user, no
-- matter how permissive its RLS policy looks. The proven fix used
-- throughout this codebase is the opposite of security_invoker: a plain
-- view (runs as its OWNER, who has full table access regardless of the
-- authenticated/anon revoke below) that does its OWN explicit family-scope
-- filtering in its WHERE clause, with select granted on the VIEW only,
-- never the base table. That also happens to be exactly what's needed
-- here anyway for a different reason — column-level redaction (hiding
-- other seats' hand contents / draw_pile order) — since RLS can only
-- restrict which ROWS are visible, never which columns, and both problems
-- need the same "read through a view, not the table" answer.
alter table public.uno_games enable row level security;
alter table public.uno_players enable row level security;
revoke all on public.uno_games from authenticated, anon;
revoke all on public.uno_players from authenticated, anon;

-- Full hand only for the row matching the CALLER's own active member id;
-- every other seat gets hand_count only (still enough to render opponents'
-- card-backs by count) and hand as null. Family-scoped via its own join to
-- uno_games rather than relying on any RLS policy underneath (there is
-- none — see comment above).
create view public.uno_players_public as
  select
    p.id, p.game_id, p.seat, p.member_id, p.is_ai, p.ai_difficulty, p.has_called_uno, p.created_at,
    jsonb_array_length(p.hand) as hand_count,
    case
      when p.member_id = public.resolve_active_member_id() then p.hand
      else null
    end as hand
  from public.uno_players p
  join public.uno_games g on g.id = p.game_id
  where g.family_id = public.current_user_family_id()::text;

grant select on public.uno_players_public to authenticated;

-- draw_pile's card ORDER must stay hidden — reading it directly would let
-- any player see exactly what they (and everyone else) is about to draw,
-- the deck-equivalent of the hand-visibility problem above. Only
-- discard_pile (already-played, public information) is safe to expose
-- as-is; draw_pile is replaced with just its count. Same explicit
-- family-scope filter as uno_players_public, same reason.
create view public.uno_games_public as
  select
    id, family_id, status, direction, current_turn_seat,
    jsonb_array_length(draw_pile) as draw_pile_count,
    discard_pile, pending_draw_count, active_wild_color,
    winner_id, created_by, created_at, updated_at
  from public.uno_games
  where family_id = public.current_user_family_id()::text;

grant select on public.uno_games_public to authenticated;
