-- Phase 1 of the DB-driven assignment redesign — additive schema only, zero
-- client changes in this migration. Motivated by a real production bug: a
-- calendar_events row was found with BOTH helper_name/helper_status
-- ("Priya"/"confirmed", stale) AND driver_name/driver_status
-- ("Ugandhar"/"pending", fresh from a later reassignment) populated at once.
-- The read side (eventAssignee() in store/eventStore.ts) always preferred
-- helper over driver, so every UI surface showed the stale assignee.
--
-- Root cause is architectural, not a one-line bug: today's model has room
-- for exactly ONE "assignee" per event, but a real event genuinely has
-- several distinct participants (driver, one or more passengers, whoever
-- requested it, whoever needs to approve it) — scattered today across
-- helper_name/driver_name (fighting over "the one assignee"), member_id/
-- member_ids (passengers), helper_requested_by (requester), and no field at
-- all for approver. event_participants/chore_participants replace all of
-- that with one row per (item, member, role).
--
-- Legacy columns (helper_*, driver_*, member_id/member_ids, assigned_to_id,
-- etc.) are NOT touched or dropped here — see the plan file for the full
-- phased rollout. RPC functions (next migration) write both the new tables
-- AND the legacy columns during the rollout window so unmigrated client
-- code keeps working unmodified.

create table public.event_participants (
  id             uuid primary key default gen_random_uuid(),
  event_id       text not null references public.calendar_events(id) on delete cascade,
  member_id      text references public.members(id) on delete set null,
  -- Denormalized fallback for a participant with no real member row (e.g.
  -- an external tutor typed into the "Or type a name" field) — mirrors the
  -- same free-text-fallback pattern helper_name/driver_name already use.
  member_name    text,
  role           text not null check (role in ('driver','helper','passenger','requester','approver')),
  -- Null for passenger/requester — "status" (pending/confirmed/rejected) is
  -- only a meaningful concept for a role someone has to respond to.
  status         text check (status in ('pending','confirmed','rejected')),
  decline_reason text,
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (event_id, member_id, role)
);

create index event_participants_event_id_idx on public.event_participants(event_id);
create index event_participants_member_id_idx on public.event_participants(member_id) where member_id is not null;

create table public.chore_participants (
  id          uuid primary key default gen_random_uuid(),
  chore_id    text not null references public.chore_tasks(id) on delete cascade,
  member_id   text references public.members(id) on delete set null,
  role        text not null check (role in ('assignee','requester','approver','sponsor')),
  status      text check (status in ('pending','claimed','submitted','approved','declined')),
  created_at  timestamptz not null default now(),
  unique (chore_id, member_id, role)
);

create index chore_participants_chore_id_idx on public.chore_participants(chore_id);
create index chore_participants_member_id_idx on public.chore_participants(member_id) where member_id is not null;

comment on table public.event_participants is
  'One row per (event, member, role) — the driver, passengers, requester, and approver of a calendar_events row, each with their own independent status. Replaces the helper_*/driver_*/member_id(s)/helper_requested_by column split during the phased rollout described in the DB-driven-assignment-state plan; legacy columns are kept in sync by the RPC functions until every read/write site has migrated, then dropped.';
comment on table public.chore_participants is
  'One row per (chore, member, role) — the assignee, requester, approver, and GP sponsor of a chore_tasks row. Same rollout pattern as event_participants: legacy columns (assigned_to_id, sponsor_user_id, etc.) stay in sync until every call site has migrated.';

-- RLS — family-scoped read/write, same pattern as calendar_events/chore_tasks
-- themselves (public.current_user_family_id()), since a participant row has
-- no family_id of its own — it inherits scope from its parent event/chore.
alter table public.event_participants enable row level security;
alter table public.chore_participants enable row level security;

create policy "event_participants_select" on public.event_participants for select
  using (event_id in (
    select id from public.calendar_events where family_id = public.current_user_family_id()::text
  ));
create policy "event_participants_insert" on public.event_participants for insert
  with check (event_id in (
    select id from public.calendar_events where family_id = public.current_user_family_id()::text
  ));
create policy "event_participants_update" on public.event_participants for update
  using (event_id in (
    select id from public.calendar_events where family_id = public.current_user_family_id()::text
  ))
  with check (event_id in (
    select id from public.calendar_events where family_id = public.current_user_family_id()::text
  ));
create policy "event_participants_delete" on public.event_participants for delete
  using (event_id in (
    select id from public.calendar_events where family_id = public.current_user_family_id()::text
  ));

create policy "chore_participants_select" on public.chore_participants for select
  using (chore_id in (
    select id from public.chore_tasks where family_id = public.current_user_family_id()::text
  ));
create policy "chore_participants_insert" on public.chore_participants for insert
  with check (chore_id in (
    select id from public.chore_tasks where family_id = public.current_user_family_id()::text
  ));
create policy "chore_participants_update" on public.chore_participants for update
  using (chore_id in (
    select id from public.chore_tasks where family_id = public.current_user_family_id()::text
  ))
  with check (chore_id in (
    select id from public.chore_tasks where family_id = public.current_user_family_id()::text
  ));
create policy "chore_participants_delete" on public.chore_participants for delete
  using (chore_id in (
    select id from public.chore_tasks where family_id = public.current_user_family_id()::text
  ));

-- State-transition history — extend activity_log rather than build a
-- parallel table (it already has entity_type/entity_id/actor_id/action/
-- field/old_value/new_value/created_at, and a working client library at
-- lib/activityLog.ts). from_status/to_status answer "what was the full
-- transition" directly, instead of inferring it from field-level diffs — a
-- single logical action like claim_pool_quest changes 3 fields atomically,
-- and today's activity_log would need 3 disconnected rows with no way to
-- group them; transition_id groups every row one RPC call writes as one
-- logical entry for the log-trail UI.
alter table public.activity_log
  add column from_status text,
  add column to_status   text,
  add column transition_id uuid default gen_random_uuid();

comment on column public.activity_log.from_status is
  'The entity''s status immediately before this transition, when the action represents a real state-machine transition (claim/approve/decline/reassign) rather than a single-field edit (notes, date/time).';
comment on column public.activity_log.to_status is
  'The entity''s status immediately after this transition.';
comment on column public.activity_log.transition_id is
  'Groups every activity_log row one RPC call writes (e.g. claim_pool_quest touching assigned_to_id + status + is_pool) as one logical transition, so the log-trail UI can render one entry instead of N disconnected field-level rows.';

-- One-time backfill from existing calendar_events columns into
-- event_participants. Where BOTH helper_* and driver_* are populated on the
-- same row (the exact conflicting-data shape this whole redesign exists to
-- fix), both become real, visible rows here instead of one silently
-- shadowing the other — preferring 'confirmed' over 'pending'/'rejected' as
-- the more authoritative-looking status when choosing which one to also
-- treat as the "primary" going forward is a judgment call left to the
-- getPrimaryAssignee() read helper (next migration/client change), not
-- baked into this backfill — the backfill's job is just to make every
-- existing signal visible, not to already resolve the ambiguity.
insert into public.event_participants (event_id, member_id, member_name, role, status, responded_at)
select
  ce.id,
  (select m.id from public.members m where m.family_id::text = ce.family_id and m.name = ce.driver_name limit 1),
  ce.driver_name,
  'driver',
  ce.driver_status,
  case when ce.driver_status is not null then ce.updated_at else null end
from public.calendar_events ce
where ce.driver_name is not null
on conflict (event_id, member_id, role) do nothing;

insert into public.event_participants (event_id, member_id, member_name, role, status, decline_reason, responded_at)
select
  ce.id,
  coalesce(ce.helper_id, (select m.id from public.members m where m.family_id::text = ce.family_id and m.name = ce.helper_name limit 1)),
  ce.helper_name,
  'helper',
  ce.helper_status,
  ce.helper_decline_reason,
  case when ce.helper_status is not null then ce.updated_at else null end
from public.calendar_events ce
where ce.helper_name is not null
on conflict (event_id, member_id, role) do nothing;

insert into public.event_participants (event_id, member_id, member_name, role)
select ce.id, ce.member_id, m.name, 'passenger'
from public.calendar_events ce
left join public.members m on m.id = ce.member_id
where ce.member_id is not null
on conflict (event_id, member_id, role) do nothing;

-- member_ids is a jsonb array of additional passengers beyond the primary member_id.
insert into public.event_participants (event_id, member_id, member_name, role)
select ce.id, mid.value #>> '{}', m.name, 'passenger'
from public.calendar_events ce
cross join lateral jsonb_array_elements(coalesce(ce.member_ids, '[]'::jsonb)) as mid(value)
left join public.members m on m.id = (mid.value #>> '{}')
where ce.member_ids is not null and jsonb_typeof(ce.member_ids) = 'array'
on conflict (event_id, member_id, role) do nothing;

insert into public.event_participants (event_id, member_id, member_name, role)
select
  ce.id,
  (select m.id from public.members m where m.family_id::text = ce.family_id and m.name = ce.helper_requested_by limit 1),
  ce.helper_requested_by,
  'requester'
from public.calendar_events ce
where ce.helper_requested_by is not null
on conflict (event_id, member_id, role) do nothing;

-- Same treatment for chore_tasks -> chore_participants.
insert into public.chore_participants (chore_id, member_id, role, status)
select ct.id, ct.assigned_to_id, 'assignee',
  case ct.status
    when 'todo' then 'pending'
    when 'claimed' then 'claimed'
    when 'in_progress' then 'claimed'
    when 'pending_approval' then 'submitted'
    when 'approved' then 'approved'
    when 'auto_approved' then 'approved'
    when 'done' then 'approved'
    when 'declined' then 'declined'
    else null
  end
from public.chore_tasks ct
where ct.assigned_to_id is not null
on conflict (chore_id, member_id, role) do nothing;

insert into public.chore_participants (chore_id, member_id, role)
select ct.id, ct.sponsor_user_id, 'sponsor'
from public.chore_tasks ct
where ct.sponsor_user_id is not null
on conflict (chore_id, member_id, role) do nothing;

insert into public.chore_participants (chore_id, member_id, role)
select ct.id, ct.created_by_id, 'requester'
from public.chore_tasks ct
where ct.created_by_id is not null
on conflict (chore_id, member_id, role) do nothing;
