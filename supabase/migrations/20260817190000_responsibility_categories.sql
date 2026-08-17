-- RESPONSIBILITY ENGINE — category taxonomy.
--
-- Every category field the engine touches (chore_tasks.category,
-- calendar_events.category, errands.category, responsibility_rules.category,
-- responsibility_history.category, assignment_decisions candidate scoring)
-- has been free-form text with no fixed vocabulary. A live grep of this
-- codebase found calendar events, chores, and grocery items already using
-- ~35 different ad hoc category strings inconsistently (Sports/Medical/
-- Study/Ride/Health/Errand/Household/... with no grouping, no canonical
-- casing guaranteed). This weakens the engine in three concrete ways:
--   1. responsibility_rules ("never assign me Medical") only works if every
--      caller spells "Medical" identically — a rule written against
--      "medical" silently never matches a task tagged "Health".
--   2. Fairness/effort scoring groups by category — inconsistent spelling
--      splits what should be one bucket into several, undercounting effort.
--   3. AI extraction (family-ai/extract_responsibility) has no fixed set to
--      choose from, so its category guesses drift from whatever the rest
--      of the app expects.
--
-- Fix: a real reference table, domain -> subcategory (two-level, per user
-- direction), seeded with defaults grounded in the categories already
-- organically in use across this codebase (grep'd from calendar_events,
-- chore_tasks, and grocery categories) rather than invented from scratch.
-- Existing free-text category columns are NOT migrated/rewritten in this
-- pass (that would risk silently reclassifying live rows) — this table is
-- additive: new UI/AI-driven category selection can start using it
-- immediately, existing data keeps working as before.

create table if not exists public.responsibility_categories (
  id                 text primary key,               -- stable slug, e.g. 'medical.doctor_visit'
  domain              text not null,                  -- e.g. 'medical'
  domain_label        text not null,                  -- e.g. 'Medical'
  subcategory         text not null,                  -- e.g. 'doctor_visit'
  subcategory_label   text not null,                  -- e.g. 'Doctor Visit'
  default_sensitivity text not null default 'routine'
    check (default_sensitivity in ('routine','important','sensitive','high_risk')),
  typical_effort_points integer not null default 3 check (typical_effort_points between 1 and 10),
  usually_adult_task   boolean not null default false, -- true = rarely appropriate for a kid to own
  icon_hint            text,                            -- lucide icon name, for the picker UI
  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (domain, subcategory)
);

create index if not exists idx_responsibility_categories_domain
  on public.responsibility_categories(domain, sort_order) where active;

-- Read-only reference data — every family sees the same taxonomy (this is
-- not family-scoped, unlike everything else added in this engine). RLS
-- still enabled per this app's own convention (nothing ships without RLS),
-- but the policy is simply "any authenticated user can read," matching how
-- global_med_suggestions/app_config were treated in the security migrations.
alter table public.responsibility_categories enable row level security;

create policy "responsibility_categories_select"
  on public.responsibility_categories for select
  to authenticated
  using (true);

-- ── Seed data ────────────────────────────────────────────────────────────
-- Grounded in categories already organically in use across chore_tasks/
-- calendar_events/grocery_items (grep'd, not invented), reorganized into
-- domain/subcategory pairs. usually_adult_task marks domains a kid chore-
-- assignment run would almost never see (medical, financial, work) so the
-- future category-aware UI can hide/gray those out of a kid-facing picker.

insert into public.responsibility_categories
  (id, domain, domain_label, subcategory, subcategory_label, default_sensitivity, typical_effort_points, usually_adult_task, icon_hint, sort_order)
values
  -- Medical
  ('medical.doctor_visit',    'medical', 'Medical', 'doctor_visit',    'Doctor Visit',        'important', 6, true,  'stethoscope', 10),
  ('medical.dentist',         'medical', 'Medical', 'dentist',         'Dentist',             'important', 5, true,  'stethoscope', 20),
  ('medical.prescription',    'medical', 'Medical', 'prescription',    'Prescription Pickup', 'important', 3, true,  'pill',        30),
  ('medical.vaccination',     'medical', 'Medical', 'vaccination',     'Vaccination',         'important', 5, true,  'syringe',     40),
  ('medical.checkup',         'medical', 'Medical', 'checkup',         'Checkup',             'routine',   4, true,  'stethoscope', 50),
  ('medical.emergency',       'medical', 'Medical', 'emergency',       'Emergency',           'high_risk', 9, true,  'siren',       60),

  -- Transport (rides, pickups/dropoffs)
  ('transport.school_pickup', 'transport', 'Transport', 'school_pickup', 'School Pickup',   'routine', 3, false, 'car',   10),
  ('transport.school_dropoff','transport', 'Transport', 'school_dropoff','School Dropoff',  'routine', 3, false, 'car',   20),
  ('transport.activity_ride', 'transport', 'Transport', 'activity_ride', 'Activity Ride',   'routine', 3, false, 'car',   30),
  ('transport.airport',       'transport', 'Transport', 'airport',       'Airport Run',     'important', 5, true, 'plane', 40),
  ('transport.other',         'transport', 'Transport', 'other',         'Other Ride',      'routine', 3, false, 'car',   50),

  -- School
  ('school.homework_help',    'school', 'School', 'homework_help',    'Homework Help',     'routine', 3, false, 'book-open',   10),
  ('school.project',          'school', 'School', 'project',          'School Project',    'routine', 4, false, 'book-open',   20),
  ('school.supplies',         'school', 'School', 'supplies',         'School Supplies',   'routine', 2, false, 'backpack',    30),
  ('school.event',            'school', 'School', 'event',            'School Event',      'routine', 4, false, 'calendar',    40),
  ('school.conference',       'school', 'School', 'conference',       'Parent Conference', 'important', 5, true, 'users',       50),

  -- Sports & Activities
  ('sports.practice',         'sports', 'Sports & Activities', 'practice',      'Practice',           'routine', 3, false, 'medal', 10),
  ('sports.game',             'sports', 'Sports & Activities', 'game',          'Game / Tournament',  'routine', 4, false, 'medal', 20),
  ('sports.lesson',           'sports', 'Sports & Activities', 'lesson',        'Lesson / Class',     'routine', 3, false, 'medal', 30),

  -- Household
  ('household.cleaning',      'household', 'Household', 'cleaning',       'Cleaning',        'routine', 3, false, 'sparkles',      10),
  ('household.laundry',       'household', 'Household', 'laundry',        'Laundry',         'routine', 3, false, 'shirt',         20),
  ('household.kitchen',       'household', 'Household', 'kitchen',        'Kitchen',         'routine', 3, false, 'utensils',      30),
  ('household.yard',          'household', 'Household', 'yard',           'Yard Work',       'routine', 4, false, 'trees',         40),
  ('household.pet_care',      'household', 'Household', 'pet_care',       'Pet Care',        'routine', 3, false, 'paw-print',     50),
  ('household.maintenance',   'household', 'Household', 'maintenance',    'Home Maintenance','important', 5, true, 'wrench',       60),
  ('household.garage',        'household', 'Household', 'garage',         'Garage / Storage','routine', 3, false, 'warehouse',     70),

  -- Errands
  ('errand.grocery',          'errand', 'Errands', 'grocery',          'Grocery Run',       'routine', 4, false, 'shopping-cart', 10),
  ('errand.pharmacy',         'errand', 'Errands', 'pharmacy',         'Pharmacy',          'important', 3, true, 'pill',          20),
  ('errand.pet_store',        'errand', 'Errands', 'pet_store',        'Pet Store',         'routine', 3, false, 'paw-print',     30),
  ('errand.package',          'errand', 'Errands', 'package',          'Package Drop/Pickup','routine', 2, false, 'package',      40),
  ('errand.return',           'errand', 'Errands', 'return',           'Store Return',      'routine', 2, false, 'undo-2',        50),
  ('errand.dry_cleaning',     'errand', 'Errands', 'dry_cleaning',     'Dry Cleaning',      'routine', 2, false, 'shirt',         60),
  ('errand.other',            'errand', 'Errands', 'other',            'Other Errand',      'routine', 3, false, 'shopping-bag',  70),

  -- Financial
  ('financial.bill_pay',      'financial', 'Financial', 'bill_pay',      'Bill Pay',         'sensitive', 4, true, 'receipt',      10),
  ('financial.budgeting',     'financial', 'Financial', 'budgeting',     'Budgeting',        'sensitive', 5, true, 'wallet',       20),
  ('financial.allowance',     'financial', 'Financial', 'allowance',     'Allowance / Coins','routine',   2, true, 'coins',        30),

  -- Social & Family
  ('social.playdate',         'social', 'Social & Family', 'playdate',        'Playdate',          'routine', 3, false, 'users',      10),
  ('social.birthday',         'social', 'Social & Family', 'birthday',        'Birthday',          'routine', 4, false, 'cake',       20),
  ('social.family_event',     'social', 'Social & Family', 'family_event',    'Family Event',      'routine', 4, false, 'users',      30),
  ('social.holiday',          'social', 'Social & Family', 'holiday',         'Holiday',           'routine', 5, false, 'party-popper',40),

  -- Work (adult-only by nature)
  ('work.meeting',            'work', 'Work', 'meeting',            'Work Meeting',       'routine', 3, true, 'briefcase', 10),
  ('work.deadline',           'work', 'Work', 'deadline',           'Work Deadline',      'important', 5, true, 'briefcase', 20),

  -- Other / catch-all — kept last, deliberately generic
  ('other.general',           'other', 'Other', 'general', 'General', 'routine', 3, false, 'circle-dot', 999)
on conflict (id) do nothing;
