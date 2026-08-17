-- RESPONSIBILITY ENGINE — replace the single usually_adult_task boolean
-- with three independent eligibility switches, per user direction: a task
-- isn't just "adult or not" — it can simultaneously need a parent, be
-- something a teen could cover, and be GP-welcome, matching how this app
-- already models eligibility elsewhere (calendar_events.is_open_to_teens/
-- is_open_to_grandparents, chore_tasks.open_to_gp/invite_grandparents —
-- column names below deliberately echo those for consistency).
--
-- These are per-CATEGORY defaults (what's typically true for "Doctor
-- Visit" as a category), not a replacement for the existing per-ROW
-- toggles on chore_tasks/calendar_events — a specific task can still
-- override its category's default (e.g. a parent can GP-welcome an
-- individual grocery run even though "Grocery Run" itself defaults to
-- teen-eligible + not GP-welcome). The UI reads the category default to
-- pre-fill a new task's switches, which the parent can then flip.

alter table public.responsibility_categories
  add column if not exists default_needs_parent  boolean not null default false,
  add column if not exists default_teen_eligible  boolean not null default false,
  add column if not exists default_gp_welcome     boolean not null default false;

comment on column public.responsibility_categories.default_needs_parent is
  'Category default: does this typically require a parent specifically (not just any adult)? e.g. medical consent, financial decisions.';
comment on column public.responsibility_categories.default_teen_eligible is
  'Category default: could a teen with a license/car reasonably cover this? Mirrors calendar_events.is_open_to_teens.';
comment on column public.responsibility_categories.default_gp_welcome is
  'Category default: is this the kind of task grandparents are typically happy to help with? Mirrors chore_tasks.open_to_gp / calendar_events.is_open_to_grandparents.';

-- Backfill from the old usually_adult_task flag as a starting point, then
-- refine per-category below — usually_adult_task alone was too coarse
-- (e.g. it marked ALL of Medical as adult-only with no teen/GP nuance).
update public.responsibility_categories set default_needs_parent = true where usually_adult_task;

-- Refine specific categories where the coarse backfill above isn't right:

-- Medical: consent/decision-making needs a parent, but pickup/logistics
-- can involve a teen driver or a GP.
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'medical.doctor_visit';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'medical.dentist';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'medical.prescription';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'medical.vaccination';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'medical.checkup';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'medical.emergency';

-- Transport: exactly what Junior Dispatch / GP ride-welcome already model.
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'transport.school_pickup';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'transport.school_dropoff';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'transport.activity_ride';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'transport.airport';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'transport.other';

-- School: parent conference needs a parent; everything else is more open.
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = false, default_gp_welcome = true  where id = 'school.homework_help';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = false, default_gp_welcome = true  where id = 'school.project';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'school.supplies';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = false, default_gp_welcome = true  where id = 'school.event';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'school.conference';

-- Sports & Activities — mirrors Transport, since these are usually a ride.
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'sports.practice';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'sports.game';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'sports.lesson';

-- Household — open to everyone by default except real maintenance/repair.
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'household.cleaning';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'household.laundry';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'household.kitchen';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'household.yard';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'household.pet_care';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'household.maintenance';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'household.garage';

-- Errands — the classic teen-dispatch / GP-welcome case, per the spec's
-- own grocery example. Pharmacy needs judgment (controlled substances) so
-- stays parent-only by default.
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'errand.grocery';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'errand.pharmacy';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'errand.pet_store';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'errand.package';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'errand.return';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'errand.dry_cleaning';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true  where id = 'errand.other';

-- Financial — parent-only across the board, allowance is the one exception
-- GPs are already explicitly modeled as funding (grandparent_matches table).
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'financial.bill_pay';
update public.responsibility_categories set default_needs_parent = true,  default_teen_eligible = false, default_gp_welcome = false where id = 'financial.budgeting';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = false, default_gp_welcome = true  where id = 'financial.allowance';

-- Social & Family — open to everyone, this is the app's whole "family
-- coordination" premise.
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true where id = 'social.playdate';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true where id = 'social.birthday';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true where id = 'social.family_event';
update public.responsibility_categories set default_needs_parent = false, default_teen_eligible = true,  default_gp_welcome = true where id = 'social.holiday';

-- Work — inherently parent-only, no teen/GP involvement makes sense here.
update public.responsibility_categories set default_needs_parent = true, default_teen_eligible = false, default_gp_welcome = false where id = 'work.meeting';
update public.responsibility_categories set default_needs_parent = true, default_teen_eligible = false, default_gp_welcome = false where id = 'work.deadline';

-- usually_adult_task is superseded by the three switches above but kept
-- (not dropped) — process-kid-chore-assignment's hard-exclusion check
-- still reads it as a coarse "block kids entirely" signal, and dropping it
-- would be a breaking change to that function for no real benefit; the new
-- switches add nuance on top rather than replacing the block/no-block gate.
