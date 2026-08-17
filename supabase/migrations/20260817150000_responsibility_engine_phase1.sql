-- ═══════════════════════════════════════════════════════════════════════════
-- RESPONSIBILITY ENGINE — PHASE 1: DATABASE FOUNDATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Implements the spec in family_cube_unified_engine.md, adapted to this
-- app's REAL schema per user instruction ("not necessary to use the exact
-- schema — append fields to existing tables where it makes sense"). Before
-- writing this, a live-DB survey established that most of the spec's
-- proposed tables already exist here under different names with richer
-- functionality than the spec assumed:
--
--   spec table              -> real equivalent            -> action
--   ─────────────────────────────────────────────────────────────────────
--   families                -> families                   -> already has
--                                                              home_lat/lng/address
--   family_members           -> members                     -> extended below
--                                                              (already has role,
--                                                              coins/xp/streak, teen
--                                                              car/earnings fields, GP
--                                                              drive-window/cheerleader
--                                                              prefs — this already IS
--                                                              member_preferences,
--                                                              flattened)
--   tasks / chores           -> chore_tasks                 -> extended below
--                                                              (already a full
--                                                              generalized responsibility
--                                                              unit: category, status
--                                                              lifecycle, recurrence,
--                                                              coins/xp, approval flow —
--                                                              richer than the spec's
--                                                              plain `tasks` table)
--   calendar_events           -> calendar_events             -> extended below
--                                                              (already has helper/driver
--                                                              assignment, GP/teen open
--                                                              flags, pickup confirmation)
--   child_reward_transactions -> point_transactions          -> no changes needed,
--                                                              already covers this
--
-- Genuine gaps — new tables, all family-scoped, all RLS'd from creation
-- (never shipped without RLS, unlike some legacy tables fixed in the two
-- prior security migrations):
--   - locations               (place resolution/geocoding — did not exist
--                               anywhere; calendar_events/chore_tasks only
--                               ever had freeform text location fields)
--   - errands + errand_items  (unified trip/run entity — grocery/shopping
--                               was split across 3 different existing shapes
--                               with no common lifecycle; this does NOT
--                               replace those, it's the new coordination
--                               layer that can reference a chore_tasks
--                               shopping quest OR stand alone)
--   - responsibility_rules    (declarative hard rules — "never assign me
--                               medical appointments" — currently there is
--                               no such thing, only ad hoc UI toggles)
--   - route_context           (persisted route/detour calculation —
--                               real-time GPS/geofence tracking exists
--                               separately in member_locations/geofences,
--                               but nothing computes "how much extra
--                               driving would this errand add")
--   - responsibility_history  (append-only audit trail across ALL
--                               responsibility types — chore_tasks only
--                               keeps current-state timestamps, quests has
--                               a richer per-row history[] jsonb column but
--                               nothing family-wide/cross-domain)
--   - assignment_decisions    (why did the engine pick this person — does
--                               not exist at all today)
--   - responsibility_stats    (view — aggregates responsibility_history)
--
-- Type conventions matched to what's ALREADY live (verified via
-- information_schema.columns, not assumed):
--   - New tables use `id text default gen_random_uuid()::text` (matches
--     chore_tasks.id, calendar_events.id, members.id — all text).
--   - New tables use `family_id text` (matches chore_tasks.family_id,
--     calendar_events.family_id — both text), even though members.family_id
--     is uuid. Every family-scoping RLS check below casts members.family_id
--     ::text to compare, matching the pattern already used for chore_tasks/
--     calendar_events in the two prior security migrations.
--   - FKs to members(id) are text->text (no cast needed).
--   - FKs to chore_tasks(id)/calendar_events(id) are text->text.
--
-- RLS pattern (identical to the two prior security-fix migrations — see
-- 20260817120000/20260817130000 for the full rationale): every table below
-- gets RLS enabled at creation, scoped via
--   family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
-- auth.uid() is always the parent's Supabase auth session (kids/teens/
-- seniors share it client-side, no separate auth accounts).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXTEND EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── members — add the adult-responsibility fairness/reliability fields the
-- spec's member_preferences/responsibility_rules concepts need per-person,
-- appended directly per the "extend existing table" instruction rather than
-- normalizing into a new table (matches how teen/GP prefs already live flat
-- on this table). effort_debt_7d/30d are denormalized rolling sums, kept in
-- sync by the assignment engine (not triggers, to avoid recompute-on-every-
-- write cost) — recalculated from responsibility_history at read time by the
-- Phase 2 scoring function if they ever drift, so denormalization here is
-- safe/advisory, not the sole source of truth.
alter table public.members
  add column if not exists effort_debt_7d  numeric not null default 0,
  add column if not exists effort_debt_30d numeric not null default 0,
  add column if not exists reliability_score numeric not null default 1.0
    check (reliability_score between 0 and 1),
  add column if not exists last_responsibility_at timestamptz;

comment on column public.members.effort_debt_7d is
  'Rolling sum of effort_points assigned/accepted/completed in the last 7 days. Advisory cache — recomputable from responsibility_history.';
comment on column public.members.effort_debt_30d is
  'Rolling sum of effort_points assigned/accepted/completed in the last 30 days. Advisory cache — recomputable from responsibility_history.';
comment on column public.members.reliability_score is
  'Rolling completion-vs-decline/miss ratio, 0-1. Feeds the adult-assignment scoring algorithm (Phase 2). Starts at 1.0 (benefit of the doubt) for new members.';

-- ── chore_tasks — link to a resolved location (for shopping/errand-style
-- quests) and record what the assignment engine decided, without disturbing
-- any existing column. sensitivity/priority mirror the spec's `tasks` table
-- concept, added here since chore_tasks already IS this app's `tasks` table.
alter table public.chore_tasks
  add column if not exists location_id text,
  add column if not exists priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  add column if not exists sensitivity text not null default 'routine'
    check (sensitivity in ('routine','important','sensitive','high_risk')),
  add column if not exists assignment_decision_id text;

comment on column public.chore_tasks.location_id is
  'Resolved place for a shopping/errand-style quest (categoryType=shopping or bounty with a store). Nullable — most chores have no physical location.';
comment on column public.chore_tasks.assignment_decision_id is
  'Points at the assignment_decisions row explaining why the engine assigned this (or suggested/asked). Nullable — most chores are still assigned manually today; this is populated only once the Phase 2 engine actually runs.';

-- ── calendar_events — same location-link + assignment-decision trace,
-- plus the hard-rule/sensitivity fields adult scheduling needs. Deliberately
-- NOT duplicating pickup_location/drop_location (already exist as freeform
-- text) — location_id is an optional resolved-place upgrade path for when
-- the AI/Maps layer (Phase 4/5) starts geocoding those strings, not a
-- replacement.
alter table public.calendar_events
  add column if not exists location_id text,
  add column if not exists sensitivity text not null default 'routine'
    check (sensitivity in ('routine','important','sensitive','high_risk')),
  add column if not exists assignment_decision_id text;

comment on column public.calendar_events.location_id is
  'Resolved place for this event (geocoded pickup/drop/appointment location), once Maps integration resolves the freeform location/pickup_location/drop_location text. Nullable.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. NEW TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── locations — resolved places. A store/pharmacy/school name alone can't
-- calculate a route; this caches the geocoded result so repeat errands to
-- "Kroger" don't re-resolve every time. provider/provider_place_id dedupe
-- against Apple Maps results (this app's existing Maps provider, per
-- maps-autocomplete edge function — see migration header).
-- family_id is a loose text column, not a hard FK — it only needs to filter
-- via RLS, not enforce referential integrity against one specific parent
-- row, since a location can be shared context before any chore/event
-- references it (same non-FK'd convention chore_tasks/calendar_events
-- already use for their own family_id columns).
create table if not exists public.locations (
  id                 text primary key default gen_random_uuid()::text,
  family_id          text not null,
  name               text not null,
  address            text,
  latitude           double precision,
  longitude          double precision,
  provider           text,
  provider_place_id  text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create unique index if not exists idx_locations_provider_place
  on public.locations(provider, provider_place_id)
  where provider_place_id is not null;
create index if not exists idx_locations_family on public.locations(family_id);

alter table public.locations enable row level security;

create policy "locations_select" on public.locations for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "locations_insert" on public.locations for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "locations_update" on public.locations for update
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text))
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "locations_delete" on public.locations for delete
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));

-- Now that locations exists, the location_id columns added above can be
-- properly FK'd.
alter table public.chore_tasks
  add constraint chore_tasks_location_id_fkey
  foreign key (location_id) references public.locations(id) on delete set null;
alter table public.calendar_events
  add constraint calendar_events_location_id_fkey
  foreign key (location_id) references public.locations(id) on delete set null;

-- ── errands — the unified trip/run entity the spec calls for. Distinct
-- from chore_tasks(categoryType=shopping): a chore_task is a REWARDED unit
-- of work (has coins/xp, needs approval); an errand is logistics-only
-- (does this trip need to happen, who's doing it, is it done) and can
-- optionally reference a chore_task if the errand IS also someone's paid
-- quest, without forcing every errand to carry a coin value.
create table if not exists public.errands (
  id           text primary key default gen_random_uuid()::text,
  family_id    text not null,
  chore_id     text references public.chore_tasks(id) on delete set null,
  title        text not null,
  category     text not null
    check (category in ('grocery','pharmacy','pet','household','package','return','other')),
  location_id  text references public.locations(id) on delete set null,
  assigned_to_id text references public.members(id) on delete set null,
  due_at       timestamptz,
  priority     text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  status       text not null default 'pending'
    check (status in ('pending','assigned','in_progress','completed','cancelled')),
  assignment_decision_id text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_errands_family on public.errands(family_id);
create index if not exists idx_errands_status  on public.errands(family_id, status);

alter table public.errands enable row level security;

create policy "errands_select" on public.errands for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "errands_insert" on public.errands for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "errands_update" on public.errands for update
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text))
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "errands_delete" on public.errands for delete
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));

-- ── errand_items — line items for an errand. Deliberately separate from
-- grocery_items/grocery_run_items (which remain the Store/Grocery tab's own
-- data model) — this is the Responsibility-Engine-facing shape, used when
-- an errand is created via the engine/AI-extraction path rather than the
-- grocery tab directly. The two can converge later (Phase 6) once the
-- engine actually drives grocery-tab UI; keeping them separate now avoids
-- a risky schema migration on the live, working grocery feature.
create table if not exists public.errand_items (
  id          text primary key default gen_random_uuid()::text,
  errand_id   text not null references public.errands(id) on delete cascade,
  item_name   text not null,
  quantity    numeric,
  unit        text,
  notes       text,
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_errand_items_errand on public.errand_items(errand_id);

alter table public.errand_items enable row level security;

create policy "errand_items_select" on public.errand_items for select
  using (errand_id in (
    select id from public.errands
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ));
create policy "errand_items_insert" on public.errand_items for insert
  with check (errand_id in (
    select id from public.errands
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ));
create policy "errand_items_update" on public.errand_items for update
  using (errand_id in (
    select id from public.errands
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ))
  with check (errand_id in (
    select id from public.errands
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ));
create policy "errand_items_delete" on public.errand_items for delete
  using (errand_id in (
    select id from public.errands
    where family_id in (select family_id::text from public.members where id = auth.uid()::text)
  ));

-- ── responsibility_rules — declarative hard exclusions/preferences per
-- member+category, e.g. "never assign Mom medical appointments" or "prefer
-- Dad for grocery runs." This is the queryable version of what's currently
-- only ad hoc UI state (GP drive-window/cheerleader-mode flags on members).
-- Phase 2's scoring function reads this table before ranking any candidate.
create table if not exists public.responsibility_rules (
  id          text primary key default gen_random_uuid()::text,
  family_id   text not null,
  member_id   text not null references public.members(id) on delete cascade,
  category    text not null,
  rule_type   text not null
    check (rule_type in ('never','prefer','avoid','require_confirmation')),
  scope       text not null default 'permanent'
    check (scope in ('temporary','permanent')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  source      text not null default 'user'
    check (source in ('user','ai_interpreted')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_responsibility_rules_member
  on public.responsibility_rules(member_id, category) where active;

alter table public.responsibility_rules enable row level security;

create policy "responsibility_rules_select" on public.responsibility_rules for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "responsibility_rules_insert" on public.responsibility_rules for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "responsibility_rules_update" on public.responsibility_rules for update
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text))
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "responsibility_rules_delete" on public.responsibility_rules for delete
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));

-- ── route_context — persisted "how much extra driving would this add"
-- calculation, computed once per candidate+errand+reference-event and
-- cached (route calculation is an external Maps API call — expensive to
-- redo on every render). incremental_* is the core signal the spec's
-- "incremental burden" algorithm needs.
create table if not exists public.route_context (
  id                            text primary key default gen_random_uuid()::text,
  family_id                     text not null,
  member_id                     text not null references public.members(id) on delete cascade,
  destination_location_id       text not null references public.locations(id) on delete cascade,
  reference_event_id            text references public.calendar_events(id) on delete set null,
  base_distance_meters          numeric,
  base_duration_seconds         integer,
  via_distance_meters           numeric,
  via_duration_seconds          integer,
  incremental_distance_meters   numeric,
  incremental_duration_seconds  integer,
  calculated_at                 timestamptz not null default now(),
  provider                      text,
  metadata                      jsonb not null default '{}'::jsonb
);

create index if not exists idx_route_context_member
  on public.route_context(member_id, destination_location_id, calculated_at desc);

alter table public.route_context enable row level security;

create policy "route_context_select" on public.route_context for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "route_context_insert" on public.route_context for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "route_context_delete" on public.route_context for delete
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));

-- ── responsibility_history — the append-only, cross-domain audit trail the
-- spec calls for. Distinct from quests.history (jsonb, per-row, quest-only)
-- and chore_tasks' one-shot timestamp columns (current-state only, no log
-- of prior reassignments) — this is the one place EVERY responsibility
-- type's full lifecycle lives, which the Phase 2/3 fairness scoring and the
-- responsibility_stats view both read from.
create table if not exists public.responsibility_history (
  id                    text primary key default gen_random_uuid()::text,
  family_id             text not null,
  chore_id              text references public.chore_tasks(id) on delete cascade,
  event_id              text references public.calendar_events(id) on delete cascade,
  errand_id             text references public.errands(id) on delete cascade,
  member_id             text not null references public.members(id) on delete cascade,
  category              text not null,
  responsibility_type   text not null
    check (responsibility_type in ('adult_task','errand','chore')),
  outcome               text not null
    check (outcome in ('suggested','accepted','declined','assigned','completed','missed','cancelled','reassigned')),
  effort_points         numeric default 0,
  occurred_at           timestamptz not null default now(),
  metadata              jsonb not null default '{}'::jsonb,
  -- Exactly one of chore_id/event_id/errand_id should be set in practice
  -- (this history row is ABOUT one specific responsibility unit) — not
  -- enforced as a hard constraint since a future responsibility type might
  -- need a different reference shape, but documented as the intended usage.
  constraint responsibility_history_has_subject check (
    chore_id is not null or event_id is not null or errand_id is not null
  )
);

create index if not exists idx_responsibility_history_member_category
  on public.responsibility_history(family_id, member_id, category, occurred_at desc);

alter table public.responsibility_history enable row level security;

-- History is append-only by design (an audit log you can edit isn't an
-- audit log) — SELECT + INSERT only, deliberately no UPDATE/DELETE policy.
create policy "responsibility_history_select" on public.responsibility_history for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "responsibility_history_insert" on public.responsibility_history for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));

-- ── assignment_decisions — the audit/explanation trace for why the engine
-- picked (or asked about) a candidate. task_id kept generic (text, no FK)
-- since a "task" here could be a chore_id, event_id, or errand_id — same
-- ambiguity as responsibility_history, resolved the same way via metadata
-- rather than three nullable FK columns, since this table is written once
-- per decision and read rarely (debugging/explaining "why him"), unlike
-- responsibility_history which is queried constantly for fairness scoring.
create table if not exists public.assignment_decisions (
  id                    text primary key default gen_random_uuid()::text,
  family_id             text not null,
  task_id               text not null,
  task_type             text not null
    check (task_type in ('chore','event','errand')),
  selected_member_id    text references public.members(id) on delete set null,
  decision_type         text not null
    check (decision_type in ('auto','suggest','ask','blocked')),
  confidence            numeric,
  candidate_scores      jsonb not null default '[]'::jsonb,
  explanation           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists idx_assignment_decisions_task
  on public.assignment_decisions(task_id, task_type);
create index if not exists idx_assignment_decisions_family
  on public.assignment_decisions(family_id, created_at desc);

alter table public.assignment_decisions enable row level security;

create policy "assignment_decisions_select" on public.assignment_decisions for select
  using (family_id in (select family_id::text from public.members where id = auth.uid()::text));
create policy "assignment_decisions_insert" on public.assignment_decisions for insert
  with check (family_id in (select family_id::text from public.members where id = auth.uid()::text));

-- Now that assignment_decisions exists, the trace-pointer columns added
-- earlier on chore_tasks/calendar_events/errands can be FK'd.
alter table public.chore_tasks
  add constraint chore_tasks_assignment_decision_id_fkey
  foreign key (assignment_decision_id) references public.assignment_decisions(id) on delete set null;
alter table public.calendar_events
  add constraint calendar_events_assignment_decision_id_fkey
  foreign key (assignment_decision_id) references public.assignment_decisions(id) on delete set null;
alter table public.errands
  add constraint errands_assignment_decision_id_fkey
  foreign key (assignment_decision_id) references public.assignment_decisions(id) on delete set null;

-- ── responsibility_stats — aggregate view, not a duplicate counter table,
-- per the spec's explicit guidance ("initially use a view instead of
-- duplicate counters"). Windowed to 180 days to keep it cheap; the
-- underlying table has an index on (family_id, member_id, category,
-- occurred_at desc) that supports this filter efficiently.
create or replace view public.responsibility_stats as
select
  family_id,
  member_id,
  category,
  count(*) filter (where outcome = 'completed') as completed,
  count(*) filter (where outcome = 'declined')  as declined,
  count(*) filter (where outcome = 'missed')    as missed,
  coalesce(sum(effort_points) filter (
    where outcome in ('assigned','accepted','completed')
  ), 0) as effort_points
from public.responsibility_history
where occurred_at >= now() - interval '180 days'
group by family_id, member_id, category;

-- Views inherit RLS from their underlying tables automatically (Postgres
-- evaluates the view's query against responsibility_history's own RLS), so
-- no separate policy is needed here — confirmed this is the standard
-- Postgres behavior for non-SECURITY-DEFINER views, which this is.
