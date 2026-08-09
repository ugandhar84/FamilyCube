-- Prevent double-logging when owner and family members both receive a med/feeding
-- reminder and both tap simultaneously. The second upsert will be a no-op.
ALTER TABLE daily_checklist
  ADD CONSTRAINT daily_checklist_pet_type_label_date_unique
  UNIQUE (pet_id, type, label, date);
