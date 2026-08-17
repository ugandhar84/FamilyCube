-- SECURITY FIX: enable Row Level Security on 19 tables that had RLS disabled
-- entirely (relrowsecurity = false), meaning no policy evaluation happened
-- at all — any caller holding the public anon key (baked into every install
-- of the mobile app) could read and write every row, in every family, no
-- login/session required. This is strictly worse than the "permissive
-- policy" problem fixed in 20260817120000_close_anon_rls_holes.sql, which
-- only covered tables where RLS was already ON.
--
-- Audit query used to find these 19 tables:
--   select c.relname from pg_class c join pg_namespace n on n.oid =
--   c.relnamespace where n.nspname='public' and c.relkind='r' and
--   c.relrowsecurity = false order by c.relname;
--
-- Standard scoping pattern (same as the prior migration): this app's real
-- family-membership table is public.members (members.id is text, e.g.
-- 'kid-1'; members.family_id is uuid). auth.uid() is always the PARENT's
-- Supabase auth session — kids/teens/seniors have no separate auth account
-- and share the parent's client session — so family-scoping is always:
--
--   family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
--
-- family_id is stored as `text` on every table below (storing the uuid
-- string form of families.id / members.family_id), so members.family_id is
-- cast ::text to compare. Verified via information_schema.columns per table
-- before writing each policy — not assumed.
--
-- Tables with no direct family_id column are scoped by joining through the
-- table that does carry one, matching each table's actual (undeclared, but
-- verified via app code + information_schema) relationship:
--   call_sessions            -> channel_id  -> chat_channels.family_id
--   chat_bookmarks            -> channel_id  -> chat_channels.family_id
--   chat_polls                -> channel_id  -> chat_channels.family_id
--   chat_reactions_detail      -> channel_id  -> chat_channels.family_id
--   chat_read_receipts         -> channel_id  -> chat_channels.family_id
--   chat_scheduled_messages    -> channel_id  -> chat_channels.family_id
--   chat_typing                -> channel_id  -> chat_channels.family_id
--   chat_presence               -> member_id   -> members.family_id (no channel/family col at all)
--   grocery_run_items          -> run_id      -> grocery_runs.family_id
-- chat_channels.family_id is itself `text`, already correctly RLS'd in the
-- prior migration (chat_channels_select/insert/update), so this migration
-- reuses that same "channel_id IN (SELECT id FROM chat_channels WHERE
-- family_id IN (...))" shape verified live via pg_policies.
--
-- ── Special cases ───────────────────────────────────────────────────────
--
-- global_med_suggestions: genuinely global, non-sensitive reference data —
-- a shared medication-name/category autocomplete dictionary with NO
-- family_id or any other family-scoping column anywhere in reach (confirmed
-- via information_schema.columns: name, category, hint, use_count,
-- created_at, updated_at only). Read via HealthTab.tsx's "global
-- suggestions" autocomplete (SELECT, no family filter — by design, it's
-- cross-family). Treated like app_config was in the prior migration: left
-- SELECT-able by any authenticated caller.
-- IMPORTANT WRINKLE: writes to this table happen via the
-- public.upsert_med_suggestion(p_name, p_category, p_hint) RPC, called
-- client-side from HealthTab.tsx after every medication save (fire-and-
-- forget, errors swallowed). That function is PLPGSQL but NOT
-- `SECURITY DEFINER` (prosecdef = false, confirmed via pg_proc) — it runs
-- as the CALLING role, so it is subject to RLS on global_med_suggestions
-- once enabled. A SELECT-only policy would silently break this RPC (the
-- insert/update inside it would be denied, but since the app code ignores
-- the RPC's result, medication saves would keep working while the
-- community-suggestion enrichment quietly stopped). To avoid that, this
-- migration also grants INSERT/UPDATE to any authenticated member — the
-- data is low-sensitivity (medication names/categories only, no patient
-- linkage, no family_id column to even scope by) and the table already
-- functions as a shared, cross-family dictionary by design.
--
-- medical_records / family_medications: the most sensitive tables in this
-- batch (real health data; medical_records already has 1 live row,
-- family_medications has 1 live row per prior audit). Both have a direct
-- `family_id text` column with no FK constraint declared (consistent with
-- every other family-scoped table in this schema — verified via
-- information_schema.table_constraints, which shows FKs to `members` only
-- via member_id/uploaded_by/assigned_by, never on family_id itself). Scoped
-- tightly with the standard members-based family_id pattern, all 4 verbs,
-- since the app performs full CRUD on both (HealthTab.tsx, RecordsTab.tsx).
--
-- Every table below is scoped to `authenticated` + the standard pattern.
-- None of these code paths run with no auth context — all reads/writes
-- happen from the RN client via the normal Supabase client (always carries
-- the parent's authenticated session) or from edge functions using the
-- SERVICE_ROLE key (gps-location-updater for geofences; parse-grocery-
-- receipt / grocery-ai-suggest for grocery_receipt_items / grocery_price_
-- cache), which bypasses RLS entirely and is therefore unaffected either
-- way. Confirmed via grep of store/*.ts, features/**/*.tsx, and
-- supabase/functions/**/*.ts for `.from('<table>')` before writing policies
-- for each table (see accompanying report for the full per-table grep
-- results) — no legitimate app read/write depends on a policy this
-- migration omits.
--
-- Currently-dormant tables (schema exists, zero rows, zero references in
-- app code or edge functions today — call_sessions, chat_bookmarks,
-- chat_polls, chat_presence, chat_reactions_detail, chat_read_receipts,
-- chat_scheduled_messages, chat_typing): still locked down now with
-- correctly-scoped policies rather than left wide open, since they clearly
-- exist for a planned chat-feature expansion (calls, polls, bookmarks,
-- reactions, read receipts, scheduled sends, typing indicators) and there's
-- no reason to ship that feature into a hole later.

-- ─────────────────────────────────────────────────────────────────────────
-- geofences — direct family_id (text). Full CRUD currently only via
-- gps-location-updater edge function (service role, bypasses RLS), but
-- policies added for when/if a client-facing "manage safe zones" UI lands.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geofences_select" ON public.geofences FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "geofences_insert" ON public.geofences FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "geofences_update" ON public.geofences FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "geofences_delete" ON public.geofences FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- family_medications — direct family_id (text). Full CRUD from
-- HealthTab.tsx (select/insert/update/delete all present).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.family_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_medications_select" ON public.family_medications FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_medications_insert" ON public.family_medications FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_medications_update" ON public.family_medications FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_medications_delete" ON public.family_medications FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- family_vaccines — direct family_id (text). Full CRUD from HealthTab.tsx.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.family_vaccines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_vaccines_select" ON public.family_vaccines FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_vaccines_insert" ON public.family_vaccines FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_vaccines_update" ON public.family_vaccines FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_vaccines_delete" ON public.family_vaccines FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- medical_records — direct family_id (text). Full CRUD from RecordsTab.tsx;
-- also read/updated by analyze-medical-record edge function (service role,
-- unaffected by RLS either way).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medical_records_select" ON public.medical_records FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "medical_records_insert" ON public.medical_records FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "medical_records_update" ON public.medical_records FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "medical_records_delete" ON public.medical_records FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- family_memories — direct family_id (text). Full CRUD from
-- MemoriesTab.tsx (select/insert/update-hearts/delete).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.family_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_memories_select" ON public.family_memories FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_memories_insert" ON public.family_memories FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_memories_update" ON public.family_memories FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_memories_delete" ON public.family_memories FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- global_med_suggestions — SPECIAL CASE: genuinely global reference data,
-- no family_id anywhere in reach. SELECT open to any authenticated user
-- (cross-family autocomplete dictionary, by design). INSERT/UPDATE also
-- granted to any authenticated user because the only writer,
-- upsert_med_suggestion(), is NOT security definer and runs as the calling
-- role — without these, that RPC's writes would be silently denied by RLS
-- (app code swallows the RPC's error, so medication saves would still
-- "succeed" while suggestion enrichment quietly broke). No DELETE policy:
-- nothing in the app deletes from this table.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.global_med_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_med_suggestions_select" ON public.global_med_suggestions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "global_med_suggestions_insert" ON public.global_med_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "global_med_suggestions_update" ON public.global_med_suggestions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_price_cache — direct family_id (text). No client-code references
-- today (grep of store/*.ts, features/**/*.tsx found none), but AGENTS.md
-- documents it as a family-scoped price cache intended to be read/written
-- by grocery-ai-suggest (service role, unaffected by RLS). Policies added
-- for when a client-facing price-cache read/write path lands, scoped
-- exactly like every other family table rather than left open.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.grocery_price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grocery_price_cache_select" ON public.grocery_price_cache FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_price_cache_insert" ON public.grocery_price_cache FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_price_cache_update" ON public.grocery_price_cache FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_receipts — direct family_id (text). Read from GroceryScreen.tsx;
-- inserted by parse-grocery-receipt edge function (service role).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.grocery_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grocery_receipts_select" ON public.grocery_receipts FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_receipts_insert" ON public.grocery_receipts FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_receipts_delete" ON public.grocery_receipts FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_receipt_items — no direct family_id, but DOES carry one (verified
-- via information_schema: family_id text present redundantly alongside the
-- receipt_id -> grocery_receipts FK). Scoped directly off that column to
-- keep the policy simple and consistent with grocery_receipts. Read via
-- embedded select in GroceryScreen.tsx; written by parse-grocery-receipt /
-- grocery-ai-suggest edge functions (service role).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.grocery_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grocery_receipt_items_select" ON public.grocery_receipt_items FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_receipt_items_insert" ON public.grocery_receipt_items FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_receipt_items_update" ON public.grocery_receipt_items FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_receipt_items_delete" ON public.grocery_receipt_items FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_runs — direct family_id (text). Full CRUD from groceryStore.ts,
-- GroceryScreen.tsx, QuestsScreen.tsx, EventFormModal.tsx.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.grocery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grocery_runs_select" ON public.grocery_runs FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_runs_insert" ON public.grocery_runs FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_runs_update" ON public.grocery_runs FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_runs_delete" ON public.grocery_runs FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_run_items — no family_id column at all; scoped via
-- run_id -> grocery_runs.family_id (FK confirmed via
-- information_schema.table_constraints). Full CRUD from groceryStore.ts /
-- QuestsScreen.tsx / EventFormModal.tsx (insert, upsert, update, delete all
-- present; no direct select filter beyond run_id but SELECT policy added
-- for completeness/defense in depth).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.grocery_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grocery_run_items_select" ON public.grocery_run_items FOR SELECT
  USING (run_id IN (
    SELECT id FROM public.grocery_runs
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "grocery_run_items_insert" ON public.grocery_run_items FOR INSERT
  WITH CHECK (run_id IN (
    SELECT id FROM public.grocery_runs
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "grocery_run_items_update" ON public.grocery_run_items FOR UPDATE
  USING (run_id IN (
    SELECT id FROM public.grocery_runs
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ))
  WITH CHECK (run_id IN (
    SELECT id FROM public.grocery_runs
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "grocery_run_items_delete" ON public.grocery_run_items FOR DELETE
  USING (run_id IN (
    SELECT id FROM public.grocery_runs
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_staples — direct family_id (text). Read/written from
-- GroceryScreen.tsx and SmartRestockBanner.tsx.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.grocery_staples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grocery_staples_select" ON public.grocery_staples FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_staples_insert" ON public.grocery_staples FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_staples_update" ON public.grocery_staples FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_staples_delete" ON public.grocery_staples FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- The remaining 8 tables are all part of an unshipped chat-feature
-- expansion (calls, polls, bookmarks, reactions, read receipts, scheduled
-- messages, typing indicators): zero rows, zero references in app code or
-- edge functions today (grep of store/*.ts, features/**/*.tsx,
-- supabase/functions/**/*.ts found nothing beyond the migrations that
-- created them). Locked down now with the same channel_id -> chat_channels
-- -> family_id join pattern chat_messages already uses (verified live via
-- pg_policies on chat_channels/chat_messages) rather than left world-
-- writable until that feature ships.
-- ─────────────────────────────────────────────────────────────────────────

-- call_sessions — channel_id -> chat_channels.family_id. family_id column
-- also exists directly on call_sessions but is nullable/unenforced, so the
-- channel join is used as the authoritative scope (matches call_sessions'
-- only FK: channel_id -> chat_channels.id).
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_sessions_select" ON public.call_sessions FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "call_sessions_insert" ON public.call_sessions FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "call_sessions_update" ON public.call_sessions FOR UPDATE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ))
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

-- chat_bookmarks — channel_id -> chat_channels.family_id.
ALTER TABLE public.chat_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_bookmarks_select" ON public.chat_bookmarks FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_bookmarks_insert" ON public.chat_bookmarks FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_bookmarks_delete" ON public.chat_bookmarks FOR DELETE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

-- chat_polls — channel_id -> chat_channels.family_id.
ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_polls_select" ON public.chat_polls FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_polls_insert" ON public.chat_polls FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_polls_update" ON public.chat_polls FOR UPDATE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ))
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

-- chat_presence — no channel/family column at all (member_id, status,
-- last_seen_at, active_channel, device_type, push_token). Scoped via
-- member_id -> members.family_id directly: a caller may only read/write
-- presence rows for members in their own family.
ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_presence_select" ON public.chat_presence FOR SELECT
  USING (member_id IN (
    SELECT id FROM public.members
    WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_presence_insert" ON public.chat_presence FOR INSERT
  WITH CHECK (member_id IN (
    SELECT id FROM public.members
    WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_presence_update" ON public.chat_presence FOR UPDATE
  USING (member_id IN (
    SELECT id FROM public.members
    WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  ))
  WITH CHECK (member_id IN (
    SELECT id FROM public.members
    WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  ));

-- chat_reactions_detail — channel_id -> chat_channels.family_id.
ALTER TABLE public.chat_reactions_detail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_reactions_detail_select" ON public.chat_reactions_detail FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_reactions_detail_insert" ON public.chat_reactions_detail FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_reactions_detail_delete" ON public.chat_reactions_detail FOR DELETE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

-- chat_read_receipts — channel_id -> chat_channels.family_id.
ALTER TABLE public.chat_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_read_receipts_select" ON public.chat_read_receipts FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_read_receipts_insert" ON public.chat_read_receipts FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_read_receipts_update" ON public.chat_read_receipts FOR UPDATE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ))
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

-- chat_scheduled_messages — channel_id -> chat_channels.family_id.
ALTER TABLE public.chat_scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_scheduled_messages_select" ON public.chat_scheduled_messages FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_scheduled_messages_insert" ON public.chat_scheduled_messages FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_scheduled_messages_update" ON public.chat_scheduled_messages FOR UPDATE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ))
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_scheduled_messages_delete" ON public.chat_scheduled_messages FOR DELETE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

-- chat_typing — channel_id -> chat_channels.family_id. Ephemeral typing
-- indicators: select/insert/update/delete (no long-lived data, rows expire
-- via expires_at, so all 4 verbs are plausible even though nothing writes
-- to it yet).
ALTER TABLE public.chat_typing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_typing_select" ON public.chat_typing FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_typing_insert" ON public.chat_typing FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_typing_update" ON public.chat_typing FOR UPDATE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ))
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));

CREATE POLICY "chat_typing_delete" ON public.chat_typing FOR DELETE
  USING (channel_id IN (
    SELECT id FROM public.chat_channels
    WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
  ));
