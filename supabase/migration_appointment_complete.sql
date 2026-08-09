ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_complete_sent boolean DEFAULT false;
