-- Adds an optional "source / verification" note to a medication record —
-- implied by the Health & Records "Add medication" mockup's
-- "Source / verification" field (e.g. "Prescription label", "Confirmed
-- with Dr. Harper"). Nullable, backward compatible: existing rows are
-- unaffected, and every existing insert/update path that doesn't pass it
-- keeps working unchanged (features/vault/tabs/health/AddMedModal.tsx /
-- HealthTab.tsx's addMed/updateMed).
alter table family_medications
  add column if not exists source_note text;
