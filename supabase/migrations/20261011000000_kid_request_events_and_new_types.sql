-- Append-only audit trail for kid_requests lifecycle actions.
-- kid_requests itself overwrites responded_at/responded_by/parent_note on every
-- transition, so prior state (e.g. an earlier assignment before a reassign) is
-- lost. This table keeps one row per action so the detail screen can render a
-- full history timeline.

CREATE TABLE IF NOT EXISTS public.kid_request_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  text        NOT NULL REFERENCES public.kid_requests(id) ON DELETE CASCADE,
  family_id   uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  event_type  text        NOT NULL CHECK (event_type IN (
    'created', 'approved', 'declined', 'assigned', 'reassigned',
    'completed', 'cancelled', 'gp_toggled', 'read',
    'items_approved', 'items_rejected', 'items_appended'
  )),
  actor_id    text        NOT NULL,
  note        text,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kid_request_events_request
  ON public.kid_request_events (request_id, created_at);

-- RLS — mirrors kid_requests' own family-scoped, client-writable shape
-- (no security-definer RPC gate; this is an audit log, not a state machine).
ALTER TABLE public.kid_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members read kid_request_events"
  ON public.kid_request_events FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "family members insert kid_request_events"
  ON public.kid_request_events FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );
