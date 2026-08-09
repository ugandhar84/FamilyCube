-- FurEver — Health Records feature
-- Run once: psql $DATABASE_URL < supabase/migration_health_records.sql

-- ── health_records table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.health_records (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id           uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name        text NOT NULL,
  file_url         text NOT NULL,
  file_type        text NOT NULL CHECK (file_type IN ('pdf', 'image')),
  status           text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  source           text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'camera')),
  ai_summary       text,
  extracted_data   jsonb,
  extraction_count integer NOT NULL DEFAULT 0,
  error_message    text,
  processed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── lab_results table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_results (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id          uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  name            text NOT NULL,
  result          text,
  interpretation  text,
  tested_at       date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── medications table (if not exists) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id      uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  name        text NOT NULL,
  dosage      text,
  frequency   text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly','monthly','as_needed')),
  start_date  date,
  end_date    date,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add frequency column if medications table already exists without it
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'daily';

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_health_records_pet_id  ON public.health_records (pet_id);
CREATE INDEX IF NOT EXISTS idx_health_records_user_id ON public.health_records (user_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_pet_id     ON public.lab_results (pet_id);
CREATE INDEX IF NOT EXISTS idx_medications_pet_id     ON public.medications (pet_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications    ENABLE ROW LEVEL SECURITY;

-- health_records: owner only
CREATE POLICY "health_records_owner" ON public.health_records
  FOR ALL USING (auth.uid() = user_id);

-- lab_results: via pet ownership
CREATE POLICY "lab_results_owner" ON public.lab_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pets WHERE pets.id = lab_results.pet_id AND pets.user_id = auth.uid())
  );

-- medications: via pet ownership
CREATE POLICY "medications_owner" ON public.medications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.pets WHERE pets.id = medications.pet_id AND pets.user_id = auth.uid())
  );

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Run in Supabase dashboard → Storage → New bucket:
--   Name: health-records
--   Public: true (for signed URL access by the edge function)
--
-- Or via SQL (requires pg_net / storage extension):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('health-records', 'health-records', true)
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload/read their own pets' files
-- Apply in dashboard → Storage → health-records → Policies:
--
-- SELECT policy:  (auth.uid() IS NOT NULL)
-- INSERT policy:  (auth.uid() IS NOT NULL)
-- DELETE policy:  (auth.uid() IS NOT NULL)
