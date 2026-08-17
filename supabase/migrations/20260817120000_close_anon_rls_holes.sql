-- SECURITY FIX: close cross-family / fully-anonymous data exposure via RLS.
--
-- A live-DB audit (pg_policies) found 26 tables with at least one permissive
-- policy granting roles={public} (which includes the unauthenticated `anon`
-- role — the key baked into every mobile app install) with qual = 'true' or
-- with_check = 'true'. Postgres RLS is permissive/OR'd across all matching
-- policies for a given table+command, so a single such policy defeats every
-- other, correctly-scoped policy on that same table+command. In practice this
-- meant ANY caller with just the public anon key — no login, no family
-- membership — could read and write every row in every family, across
-- members (incl. PIN codes), live GPS (member_locations), chat messages,
-- chore/quest data, coin/reward data, calendar events, grocery lists,
-- notifications, and more.
--
-- These policies are consistently named "Allow anon <verb> <noun>", plus a
-- handful of not-so-named ones (e.g. calendar_events_select, quests_select,
-- chat_read/chat_write) that turned out to carry the same qual/with_check =
-- true problem. All are dropped below by exact name.
--
-- For every table+command that had ONLY the dangerous policy (i.e. dropping
-- it would leave the command with zero policies, which under RLS means
-- nobody — not even legitimate family members — could use it), a correctly
-- scoped replacement is added using this app's standard pattern:
--
--   family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
--
-- members.id is text (human-readable ids), auth.uid() is a uuid representing
-- the parent's Supabase auth session (kids/teens/seniors share it — there is
-- no per-member auth account), hence the ::text cast. Tables with no direct
-- family_id column are scoped via a join/EXISTS through the table that does
-- carry one (documented per table below).
--
-- chore_tasks is a special case: it already had a family-scoped policy
-- alongside the dangerous ones, but that policy (from migration
-- 20260815000012_fix_chore_tasks_rls.sql) references `family_members`, a
-- separate, empty, dead table — not the real `members` table. It is replaced
-- here with the standard members-based pattern, preserving its existing
-- parent_only_quest visibility rule.
--
-- push_tokens_update is also a special case: not a blanket "Allow anon"
-- policy, but its USING clause was `true` (any row targetable) even though
-- its WITH CHECK correctly required user_id = auth.uid(). That let a caller
-- overwrite any other user's push-token row (as long as the new value passed
-- the check). Tightened to match the other push_tokens policies.
--
-- This migration also closes a second, smaller-blast-radius hole in the same
-- pass: family_invites, grandparent_matches, point_transactions,
-- quest_participants, and user_badges had qual/with_check = true scoped to
-- roles={authenticated} — blocking anon, but still letting any signed-in
-- user from ANY family read/write every other family's invite codes, coin
-- transactions, GP-match funding, quest claims, and badges. Fixed the same
-- way, via the members-based family scope (joined through user_id/member_id/
-- child_id/grandparent_id where the table has no direct family_id).
-- family_invites' client-facing SELECT/UPDATE didn't need to stay broad —
-- redemption already happens server-side via the join-family edge function,
-- which uses the service-role key and so is unaffected by RLS.
--
-- Out of scope for this migration (see accompanying report):
--   - app_config: SELECT-only, no sensitive data (feature-flag style
--     key/value config, currently empty) — left public-readable by design.
--     No write policy exists for it at all, so writes remain default-denied.
--   - Several tables have RLS disabled entirely (e.g. medical_records,
--     family_medications, geofences, chat_typing, grocery_runs, etc.) — flagged
--     separately, not in scope for a policy-only fix.

-- ─────────────────────────────────────────────────────────────────────────
-- app_config — SELECT only, left as-is (see note above). No changes.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- audit_log — no family_id column; scoped via actor_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert audit" ON public.audit_log;
DROP POLICY IF EXISTS "Allow anon read audit"   ON public.audit_log;

CREATE POLICY "audit_log family insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (
    actor_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (
        SELECT family_id FROM public.members WHERE id = auth.uid()::text
      )
    )
  );

CREATE POLICY "audit_log family read"
  ON public.audit_log FOR SELECT
  USING (
    actor_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (
        SELECT family_id FROM public.members WHERE id = auth.uid()::text
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- calendar_events — direct family_id (text)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "calendar_events_delete"    ON public.calendar_events;
DROP POLICY IF EXISTS "Allow anon insert events"  ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_insert"    ON public.calendar_events;
DROP POLICY IF EXISTS "Allow anon read events"    ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_select"    ON public.calendar_events;
DROP POLICY IF EXISTS "Allow anon update events"  ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_update"    ON public.calendar_events;

CREATE POLICY "calendar_events_select"
  ON public.calendar_events FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "calendar_events_insert"
  ON public.calendar_events FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "calendar_events_update"
  ON public.calendar_events FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "calendar_events_delete"
  ON public.calendar_events FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- chat_channels — direct family_id (text)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert channels" ON public.chat_channels;
DROP POLICY IF EXISTS "Allow anon read channels"   ON public.chat_channels;
DROP POLICY IF EXISTS "Allow anon update channels" ON public.chat_channels;

CREATE POLICY "chat_channels_select"
  ON public.chat_channels FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "chat_channels_insert"
  ON public.chat_channels FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "chat_channels_update"
  ON public.chat_channels FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- chat_messages — no family_id column; scoped via channel_id -> chat_channels.family_id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chat_delete"           ON public.chat_messages;
DROP POLICY IF EXISTS "Allow anon insert chat" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_write"            ON public.chat_messages;
DROP POLICY IF EXISTS "Allow anon read chat"   ON public.chat_messages;
DROP POLICY IF EXISTS "chat_read"             ON public.chat_messages;
DROP POLICY IF EXISTS "Allow anon update chat" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_update"           ON public.chat_messages;

CREATE POLICY "chat_messages_select"
  ON public.chat_messages FOR SELECT
  USING (
    channel_id IN (
      SELECT id FROM public.chat_channels
      WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "chat_messages_insert"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    channel_id IN (
      SELECT id FROM public.chat_channels
      WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "chat_messages_update"
  ON public.chat_messages FOR UPDATE
  USING (
    channel_id IN (
      SELECT id FROM public.chat_channels
      WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    channel_id IN (
      SELECT id FROM public.chat_channels
      WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "chat_messages_delete"
  ON public.chat_messages FOR DELETE
  USING (
    channel_id IN (
      SELECT id FROM public.chat_channels
      WHERE family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- chore_tasks — direct family_id (text). Replaces the dead-table
-- (`family_members`) policies from 20260815000012_fix_chore_tasks_rls.sql
-- with the correct `members`-based pattern, preserving the parent_only_quest
-- visibility rule (kids can't see parent-only quest rows for their family).
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chore_tasks family write" ON public.chore_tasks;
DROP POLICY IF EXISTS "Allow anon insert tasks"  ON public.chore_tasks;
DROP POLICY IF EXISTS "Allow anon read tasks"    ON public.chore_tasks;
DROP POLICY IF EXISTS "chore_tasks family read"  ON public.chore_tasks;
DROP POLICY IF EXISTS "Allow anon update tasks"  ON public.chore_tasks;

CREATE POLICY "chore_tasks family read"
  ON public.chore_tasks FOR SELECT
  USING (
    family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text)
    AND (
      category_type IS DISTINCT FROM 'parent_only_quest'
      OR EXISTS (
        SELECT 1 FROM public.members
        WHERE id = auth.uid()::text
          AND role = 'parent'
          AND family_id::text = chore_tasks.family_id
      )
    )
  );

CREATE POLICY "chore_tasks family write"
  ON public.chore_tasks FOR ALL
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- comments — no family_id column; polymorphic subject (subject_type/subject_id)
-- with no enforceable FK. Only enforceable, safe scope available is the
-- author's own family via author_id -> members. This still leaves comments
-- readable by the author's whole family (matches the family-wide visibility
-- pattern used everywhere else in this app) rather than per-subject scoping,
-- since subject_type is polymorphic and not consistently backed by a single
-- FK-able table.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon delete comments" ON public.comments;
DROP POLICY IF EXISTS "Allow anon insert comments" ON public.comments;
DROP POLICY IF EXISTS "Allow anon read comments"   ON public.comments;
DROP POLICY IF EXISTS "Allow anon update comments" ON public.comments;

CREATE POLICY "comments family read"
  ON public.comments FOR SELECT
  USING (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "comments family insert"
  ON public.comments FOR INSERT
  WITH CHECK (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "comments family update"
  ON public.comments FOR UPDATE
  USING (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "comments family delete"
  ON public.comments FOR DELETE
  USING (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- daily_streaks — no family_id column; scoped via member_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert streaks" ON public.daily_streaks;
DROP POLICY IF EXISTS "Allow anon read streaks"   ON public.daily_streaks;
DROP POLICY IF EXISTS "Allow anon update streaks" ON public.daily_streaks;

CREATE POLICY "daily_streaks family read"
  ON public.daily_streaks FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "daily_streaks family insert"
  ON public.daily_streaks FOR INSERT
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "daily_streaks family update"
  ON public.daily_streaks FOR UPDATE
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- family_goals — no family_id column and no FK to any family-scoped table
-- (id, title, target_xp, current_xp, voting_open, options, winning_option_id,
-- unlocked_at, created_at only). There is no column to scope by at all.
-- Also unreferenced anywhere in current app source (0 matches for
-- 'family_goals' outside migrations) — appears to be an unused/legacy table.
-- Correct fix is to restrict it to authenticated users only (removes anon
-- access, the actual reported hole) rather than inventing a family_id column
-- that doesn't exist. If this feature is revived, it will need a real
-- family_id column added first.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert goals" ON public.family_goals;
DROP POLICY IF EXISTS "Allow anon read goals"   ON public.family_goals;
DROP POLICY IF EXISTS "Allow anon update goals" ON public.family_goals;

CREATE POLICY "family_goals authenticated read"
  ON public.family_goals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "family_goals authenticated insert"
  ON public.family_goals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "family_goals authenticated update"
  ON public.family_goals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- family_meals — direct family_id (text)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon delete meals" ON public.family_meals;
DROP POLICY IF EXISTS "Allow anon insert meals" ON public.family_meals;
DROP POLICY IF EXISTS "Allow anon read meals"   ON public.family_meals;
DROP POLICY IF EXISTS "Allow anon update meals" ON public.family_meals;

CREATE POLICY "family_meals_select"
  ON public.family_meals FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_meals_insert"
  ON public.family_meals FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_meals_update"
  ON public.family_meals FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_meals_delete"
  ON public.family_meals FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- family_photos — no family_id column; scoped via uploaded_by -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon delete photos" ON public.family_photos;
DROP POLICY IF EXISTS "Allow anon insert photos" ON public.family_photos;
DROP POLICY IF EXISTS "Allow anon read photos"   ON public.family_photos;
DROP POLICY IF EXISTS "Allow anon update photos" ON public.family_photos;

CREATE POLICY "family_photos family read"
  ON public.family_photos FOR SELECT
  USING (
    uploaded_by IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "family_photos family insert"
  ON public.family_photos FOR INSERT
  WITH CHECK (
    uploaded_by IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "family_photos family update"
  ON public.family_photos FOR UPDATE
  USING (
    uploaded_by IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    uploaded_by IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "family_photos family delete"
  ON public.family_photos FOR DELETE
  USING (
    uploaded_by IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- family_posts — no family_id column; scoped via author_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon delete posts" ON public.family_posts;
DROP POLICY IF EXISTS "Allow anon insert posts" ON public.family_posts;
DROP POLICY IF EXISTS "Allow anon read posts"   ON public.family_posts;
DROP POLICY IF EXISTS "Allow anon update posts" ON public.family_posts;

CREATE POLICY "family_posts family read"
  ON public.family_posts FOR SELECT
  USING (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "family_posts family insert"
  ON public.family_posts FOR INSERT
  WITH CHECK (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "family_posts family update"
  ON public.family_posts FOR UPDATE
  USING (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "family_posts family delete"
  ON public.family_posts FOR DELETE
  USING (
    author_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_items — direct family_id (text)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon delete groceries" ON public.grocery_items;
DROP POLICY IF EXISTS "Allow anon insert groceries" ON public.grocery_items;
DROP POLICY IF EXISTS "Allow anon read groceries"   ON public.grocery_items;
DROP POLICY IF EXISTS "Allow anon update groceries" ON public.grocery_items;

CREATE POLICY "grocery_items_select"
  ON public.grocery_items FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_items_insert"
  ON public.grocery_items FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_items_update"
  ON public.grocery_items FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "grocery_items_delete"
  ON public.grocery_items FOR DELETE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- help_requests — direct family_id (text)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family members can insert help requests" ON public.help_requests;
DROP POLICY IF EXISTS "family members can read help requests"   ON public.help_requests;
DROP POLICY IF EXISTS "family members can update help requests" ON public.help_requests;

CREATE POLICY "help_requests family read"
  ON public.help_requests FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "help_requests family insert"
  ON public.help_requests FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "help_requests family update"
  ON public.help_requests FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- member_locations — direct family_id (text). This is the live-GPS table —
-- the single most sensitive table in the whole audit.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert locations" ON public.member_locations;
DROP POLICY IF EXISTS "Allow anon read locations"   ON public.member_locations;
DROP POLICY IF EXISTS "Allow anon update locations" ON public.member_locations;

CREATE POLICY "member_locations_select"
  ON public.member_locations FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "member_locations_insert"
  ON public.member_locations FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "member_locations_update"
  ON public.member_locations FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- members — the row itself carries family_id (uuid) and pin. Self-referential
-- scope: a caller may see/write member rows in their own family only.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert all" ON public.members;
DROP POLICY IF EXISTS "Allow anon read all"   ON public.members;
DROP POLICY IF EXISTS "Allow anon update all" ON public.members;

CREATE POLICY "members_select"
  ON public.members FOR SELECT
  USING (
    id = auth.uid()::text
    OR family_id IN (SELECT family_id FROM public.members m WHERE m.id = auth.uid()::text)
  );

CREATE POLICY "members_insert"
  ON public.members FOR INSERT
  WITH CHECK (
    id = auth.uid()::text
    OR family_id IN (SELECT family_id FROM public.members m WHERE m.id = auth.uid()::text)
  );

CREATE POLICY "members_update"
  ON public.members FOR UPDATE
  USING (
    id = auth.uid()::text
    OR family_id IN (SELECT family_id FROM public.members m WHERE m.id = auth.uid()::text)
  )
  WITH CHECK (
    id = auth.uid()::text
    OR family_id IN (SELECT family_id FROM public.members m WHERE m.id = auth.uid()::text)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- notification_preferences — no family_id column; scoped via member_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert notif_prefs" ON public.notification_preferences;
DROP POLICY IF EXISTS "Allow anon read notif_prefs"   ON public.notification_preferences;
DROP POLICY IF EXISTS "Allow anon update notif_prefs" ON public.notification_preferences;

CREATE POLICY "notification_preferences family read"
  ON public.notification_preferences FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "notification_preferences family insert"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "notification_preferences family update"
  ON public.notification_preferences FOR UPDATE
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- notifications — has BOTH family_id (text) and member_id (text). Scope by
-- family_id (matches how every other family-wide table here is scoped, and
-- matches the family-shared-session auth model), covering rows whichever way
-- they were populated.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow anon read notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Allow anon update notifications" ON public.notifications;

CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id::text FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- post_reactions — no family_id column; scoped via member_id -> members.id
-- (post_id -> family_posts also has no family_id, so member_id is the only
-- enforceable path, same reasoning as comments above)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon delete post_reactions" ON public.post_reactions;
DROP POLICY IF EXISTS "Allow anon insert post_reactions" ON public.post_reactions;
DROP POLICY IF EXISTS "Allow anon read post_reactions"   ON public.post_reactions;

CREATE POLICY "post_reactions family read"
  ON public.post_reactions FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "post_reactions family insert"
  ON public.post_reactions FOR INSERT
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "post_reactions family delete"
  ON public.post_reactions FOR DELETE
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- push_tokens — not an "Allow anon" policy, but push_tokens_update had
-- USING(true) (any row targetable) even though WITH CHECK already required
-- user_id = auth.uid(). That allowed overwriting another user's token row.
-- Tighten USING to match the table's other, already-correct policies.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "push_tokens_update" ON public.push_tokens;

CREATE POLICY "push_tokens_update"
  ON public.push_tokens FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- quests — direct family_id (uuid). members.family_id is also uuid here, so
-- no ::text cast needed on that side of the comparison.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quests_delete" ON public.quests;
DROP POLICY IF EXISTS "quests_insert" ON public.quests;
DROP POLICY IF EXISTS "quests_select" ON public.quests;
DROP POLICY IF EXISTS "quests_update" ON public.quests;

CREATE POLICY "quests_select"
  ON public.quests FOR SELECT
  USING (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "quests_insert"
  ON public.quests FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "quests_update"
  ON public.quests FOR UPDATE
  USING (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "quests_delete"
  ON public.quests FOR DELETE
  USING (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- reward_items — a shared reward catalog (id, title, description, coin_cost,
-- icon, category, stock, is_screen_time_pass) with no family_id column and
-- no FK linking it to any family. Everything in it is non-sensitive catalog
-- data (reward names/prices), not per-family data, and the app has no
-- concept of a per-family custom catalog for this table. Left readable by
-- any authenticated user (removing anon, which was the actual hole);
-- inserts (catalog management) restricted to authenticated users too, since
-- there is no admin/role flag on members to check.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert rewards" ON public.reward_items;
DROP POLICY IF EXISTS "Allow anon read rewards"   ON public.reward_items;

CREATE POLICY "reward_items authenticated read"
  ON public.reward_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "reward_items authenticated insert"
  ON public.reward_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- reward_redemptions — no family_id column; scoped via member_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon insert redemptions" ON public.reward_redemptions;
DROP POLICY IF EXISTS "Allow anon read redemptions"   ON public.reward_redemptions;
DROP POLICY IF EXISTS "Allow anon update redemptions" ON public.reward_redemptions;

CREATE POLICY "reward_redemptions family read"
  ON public.reward_redemptions FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "reward_redemptions family insert"
  ON public.reward_redemptions FOR INSERT
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

CREATE POLICY "reward_redemptions family update"
  ON public.reward_redemptions FOR UPDATE
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- family_invites — direct family_id (uuid, matches members.family_id — no
-- cast needed). Redemption by an outside invitee happens via the
-- join-family edge function (service-role key, bypasses RLS), so tightening
-- client-facing access to "your own family's invites only" doesn't break
-- redemption.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family members can insert invites"      ON public.family_invites;
DROP POLICY IF EXISTS "authenticated can read invites"         ON public.family_invites;
DROP POLICY IF EXISTS "authenticated can update invite status" ON public.family_invites;

CREATE POLICY "family_invites family select"
  ON public.family_invites FOR SELECT
  TO authenticated
  USING (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text));

CREATE POLICY "family_invites family insert"
  ON public.family_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
  );

CREATE POLICY "family_invites family update"
  ON public.family_invites FOR UPDATE
  TO authenticated
  USING (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- grandparent_matches — direct family_id (uuid, matches members.family_id)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "signed-in family access" ON public.grandparent_matches;

CREATE POLICY "grandparent_matches family access"
  ON public.grandparent_matches FOR ALL
  TO authenticated
  USING (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text))
  WITH CHECK (family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- point_transactions — no family_id column; scoped via user_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "signed-in family access" ON public.point_transactions;

CREATE POLICY "point_transactions family access"
  ON public.point_transactions FOR ALL
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- quest_participants — no family_id column; scoped via member_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "qp_all"                    ON public.quest_participants;
DROP POLICY IF EXISTS "quest_participants_delete" ON public.quest_participants;
DROP POLICY IF EXISTS "quest_participants_insert" ON public.quest_participants;
DROP POLICY IF EXISTS "quest_participants_select" ON public.quest_participants;
DROP POLICY IF EXISTS "quest_participants_update" ON public.quest_participants;

CREATE POLICY "quest_participants family access"
  ON public.quest_participants FOR ALL
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- user_badges — no family_id column; scoped via user_id -> members.id
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "signed-in family access" ON public.user_badges;

CREATE POLICY "user_badges family access"
  ON public.user_badges FOR ALL
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.members
      WHERE family_id IN (SELECT family_id FROM public.members WHERE id = auth.uid()::text)
    )
  );
