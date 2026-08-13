-- ── 1. Ensure all members belong to the same family ─────────────────────────
UPDATE public.members
  SET family_id = '211fd767-7a94-4099-8c91-3b7d53f51e65'
  WHERE family_id IS NULL
    AND id IN ('senior-001','leo-001','m_1786235893879','maya-001','62ac7da2-3f21-4fe3-acbb-fbe0cb576128');

-- ── 2. Seed calendar events (idempotent via ON CONFLICT DO NOTHING) ──────────
-- Member IDs:
--   Alex (parent)  : 62ac7da2-3f21-4fe3-acbb-fbe0cb576128
--   Priya (parent) : m_1786235893879
--   Leo (kid)      : leo-001
--   Maya (kid)     : maya-001
--   Mary (senior)  : senior-001

INSERT INTO public.calendar_events
  (id, family_id, title, date, start_time, type, category, color,
   member_id, location, doctor_name, coach_name, subject,
   pickup_location, drop_location,
   helper_name, helper_status, helper_requested_by,
   helper_decline_reason, helper_declined_by,
   approval_pending, conflict, notes, all_day, member_ids)
VALUES

-- Medical: Leo → dentist, mom accompanies
('e1','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Dentist appointment', '2026-08-12', '10:00', 'appointment', 'Medical', '#EF4444',
 'leo-001','Dr. Smith Dental Clinic','Dr. Smith', NULL, NULL, NULL, NULL,
 'Priya','confirmed','Priya',NULL,NULL,
 false, false, NULL, false, '[]'),

-- Sports: Leo → soccer, mom drops off
('e2','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Soccer practice', '2026-08-12', '15:30', 'event', 'Sports', '#10B981',
 'leo-001','Riverside Park', NULL,'Coach Williams', NULL, NULL, NULL,
 'Priya','confirmed','Priya',NULL,NULL,
 false, false, NULL, false, '[]'),

-- Study: Maya → math tutoring online (conflict flag)
('e3','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Math tutoring', '2026-08-12', '17:00', 'event', 'Study', '#6C5CE7',
 'maya-001','Home — Zoom', NULL, NULL,'Mathematics', NULL, NULL,
 'Mr. Kumar','confirmed','Priya',NULL,NULL,
 false, true, NULL, false, '[]'),

-- Event: Family game night (no specific member)
('e4','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Family game night', '2026-08-12', '19:00', 'event', 'Event', '#6C5CE7',
 NULL,'Living Room', NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 false, false, NULL, false, '[]'),

-- Work: Priya grocery run (tomorrow)
('e5','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Grocery run', '2026-08-13', '11:00', 'reminder', 'Work', '#3B82F6',
 'm_1786235893879', NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 false, false, NULL, false, '[]'),

-- Sports: Leo → soccer tournament, Alex drops off (tomorrow)
('e6','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Soccer tournament', '2026-08-13', '09:00', 'event', 'Sports', '#10B981',
 'leo-001','City Stadium', NULL,'Coach Williams', NULL, NULL, NULL,
 'Alex','confirmed','Priya',NULL,NULL,
 false, false, NULL, false, '[]'),

-- Birthday: Leo (+3 days, all-day)
('e7','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Leo''s Birthday 🎂', '2026-08-15', NULL, 'birthday', 'Birthday', '#F59E0B',
 'leo-001', NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 false, false, NULL, true, '[]'),

-- Work: Alex presentation (+2 days)
('e8','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Work presentation', '2026-08-14', '09:30', 'appointment', 'Work', '#9D4EDD',
 '62ac7da2-3f21-4fe3-acbb-fbe0cb576128','Office HQ', NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL,
 false, false, NULL, false, '[]'),

-- Ride: Maya → piano, Mary drives (+2 days)
('e9','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Maya''s Piano lesson', '2026-08-14', '16:00', 'event', 'Ride', '#F59E0B',
 'maya-001','Music Academy', NULL, NULL, NULL,'Home','Music Academy',
 'Mary','confirmed','Priya',NULL,NULL,
 false, false, NULL, false, '[]'),

-- Medical: Leo vaccine, mom pending (+4 days)
('e10','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Vaccine checkup', '2026-08-16', '11:00', 'appointment', 'Medical', '#EF4444',
 'leo-001','Pediatric Center','Dr. Patel', NULL, NULL, NULL, NULL,
 'Priya','pending','Priya',NULL,NULL,
 false, false, NULL, false, '[]'),

-- Ride: Leo → chess club, Mary declined today
('e11','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Ride to chess club', '2026-08-12', '14:00', 'event', 'Ride', '#F59E0B',
 'leo-001','Chess Club, Oak St', NULL, NULL, NULL,'School','Chess Club, Oak St',
 'Mary','rejected','Priya','Vehicle unavailable today','Mary',
 false, false, NULL, false, '[]'),

-- Ride: Maya → art class (kid requested, pending approval) today
('e12','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Ride to art class', '2026-08-12', '16:30', 'event', 'Ride', '#EC4899',
 'maya-001','Arts Center', NULL, NULL, NULL,'School','Arts Center',
 NULL, NULL,'Maya',NULL,NULL,
 true, false, 'Please pick me up after school', false, '[]')

ON CONFLICT (id) DO NOTHING;
