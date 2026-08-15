-- Add Holiday as a valid event category so school-calendar flyer scans don't
-- violate the calendar_events_category_fk foreign key constraint.
INSERT INTO event_categories (key, label, emoji, color, sort_order, is_custom_allowed, family_id)
VALUES ('Holiday', 'Holiday', '🎌', '#F59E0B', 99, false, null)
ON CONFLICT (key) DO NOTHING;
