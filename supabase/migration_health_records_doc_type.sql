ALTER TABLE health_records
  ADD COLUMN IF NOT EXISTS doc_type text DEFAULT 'other'
    CHECK (doc_type IN ('lab','prescription','discharge','vaccination','xray','invoice','other'));

CREATE INDEX IF NOT EXISTS idx_health_records_doc_type ON health_records (pet_id, doc_type);
