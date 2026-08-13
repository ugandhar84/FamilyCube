-- ============================================================
-- MEDICAL RECORDS — vault table + RLS + storage bucket
-- Run once:  psql $DATABASE_URL < supabase/migration_medical_records.sql
-- ============================================================

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medical_records (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         text        NOT NULL,
  member_id         text        REFERENCES public.members(id) ON DELETE CASCADE,
  uploaded_by       text        REFERENCES public.members(id),
  title             text        NOT NULL,
  tag               text        NOT NULL DEFAULT 'other',
  record_date       text        NOT NULL,
  file_path         text,                           -- path in 'medical-records' bucket
  file_name         text,
  file_size         bigint,
  notes             text,
  ai_summary        text,                           -- plain-language summary (approved)
  ai_tags           jsonb       NOT NULL DEFAULT '[]',
  ai_analysis_json  jsonb,                          -- full analysis blob (approved, encrypted at rest)
  ai_analyzed       boolean     NOT NULL DEFAULT false,  -- true = user approved, button locked
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medrec_family  ON public.medical_records(family_id);
CREATE INDEX IF NOT EXISTS idx_medrec_member  ON public.medical_records(member_id);
CREATE INDEX IF NOT EXISTS idx_medrec_date    ON public.medical_records(record_date DESC);

-- ── RLS: family members see only their family's records ───────────────────────
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medrec_family_select ON public.medical_records;
CREATE POLICY medrec_family_select ON public.medical_records
  FOR SELECT USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS medrec_family_insert ON public.medical_records;
CREATE POLICY medrec_family_insert ON public.medical_records
  FOR INSERT WITH CHECK (
    family_id IN (
      SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS medrec_family_update ON public.medical_records;
CREATE POLICY medrec_family_update ON public.medical_records
  FOR UPDATE USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS medrec_family_delete ON public.medical_records;
CREATE POLICY medrec_family_delete ON public.medical_records
  FOR DELETE USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- ── Storage bucket ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('medical-records', 'medical-records', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS: family members can read/write files in their own family folder
DROP POLICY IF EXISTS medrec_storage_select ON storage.objects;
CREATE POLICY medrec_storage_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] IN (
      SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS medrec_storage_insert ON storage.objects;
CREATE POLICY medrec_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] IN (
      SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS medrec_storage_delete ON storage.objects;
CREATE POLICY medrec_storage_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] IN (
      SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- ── updated_at trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS medrec_updated_at ON public.medical_records;
CREATE TRIGGER medrec_updated_at
  BEFORE UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
