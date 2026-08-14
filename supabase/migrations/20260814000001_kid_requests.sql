-- Kid requests: grocery, supplies, permission, question, medication, etc.
-- items JSONB stores per-item approval state for grocery/supplies requests.

CREATE TABLE IF NOT EXISTS public.kid_requests (
  id              text        PRIMARY KEY,
  family_id       uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  from_member_id  text        NOT NULL,
  to_member_id    text,
  type            text        NOT NULL,
  urgency         text        NOT NULL DEFAULT 'normal',
  detail          text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'pending',
  items           jsonb,                          -- KidRequestItem[] for grocery/supplies
  requested_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  read_at         timestamptz,
  responded_at    timestamptz,
  responded_by    text,
  parent_note     text,
  attachment_url  text,
  assigned_helper text,
  reward_coins    int,
  scheduled_date  text,
  scheduled_time  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kid_requests_family   ON public.kid_requests (family_id);
CREATE INDEX IF NOT EXISTS idx_kid_requests_member   ON public.kid_requests (from_member_id);
CREATE INDEX IF NOT EXISTS idx_kid_requests_status   ON public.kid_requests (status);

-- updated_at auto-maintenance
CREATE OR REPLACE FUNCTION public.set_kid_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_kid_requests_updated_at ON public.kid_requests;
CREATE TRIGGER trg_kid_requests_updated_at
  BEFORE UPDATE ON public.kid_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_kid_requests_updated_at();

-- RLS
ALTER TABLE public.kid_requests ENABLE ROW LEVEL SECURITY;

-- Family members can read requests in their family
CREATE POLICY "family members read kid_requests"
  ON public.kid_requests FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

-- Kids can insert their own requests
CREATE POLICY "kid insert own requests"
  ON public.kid_requests FOR INSERT
  WITH CHECK (from_member_id = auth.uid()::text);

-- Family members can update requests in their family (parents approve/reject; kids withdraw)
CREATE POLICY "family members update kid_requests"
  ON public.kid_requests FOR UPDATE
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

-- Kids can delete their own pending requests
CREATE POLICY "kid delete own pending requests"
  ON public.kid_requests FOR DELETE
  USING (
    from_member_id = auth.uid()::text AND status = 'pending'
  );
