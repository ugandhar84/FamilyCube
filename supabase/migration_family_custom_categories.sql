-- ── Family custom categories + suggestions ────────────────────────────────────
-- Covers both 'event' and 'quest' domains.
-- System categories stay hardcoded in the app; only family-invented ones live here.

-- Custom categories (e.g. "Homework Help", "Grocery Run" invented by a family)
CREATE TABLE IF NOT EXISTS public.family_custom_categories (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  domain        text        NOT NULL CHECK (domain IN ('event', 'quest')),
  key           text        NOT NULL,   -- slug used in calendar_events.category / quests.category
  label         text        NOT NULL,
  emoji         text        NOT NULL DEFAULT '✨',
  color         text        NOT NULL DEFAULT '#64748B',
  coins_default int,                    -- quest-only: suggested coin reward
  sort_order    int         NOT NULL DEFAULT 99,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, domain, key)
);

-- Custom suggestions — titles saved when a custom-category item is created
CREATE TABLE IF NOT EXISTS public.family_custom_suggestions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  domain      text        NOT NULL CHECK (domain IN ('event', 'quest')),
  category    text        NOT NULL,
  title       text        NOT NULL,
  use_count   int         NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, domain, title)
);

-- RLS
ALTER TABLE public.family_custom_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_custom_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_custom_categories_select" ON public.family_custom_categories
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  );
CREATE POLICY "family_custom_categories_insert" ON public.family_custom_categories
  FOR INSERT WITH CHECK (
    family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  );
CREATE POLICY "family_custom_categories_delete" ON public.family_custom_categories
  FOR DELETE USING (
    family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  );

CREATE POLICY "family_custom_suggestions_select" ON public.family_custom_suggestions
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  );
CREATE POLICY "family_custom_suggestions_upsert" ON public.family_custom_suggestions
  FOR INSERT WITH CHECK (
    family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  );
CREATE POLICY "family_custom_suggestions_update" ON public.family_custom_suggestions
  FOR UPDATE USING (
    family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fcc_family_domain  ON public.family_custom_categories(family_id, domain);
CREATE INDEX IF NOT EXISTS idx_fcs_family_domain  ON public.family_custom_suggestions(family_id, domain, category);
