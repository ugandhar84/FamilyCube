-- Live-requested, explicit user confirmation obtained: "delete all existing
-- schedules from app" — a hard, permanent delete of every calendar_events
-- row (real events and the accidental 170-row daily test series both),
-- not a soft-delete. Confirmed single-family dev database, so unscoped by
-- family_id. All FKs referencing calendar_events are ON DELETE CASCADE or
-- ON DELETE SET NULL (event_external_links, google_task_links,
-- responsibility_engine tables, chore_tasks.linked_event_id,
-- family_meals.linked_event_id) — no manual dependent cleanup needed
-- before this delete.
delete from public.calendar_events;
