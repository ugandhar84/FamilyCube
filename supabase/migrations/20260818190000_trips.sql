-- Pick-up Radar "En Route" trips — one row per active/recent dispatch.
-- Lets the requester's own Hub (kid/teen/senior) see live driver progress,
-- not just the driver's own device. At most one active trip per driver is
-- expected client-side; overdue_alert_sent guards the one-time 5-min-late
-- escalation broadcast so it doesn't refire on every client re-render.

CREATE TABLE IF NOT EXISTS public.trips (
  id                  text        PRIMARY KEY,
  family_id           uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  driver_member_id    text        NOT NULL,
  -- Null when broadcasting generically ("picking up Family") rather than a
  -- specific linked ride.
  pickup_member_id    text,
  eta_minutes         int         NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  overdue_alert_sent  boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trips_family ON public.trips (family_id);
CREATE INDEX IF NOT EXISTS idx_trips_active ON public.trips (family_id) WHERE completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_trips_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_trips_updated_at ON public.trips;
CREATE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_trips_updated_at();

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members read trips"
  ON public.trips FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "family members insert trips"
  ON public.trips FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

-- Any family member can update (e.g. driver adjusts ETA, marks pickup
-- done, or the escalation job flips overdue_alert_sent) — scoped to their
-- own family, same as kid_requests.
CREATE POLICY "family members update trips"
  ON public.trips FOR UPDATE
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );
