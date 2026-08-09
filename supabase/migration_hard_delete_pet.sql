-- Hard-delete pet: fix FK constraints so deleting a pets row cascades everywhere.
-- Tables already CASCADE (no changes needed):
--   daily_checklist, daily_notes, pet_notes, lost_alerts, alert_recipients,
--   pet_photos, mood_logs, feeding_logs, weight_logs, grooming_logs,
--   health_records, vaccines, medications, appointments, pet_family,
--   pet_follows, pet_insurance, social_posts, post_comments, pet_timelines,
--   milestones, journal_entries, symptom_scan_results (after fix below).
--
-- Run once:  supabase db query --linked -f supabase/migration_hard_delete_pet.sql

-- 1. vet_chat_sessions: SET NULL → CASCADE (deleting pet removes AI chat history)
ALTER TABLE vet_chat_sessions
  DROP CONSTRAINT IF EXISTS vet_chat_sessions_pet_id_fkey;
ALTER TABLE vet_chat_sessions
  ADD CONSTRAINT vet_chat_sessions_pet_id_fkey
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE;

-- 2. symptom_scan_results: SET NULL → CASCADE
ALTER TABLE symptom_scan_results
  DROP CONSTRAINT IF EXISTS symptom_scan_results_pet_id_fkey;
ALTER TABLE symptom_scan_results
  ADD CONSTRAINT symptom_scan_results_pet_id_fkey
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE;

-- 3. playdate_chats: no action → CASCADE on both pet columns
ALTER TABLE playdate_chats
  DROP CONSTRAINT IF EXISTS playdate_chats_from_pet_id_fkey;
ALTER TABLE playdate_chats
  ADD CONSTRAINT playdate_chats_from_pet_id_fkey
  FOREIGN KEY (from_pet_id) REFERENCES pets(id) ON DELETE CASCADE;

ALTER TABLE playdate_chats
  DROP CONSTRAINT IF EXISTS playdate_chats_to_pet_id_fkey;
ALTER TABLE playdate_chats
  ADD CONSTRAINT playdate_chats_to_pet_id_fkey
  FOREIGN KEY (to_pet_id) REFERENCES pets(id) ON DELETE CASCADE;

-- 4. playdate_chat_messages: no action → CASCADE
ALTER TABLE playdate_chat_messages
  DROP CONSTRAINT IF EXISTS playdate_chat_messages_sender_pet_id_fkey;
ALTER TABLE playdate_chat_messages
  ADD CONSTRAINT playdate_chat_messages_sender_pet_id_fkey
  FOREIGN KEY (sender_pet_id) REFERENCES pets(id) ON DELETE CASCADE;

-- 5. playdate_proposals: no action → CASCADE
ALTER TABLE playdate_proposals
  DROP CONSTRAINT IF EXISTS playdate_proposals_proposed_by_pet_id_fkey;
ALTER TABLE playdate_proposals
  ADD CONSTRAINT playdate_proposals_proposed_by_pet_id_fkey
  FOREIGN KEY (proposed_by_pet_id) REFERENCES pets(id) ON DELETE CASCADE;

-- 6. playdate_requests: no action → CASCADE (from earlier migration)
ALTER TABLE playdate_requests
  DROP CONSTRAINT IF EXISTS playdate_requests_from_pet_id_fkey;
ALTER TABLE playdate_requests
  ADD CONSTRAINT playdate_requests_from_pet_id_fkey
  FOREIGN KEY (from_pet_id) REFERENCES pets(id) ON DELETE CASCADE;

ALTER TABLE playdate_requests
  DROP CONSTRAINT IF EXISTS playdate_requests_to_pet_id_fkey;
ALTER TABLE playdate_requests
  ADD CONSTRAINT playdate_requests_to_pet_id_fkey
  FOREIGN KEY (to_pet_id) REFERENCES pets(id) ON DELETE CASCADE;
