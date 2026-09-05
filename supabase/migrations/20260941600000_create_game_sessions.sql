-- Family Games feature — 2-player games (Tic-Tac-Toe, Memory). Covers both
-- a live challenge/accept/decline flow between two family members AND the
-- resulting active/completed game's board state. Solo-vs-AI play never
-- creates a row here at all (client-only state) — this table exists purely
-- for the multiplayer path.
--
-- Type conventions matched to what's already live (see
-- 20260817150000_responsibility_engine_phase1.sql's own verified-via-
-- information_schema header comment): id/family_id/member FKs are all text,
-- matching chore_tasks/calendar_events/members.id. family_id is a loose
-- text column (not a hard FK to families), RLS-scoped only, same as
-- chore_tasks.family_id/calendar_events.family_id.
create table if not exists public.game_sessions (
  id                     text primary key default gen_random_uuid()::text,
  family_id              text not null,
  game_type              text not null check (game_type in ('tic_tac_toe', 'memory')),
  mode                   text not null check (mode in ('solo_ai', 'multiplayer')),
  difficulty             text not null check (difficulty in ('easy', 'medium', 'hard')),

  challenger_id          text not null references public.members(id) on delete cascade,
  -- Null only transiently never happens in practice (a challenge always
  -- names its target) — kept nullable rather than not-null purely so a
  -- future "open challenge, anyone can accept" mode isn't a schema change.
  challenged_id          text references public.members(id) on delete cascade,

  status                 text not null default 'pending'
    check (status in ('pending', 'active', 'declined', 'completed', 'expired', 'abandoned')),

  -- Whose turn it is right now. Null before acceptance and after completion.
  current_turn_member_id text references public.members(id) on delete set null,

  -- tic_tac_toe: { cells: (null|'X'|'O')[9] }
  -- memory: { cards: {id,pairId,symbol,faceUp,matchedBy}[], flippedIds: number[] }
  board_state            jsonb not null default '{}'::jsonb,

  winner_id              text references public.members(id) on delete set null,
  result                 text check (result in ('win', 'draw', 'tie')),

  -- Memory-specific scoring inputs; null for tic_tac_toe rows.
  move_count             int,
  time_limit_seconds     int,

  started_at             timestamptz,
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Pending challenges auto-expire (stale_game_challenge_sweep_cron); a
  -- generous default so a genuinely slow-to-respond family member isn't
  -- punished, while a truly forgotten challenge doesn't linger forever.
  expires_at             timestamptz not null default (now() + interval '24 hours')
);

create index if not exists game_sessions_family_status_idx on public.game_sessions(family_id, status);
create index if not exists game_sessions_challenged_pending_idx on public.game_sessions(challenged_id, status) where status = 'pending';
create index if not exists game_sessions_challenger_pending_idx on public.game_sessions(challenger_id, status) where status = 'pending';

comment on table public.game_sessions is
  'A 2-player Tic-Tac-Toe or Memory game — challenge/accept/decline lifecycle plus live board state once active. Solo-vs-AI play never creates a row here.';
comment on column public.game_sessions.board_state is
  'Shape depends on game_type — see column comment history / gameStore.ts types for the current schema. Mutated only via submit_game_move (server-validated turn order + move legality).';

alter table public.game_sessions enable row level security;

-- current_user_family_id()/resolve_active_member_id() — NOT a raw
-- `family_id in (select ... where id = auth.uid())` join — is the correct,
-- verified-live pattern (see 20260926010000_fix_chore_tasks_rls_wrong_table.sql:
-- the naive auth.uid() join resolves to the WRONG family mid PIN-switch on
-- a shared device, since auth_user_id is identical across every member
-- profile under one login; resolve_active_member_id() is what actually
-- tracks which profile is active right now).
create policy "game_sessions family read"
  on public.game_sessions for select
  using (family_id = public.current_user_family_id()::text);

-- Direct client writes are intentionally NOT granted beyond select — every
-- state transition (create/accept/decline/move) goes through a
-- SECURITY DEFINER RPC (see game_challenge_accept_decline_flow.sql /
-- submit_game_move_rpc.sql) so turn-order and move-legality validation
-- can't be bypassed by a client calling .update() directly. This mirrors
-- chore_tasks' own guard-trigger philosophy, taken one step further since
-- these RPCs also need row-level compare-and-set (for update) semantics a
-- trigger alone can't express as cleanly as a function can.
revoke insert, update, delete on public.game_sessions from authenticated, anon;
grant select on public.game_sessions to authenticated;
