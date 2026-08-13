-- Extra test events — spread across 2 weeks, all 7 categories
-- Family ID: 211fd767-7a94-4099-8c91-3b7d53f51e65
-- Members: Alex(parent)=62ac7da2, Priya(parent)=m_1786235893879, Leo(kid)=leo-001, Maya(kid)=maya-001, Mary(senior)=senior-001

INSERT INTO public.calendar_events
  (id, family_id, title, date, start_time, type, category, color,
   member_id, location, doctor_name, coach_name, subject,
   pickup_location, drop_location,
   helper_name, helper_status, helper_requested_by,
   approval_pending, conflict, notes, all_day, member_ids)
VALUES

-- Aug 14 (tomorrow): Birthday all-day for Maya
('ex1','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Maya''s Birthday 🎂', '2026-08-14', NULL, 'birthday', 'Birthday', '#F59E0B',
 'maya-001', NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, false, false, NULL, true, '[]'),

-- Aug 14: Study — Leo coding lesson
('ex2','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Coding lesson', '2026-08-14', '16:00', 'event', 'Study', '#3B82F6',
 'leo-001', 'Home — Zoom', NULL, NULL, 'Coding',
 NULL, NULL, 'Mr. Kumar', 'confirmed', 'Priya',
 false, false, NULL, false, '[]'),

-- Aug 15: Medical — Maya eye exam
('ex3','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Eye exam', '2026-08-15', '10:30', 'appointment', 'Medical', '#EF4444',
 'maya-001', 'City Eye Clinic', 'Dr. Kapoor', NULL, NULL, NULL, NULL,
 'Alex', 'confirmed', 'Priya',
 false, false, NULL, false, '[]'),

-- Aug 15: Event — Family movie night
('ex4','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Family movie night', '2026-08-15', '19:30', 'event', 'Event', '#6C5CE7',
 NULL, 'Living Room', NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, false, false, 'Popcorn + blankets ready!', false, '[]'),

-- Aug 16: Sports — Leo basketball game
('ex5','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Basketball game', '2026-08-16', '11:00', 'event', 'Sports', '#F59E0B',
 'leo-001', 'Community Sports Hall', NULL, 'Coach Raj', NULL, 'Home', 'Sports Hall',
 'Priya', 'pending', 'Alex',
 false, false, NULL, false, '[]'),

-- Aug 16: Work — Alex client meeting
('ex6','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Client meeting', '2026-08-16', '14:00', 'appointment', 'Work', '#A855F7',
 '62ac7da2-3f21-4fe3-acbb-fbe0cb576128', 'Office HQ', NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, false, false, NULL, false, '[]'),

-- Aug 17: Ride — Leo chess club (kid requested, pending approval)
('ex7','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Ride to chess club', '2026-08-17', '14:00', 'event', 'Ride', '#10B981',
 'leo-001', 'Chess Club, Oak St', NULL, NULL, NULL, 'School', 'Chess Club, Oak St',
 NULL, NULL, 'Leo',
 true, false, 'Can someone pick me up after practice at 5pm?', false, '[]'),

-- Aug 18: Study — Maya English tutoring
('ex8','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'English tutoring', '2026-08-18', '15:00', 'event', 'Study', '#3B82F6',
 'maya-001', 'Home', NULL, NULL, 'English',
 NULL, NULL, 'Ms. Rao', 'confirmed', 'Priya',
 false, false, NULL, false, '[]'),

-- Aug 18: Medical — Leo allergy shot (recurring)
('ex9','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Allergy shot', '2026-08-18', '09:00', 'appointment', 'Medical', '#EF4444',
 'leo-001', 'Pediatric Center', 'Dr. Patel', NULL, NULL, NULL, NULL,
 'Mary', 'confirmed', 'Priya',
 false, false, 'Leo needs to wait 30 min after the shot', false, '[]'),

-- Aug 19: Event — Family dinner out
('ex10','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Family dinner', '2026-08-19', '19:00', 'event', 'Event', '#10B981',
 NULL, 'The Olive Garden', NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, false, false, 'Reservation at 7pm — confirm by 5pm', false, '[]'),

-- Aug 19: Sports — Maya gymnastics (conflict flag)
('ex11','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Gymnastics class', '2026-08-19', '17:00', 'event', 'Sports', '#F59E0B',
 'maya-001', 'Gymnastics Centre', NULL, 'Coach Leena', NULL, NULL, NULL,
 'Alex', 'rejected', 'Priya',
 false, true, NULL, false, '[]'),

-- Aug 20: Work — Priya conference
('ex12','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Annual tech conference', '2026-08-20', '09:00', 'appointment', 'Work', '#A855F7',
 'm_1786235893879', 'Convention Centre', NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, false, false, 'Full day — Alex handles kids', false, '[]'),

-- Aug 20: Ride — Leo ride home from camp
('ex13','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Ride home from camp', '2026-08-20', '16:30', 'event', 'Ride', '#10B981',
 'leo-001', 'Summer Camp', NULL, NULL, NULL, 'Summer Camp', 'Home',
 'Mary', 'pending', 'Alex',
 false, false, NULL, false, '[]'),

-- Aug 21: Birthday — all-day family celebration
('ex14','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'Grandma Mary''s Birthday 🎂', '2026-08-21', NULL, 'birthday', 'Birthday', '#F59E0B',
 'senior-001', NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, false, false, 'Surprise party — don''t tell Mary!', true, '[]'),

-- Aug 22: Study — Leo SAT prep
('ex15','211fd767-7a94-4099-8c91-3b7d53f51e65',
 'SAT / exam prep', '2026-08-22', '10:00', 'event', 'Study', '#3B82F6',
 'leo-001', 'Library', NULL, NULL, 'Mathematics',
 NULL, NULL, NULL, NULL, NULL,
 false, false, 'Leo can take the bus', false, '[]')

ON CONFLICT (id) DO NOTHING;
