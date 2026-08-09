-- Appointments v2: reminders, recurrence, vet contact, cost, visit summary
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS vet_phone            text,
  ADD COLUMN IF NOT EXISTS remind_before_minutes int,
  ADD COLUMN IF NOT EXISTS recurrence           text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cost                 numeric(10,2),
  ADD COLUMN IF NOT EXISTS visit_summary        text;
