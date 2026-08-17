-- RESPONSIBILITY ENGINE — PHASE 3: kid chore engine schema support.
--
-- The Phase 2 adult-assignment scoring function does not apply to kids —
-- the spec calls for a SEPARATE scoring model (fairness/age/workload/
-- rotation/skill/growth/reliability, not history/availability/route/
-- preference/fairness/context-fit). Before writing that function, this adds
-- the age/skill fields kid-eligibility hard-exclusions need, which do not
-- exist anywhere in the current schema (chore_tasks has `difficulty` text
-- and `recurrence_rule` jsonb with siblingIds/rotationCycleDays already
-- covering skill-fit-proxy and rotation, but nothing for age).
--
-- members.date_of_birth is intentionally nullable — many existing kid rows
-- won't have it set, and age-based hard exclusion only applies when both
-- the chore's age range AND the kid's birthdate are known; absent either,
-- the Phase 3 scoring function treats age suitability as neutral rather
-- than excluding for missing data.

alter table public.chore_tasks
  add column if not exists min_age integer,
  add column if not exists max_age integer,
  add column if not exists required_skill_level integer not null default 1
    check (required_skill_level between 1 and 5);

comment on column public.chore_tasks.min_age is
  'Youngest age this chore is appropriate for. Nullable — most existing chores have no age gate.';
comment on column public.chore_tasks.max_age is
  'Oldest age this chore is still appropriate for (e.g. a toddler-level task a teen would find beneath them). Nullable.';
comment on column public.chore_tasks.required_skill_level is
  '1-5, matches the 1-5 scale already used for member skill comparisons. Defaults to 1 (no special skill needed).';

alter table public.members
  add column if not exists date_of_birth date,
  add column if not exists skill_level integer not null default 1
    check (skill_level between 1 and 5),
  add column if not exists parent_blocked_categories text[] not null default '{}';

comment on column public.members.date_of_birth is
  'Used for chore age-suitability hard exclusion/scoring. Nullable — treated as neutral (not excluded) when absent.';
comment on column public.members.skill_level is
  '1-5, compared against chore_tasks.required_skill_level for the skill-fit scoring signal.';
comment on column public.members.parent_blocked_categories is
  'Categories a parent has explicitly blocked this kid from being assigned (e.g. no knife-adjacent kitchen chores for a young kid) — a hard exclusion, distinct from responsibility_rules which is adult-assignment-only.';
