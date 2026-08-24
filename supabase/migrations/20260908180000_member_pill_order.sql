-- Hub's quick-access pill row (Radar/School/Health/Ledger/etc.) had no
-- per-member customization at all — same fixed order for every kid/parent
-- in the family, and the row itself had no bottom breathing room, reading
-- as visually cut off against the page content right below it. This adds
-- a per-member pinned/reordered pill list, persisted so it survives
-- reinstall/new device rather than living only in local state.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS pill_order jsonb;
