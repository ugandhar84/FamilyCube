-- ── Event categories reference table ─────────────────────────────────────────
-- Replaces hardcoded CHECK constraint so categories are DB-managed data.
-- family_id NULL = system/global category; non-null = family-custom category.

CREATE TABLE IF NOT EXISTS public.event_categories (
  key               text        PRIMARY KEY,
  emoji             text        NOT NULL,
  label             text        NOT NULL,
  color             text        NOT NULL,
  sort_order        int         NOT NULL DEFAULT 99,
  is_custom_allowed boolean     NOT NULL DEFAULT false,
  family_id         uuid        REFERENCES public.families(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.event_categories (key, emoji, label, color, sort_order, is_custom_allowed)
VALUES
  ('Medical',  '🏥', 'Medical',  '#EF4444', 1, false),
  ('Sports',   '🏅', 'Sports',   '#F59E0B', 2, false),
  ('Study',    '📚', 'Study',    '#3B82F6', 3, false),
  ('Ride',     '🚗', 'Ride',     '#10B981', 4, false),
  ('Work',     '💼', 'Work',     '#A855F7', 5, false),
  ('Event',    '🎉', 'Event',    '#6C5CE7', 6, false),
  ('Birthday', '🎂', 'Birthday', '#F59E0B', 7, false),
  ('Errand',   '🛒', 'Errand',   '#0EA5E9', 8, false),
  ('Other',    '✨', 'Other',    '#64748B', 9, true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_event_categories" ON public.event_categories
  FOR SELECT USING (
    family_id IS NULL
    OR family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

CREATE POLICY "insert_custom_category" ON public.event_categories
  FOR INSERT WITH CHECK (
    family_id IS NOT NULL
    AND family_id IN (
      SELECT family_id FROM public.members WHERE id = auth.uid()::text
    )
  );

-- Drop old hardcoded CHECK and replace with a FK to the reference table
ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_category_check;

ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_category_fk
    FOREIGN KEY (category) REFERENCES public.event_categories(key)
    ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_category ON public.calendar_events(category);
