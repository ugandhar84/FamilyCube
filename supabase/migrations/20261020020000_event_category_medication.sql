-- Medication reminders are saved as calendar events with category 'Medication', but that key was never added to
-- event_categories, so every one of them failed calendar_events_category_fk (no reminder was ever created).
INSERT INTO event_categories (key, label, emoji, color, sort_order, is_custom_allowed, family_id)
VALUES ('Medication', 'Medication', '💊', '#7B5EA7', 98, false, null)
ON CONFLICT (key) DO NOTHING;
