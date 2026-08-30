-- Meals-with-a-time materialize a linked calendar_events row (same
-- pattern chores already got, mirroring Medications' pre-existing
-- addRecurringEvent approach) — this is what lets a timed meal ride the
-- existing 2-way calendar sync engine for free, with zero new sync logic.
alter table public.family_meals
  add column if not exists linked_event_id text references public.calendar_events(id) on delete set null;

comment on column public.family_meals.linked_event_id is 'calendar_events row materialized from this meal''s start_time (features/vault/tabs/MealsTab.tsx''s saveMeal) — null for a meal with no time set.';
