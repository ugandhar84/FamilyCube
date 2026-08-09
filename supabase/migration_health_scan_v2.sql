-- FurEver — Health Records + AI Scan (full, idempotent)
-- Creates tables if they don't exist, then adds v2 columns.
-- Safe to re-run at any time.

-- ── health_records ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_records (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id           uuid        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  user_id          uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name        text        NOT NULL,
  file_url         text        NOT NULL,
  file_type        text        NOT NULL DEFAULT 'image',
  status           text        NOT NULL DEFAULT 'processing',
  source           text        NOT NULL DEFAULT 'upload',
  ai_summary       text,
  extracted_data   jsonb,
  extraction_count integer     NOT NULL DEFAULT 0,
  error_message    text,
  processed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- v2 columns (safe to add even if table already existed)
ALTER TABLE public.health_records
  ADD COLUMN IF NOT EXISTS pages       jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_count  integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS auto_saved  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS debug_info  jsonb   DEFAULT NULL;

-- ── lab_results ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_results (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id          uuid        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  name            text        NOT NULL DEFAULT '',
  result          text,
  interpretation  text,
  tested_at       date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lab_results
  ADD COLUMN IF NOT EXISTS test_name       text,
  ADD COLUMN IF NOT EXISTS result_value    text,
  ADD COLUMN IF NOT EXISTS unit            text,
  ADD COLUMN IF NOT EXISTS is_abnormal     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reference_range text,
  ADD COLUMN IF NOT EXISTS notes          text;

-- backfill test_name from name for any existing rows
UPDATE public.lab_results SET test_name = name WHERE test_name IS NULL AND name IS NOT NULL;

-- ── medications ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medications (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id      uuid        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  dosage      text,
  frequency   text        NOT NULL DEFAULT 'daily',
  start_date  date,
  end_date    date,
  is_active   boolean     NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS source    text DEFAULT 'manual';

-- ── vaccines (source column for scan-created rows) ────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vaccines') THEN
    ALTER TABLE public.vaccines
      ADD COLUMN IF NOT EXISTS manufacturer text,
      ADD COLUMN IF NOT EXISTS batch_no     text,
      ADD COLUMN IF NOT EXISTS source       text DEFAULT 'manual';
  END IF;
END $$;

-- ── appointments (source column) ──────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments') THEN
    ALTER TABLE public.appointments
      ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_health_records_pet_id  ON public.health_records (pet_id);
CREATE INDEX IF NOT EXISTS idx_health_records_user_id ON public.health_records (user_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_pet_id     ON public.lab_results (pet_id);
CREATE INDEX IF NOT EXISTS idx_medications_pet_id     ON public.medications (pet_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_records_owner" ON public.health_records;
CREATE POLICY "health_records_owner" ON public.health_records
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.pets WHERE pets.id = health_records.pet_id AND pets.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "lab_results_owner" ON public.lab_results;
CREATE POLICY "lab_results_owner" ON public.lab_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pets WHERE pets.id = lab_results.pet_id AND pets.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "medications_owner" ON public.medications;
CREATE POLICY "medications_owner" ON public.medications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pets WHERE pets.id = medications.pet_id AND pets.owner_id = auth.uid())
  );

-- ── Storage bucket (run once in dashboard if not already created) ─────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('health-records', 'health-records', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (idempotent)
DROP POLICY IF EXISTS "health_records_upload"  ON storage.objects;
DROP POLICY IF EXISTS "health_records_read"    ON storage.objects;
DROP POLICY IF EXISTS "health_records_delete"  ON storage.objects;

CREATE POLICY "health_records_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'health-records' AND auth.uid() IS NOT NULL);

CREATE POLICY "health_records_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'health-records' AND auth.uid() IS NOT NULL);

CREATE POLICY "health_records_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'health-records' AND auth.uid() IS NOT NULL);
