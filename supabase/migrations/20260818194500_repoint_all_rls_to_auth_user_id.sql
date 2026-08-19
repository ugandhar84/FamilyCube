-- Repoints every RLS policy that scoped access via
--   ... WHERE id = auth.uid()::text
-- (the broken pattern — members.id has never equaled auth.uid() for anyone,
-- see migration 20260818192700's header) to use the now-correct
-- auth_user_id column via public.current_user_family_id(), which that
-- migration already fixed. This migration touches every OTHER table that
-- inlined the same broken subquery instead of calling the helper function —
-- policy shape (which columns, USING vs WITH CHECK, command, roles) is
-- preserved exactly from the originals in 20260814000001_kid_requests.sql,
-- 20260815000001_kid_requests_rls_fix.sql, 20260817120000_close_anon_rls_holes.sql,
-- 20260817130000_enable_rls_disabled_tables.sql,
-- 20260817150000_responsibility_engine_phase1.sql, and 20260818190000_trips.sql —
-- only the identity subquery itself changes.
--
-- Every "family_id IN (SELECT family_id[::text] FROM public.members WHERE
-- id = auth.uid()::text)" becomes "family_id = public.current_user_family_id()"
-- (or ::text cast where the column is text). Every nested "... IN (SELECT id
-- FROM public.members WHERE family_id IN (SELECT family_id FROM
-- public.members WHERE id = auth.uid()::text))" becomes "... IN (SELECT id
-- FROM public.members WHERE family_id = public.current_user_family_id())".

-- ─────────────────────────────────────────────────────────────────────────
-- audit_log
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log family insert" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log family read"   ON public.audit_log;

CREATE POLICY "audit_log family insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (actor_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

CREATE POLICY "audit_log family read"
  ON public.audit_log FOR SELECT
  USING (actor_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- calendar_events
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "calendar_events_select" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_insert" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_update" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_delete" ON public.calendar_events;

CREATE POLICY "calendar_events_select" ON public.calendar_events FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "calendar_events_insert" ON public.calendar_events FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "calendar_events_update" ON public.calendar_events FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "calendar_events_delete" ON public.calendar_events FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- chat_channels
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chat_channels_select" ON public.chat_channels;
DROP POLICY IF EXISTS "chat_channels_insert" ON public.chat_channels;
DROP POLICY IF EXISTS "chat_channels_update" ON public.chat_channels;

CREATE POLICY "chat_channels_select" ON public.chat_channels FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "chat_channels_insert" ON public.chat_channels FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "chat_channels_update" ON public.chat_channels FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- chat_messages
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;

CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_messages_insert" ON public.chat_messages FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_messages_update" ON public.chat_messages FOR UPDATE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_messages_delete" ON public.chat_messages FOR DELETE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- chore_tasks
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "chore_tasks family read"  ON public.chore_tasks;
DROP POLICY IF EXISTS "chore_tasks family write" ON public.chore_tasks;

CREATE POLICY "chore_tasks family read"
  ON public.chore_tasks FOR SELECT
  USING (
    family_id = public.current_user_family_id()::text
    AND (
      category_type IS DISTINCT FROM 'parent_only_quest'
      OR EXISTS (
        SELECT 1 FROM public.members
        WHERE auth_user_id = auth.uid()
          AND role = 'parent'
          AND family_id::text = chore_tasks.family_id
      )
    )
  );

CREATE POLICY "chore_tasks family write"
  ON public.chore_tasks FOR ALL
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- comments
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comments family read"   ON public.comments;
DROP POLICY IF EXISTS "comments family insert" ON public.comments;
DROP POLICY IF EXISTS "comments family update" ON public.comments;
DROP POLICY IF EXISTS "comments family delete" ON public.comments;

CREATE POLICY "comments family read" ON public.comments FOR SELECT
  USING (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "comments family insert" ON public.comments FOR INSERT
  WITH CHECK (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "comments family update" ON public.comments FOR UPDATE
  USING (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "comments family delete" ON public.comments FOR DELETE
  USING (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- daily_streaks
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "daily_streaks family read"   ON public.daily_streaks;
DROP POLICY IF EXISTS "daily_streaks family insert" ON public.daily_streaks;
DROP POLICY IF EXISTS "daily_streaks family update" ON public.daily_streaks;

CREATE POLICY "daily_streaks family read" ON public.daily_streaks FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "daily_streaks family insert" ON public.daily_streaks FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "daily_streaks family update" ON public.daily_streaks FOR UPDATE
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- family_meals
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_meals_select" ON public.family_meals;
DROP POLICY IF EXISTS "family_meals_insert" ON public.family_meals;
DROP POLICY IF EXISTS "family_meals_update" ON public.family_meals;
DROP POLICY IF EXISTS "family_meals_delete" ON public.family_meals;

CREATE POLICY "family_meals_select" ON public.family_meals FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_meals_insert" ON public.family_meals FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_meals_update" ON public.family_meals FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_meals_delete" ON public.family_meals FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- family_photos
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_photos family read"   ON public.family_photos;
DROP POLICY IF EXISTS "family_photos family insert" ON public.family_photos;
DROP POLICY IF EXISTS "family_photos family update" ON public.family_photos;
DROP POLICY IF EXISTS "family_photos family delete" ON public.family_photos;

CREATE POLICY "family_photos family read" ON public.family_photos FOR SELECT
  USING (uploaded_by IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "family_photos family insert" ON public.family_photos FOR INSERT
  WITH CHECK (uploaded_by IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "family_photos family update" ON public.family_photos FOR UPDATE
  USING (uploaded_by IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (uploaded_by IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "family_photos family delete" ON public.family_photos FOR DELETE
  USING (uploaded_by IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- family_posts
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_posts family read"   ON public.family_posts;
DROP POLICY IF EXISTS "family_posts family insert" ON public.family_posts;
DROP POLICY IF EXISTS "family_posts family update" ON public.family_posts;
DROP POLICY IF EXISTS "family_posts family delete" ON public.family_posts;

CREATE POLICY "family_posts family read" ON public.family_posts FOR SELECT
  USING (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "family_posts family insert" ON public.family_posts FOR INSERT
  WITH CHECK (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "family_posts family update" ON public.family_posts FOR UPDATE
  USING (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "family_posts family delete" ON public.family_posts FOR DELETE
  USING (author_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_items
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_items_select" ON public.grocery_items;
DROP POLICY IF EXISTS "grocery_items_insert" ON public.grocery_items;
DROP POLICY IF EXISTS "grocery_items_update" ON public.grocery_items;
DROP POLICY IF EXISTS "grocery_items_delete" ON public.grocery_items;

CREATE POLICY "grocery_items_select" ON public.grocery_items FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_items_insert" ON public.grocery_items FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_items_update" ON public.grocery_items FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_items_delete" ON public.grocery_items FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- help_requests
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "help_requests family read"   ON public.help_requests;
DROP POLICY IF EXISTS "help_requests family insert" ON public.help_requests;
DROP POLICY IF EXISTS "help_requests family update" ON public.help_requests;

CREATE POLICY "help_requests family read" ON public.help_requests FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "help_requests family insert" ON public.help_requests FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "help_requests family update" ON public.help_requests FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- member_locations — live GPS, most sensitive table in this batch
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "member_locations_select" ON public.member_locations;
DROP POLICY IF EXISTS "member_locations_insert" ON public.member_locations;
DROP POLICY IF EXISTS "member_locations_update" ON public.member_locations;

CREATE POLICY "member_locations_select" ON public.member_locations FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "member_locations_insert" ON public.member_locations FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "member_locations_update" ON public.member_locations FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- notification_preferences
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notification_preferences family read"   ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences family insert" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences family update" ON public.notification_preferences;

CREATE POLICY "notification_preferences family read" ON public.notification_preferences FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "notification_preferences family insert" ON public.notification_preferences FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "notification_preferences family update" ON public.notification_preferences FOR UPDATE
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- post_reactions
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "post_reactions family read"   ON public.post_reactions;
DROP POLICY IF EXISTS "post_reactions family insert" ON public.post_reactions;
DROP POLICY IF EXISTS "post_reactions family delete" ON public.post_reactions;

CREATE POLICY "post_reactions family read" ON public.post_reactions FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "post_reactions family insert" ON public.post_reactions FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "post_reactions family delete" ON public.post_reactions FOR DELETE
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- quests
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quests_select" ON public.quests;
DROP POLICY IF EXISTS "quests_insert" ON public.quests;
DROP POLICY IF EXISTS "quests_update" ON public.quests;
DROP POLICY IF EXISTS "quests_delete" ON public.quests;

CREATE POLICY "quests_select" ON public.quests FOR SELECT
  USING (family_id = public.current_user_family_id());
CREATE POLICY "quests_insert" ON public.quests FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id());
CREATE POLICY "quests_update" ON public.quests FOR UPDATE
  USING (family_id = public.current_user_family_id())
  WITH CHECK (family_id = public.current_user_family_id());
CREATE POLICY "quests_delete" ON public.quests FOR DELETE
  USING (family_id = public.current_user_family_id());

-- ─────────────────────────────────────────────────────────────────────────
-- reward_redemptions
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reward_redemptions family read"   ON public.reward_redemptions;
DROP POLICY IF EXISTS "reward_redemptions family insert" ON public.reward_redemptions;
DROP POLICY IF EXISTS "reward_redemptions family update" ON public.reward_redemptions;

CREATE POLICY "reward_redemptions family read" ON public.reward_redemptions FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "reward_redemptions family insert" ON public.reward_redemptions FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "reward_redemptions family update" ON public.reward_redemptions FOR UPDATE
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- family_invites
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_invites family select" ON public.family_invites;
DROP POLICY IF EXISTS "family_invites family insert" ON public.family_invites;
DROP POLICY IF EXISTS "family_invites family update" ON public.family_invites;

CREATE POLICY "family_invites family select" ON public.family_invites FOR SELECT
  TO authenticated
  USING (family_id = public.current_user_family_id());
CREATE POLICY "family_invites family insert" ON public.family_invites FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() AND family_id = public.current_user_family_id());
CREATE POLICY "family_invites family update" ON public.family_invites FOR UPDATE
  TO authenticated
  USING (family_id = public.current_user_family_id())
  WITH CHECK (family_id = public.current_user_family_id());

-- ─────────────────────────────────────────────────────────────────────────
-- grandparent_matches
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grandparent_matches family access" ON public.grandparent_matches;

CREATE POLICY "grandparent_matches family access" ON public.grandparent_matches FOR ALL
  TO authenticated
  USING (family_id = public.current_user_family_id())
  WITH CHECK (family_id = public.current_user_family_id());

-- ─────────────────────────────────────────────────────────────────────────
-- point_transactions
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "point_transactions family access" ON public.point_transactions;

CREATE POLICY "point_transactions family access" ON public.point_transactions FOR ALL
  TO authenticated
  USING (user_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (user_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- quest_participants
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quest_participants family access" ON public.quest_participants;

CREATE POLICY "quest_participants family access" ON public.quest_participants FOR ALL
  TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- user_badges
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_badges family access" ON public.user_badges;

CREATE POLICY "user_badges family access" ON public.user_badges FOR ALL
  TO authenticated
  USING (user_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (user_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

-- ─────────────────────────────────────────────────────────────────────────
-- geofences
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "geofences_select" ON public.geofences;
DROP POLICY IF EXISTS "geofences_insert" ON public.geofences;
DROP POLICY IF EXISTS "geofences_update" ON public.geofences;
DROP POLICY IF EXISTS "geofences_delete" ON public.geofences;

CREATE POLICY "geofences_select" ON public.geofences FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "geofences_insert" ON public.geofences FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "geofences_update" ON public.geofences FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "geofences_delete" ON public.geofences FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- family_medications
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_medications_select" ON public.family_medications;
DROP POLICY IF EXISTS "family_medications_insert" ON public.family_medications;
DROP POLICY IF EXISTS "family_medications_update" ON public.family_medications;
DROP POLICY IF EXISTS "family_medications_delete" ON public.family_medications;

CREATE POLICY "family_medications_select" ON public.family_medications FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_medications_insert" ON public.family_medications FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_medications_update" ON public.family_medications FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_medications_delete" ON public.family_medications FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- family_vaccines
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_vaccines_select" ON public.family_vaccines;
DROP POLICY IF EXISTS "family_vaccines_insert" ON public.family_vaccines;
DROP POLICY IF EXISTS "family_vaccines_update" ON public.family_vaccines;
DROP POLICY IF EXISTS "family_vaccines_delete" ON public.family_vaccines;

CREATE POLICY "family_vaccines_select" ON public.family_vaccines FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_vaccines_insert" ON public.family_vaccines FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_vaccines_update" ON public.family_vaccines FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_vaccines_delete" ON public.family_vaccines FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- medical_records
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "medical_records_select" ON public.medical_records;
DROP POLICY IF EXISTS "medical_records_insert" ON public.medical_records;
DROP POLICY IF EXISTS "medical_records_update" ON public.medical_records;
DROP POLICY IF EXISTS "medical_records_delete" ON public.medical_records;

CREATE POLICY "medical_records_select" ON public.medical_records FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "medical_records_insert" ON public.medical_records FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "medical_records_update" ON public.medical_records FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "medical_records_delete" ON public.medical_records FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- family_memories
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family_memories_select" ON public.family_memories;
DROP POLICY IF EXISTS "family_memories_insert" ON public.family_memories;
DROP POLICY IF EXISTS "family_memories_update" ON public.family_memories;
DROP POLICY IF EXISTS "family_memories_delete" ON public.family_memories;

CREATE POLICY "family_memories_select" ON public.family_memories FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_memories_insert" ON public.family_memories FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_memories_update" ON public.family_memories FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "family_memories_delete" ON public.family_memories FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_price_cache
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_price_cache_select" ON public.grocery_price_cache;
DROP POLICY IF EXISTS "grocery_price_cache_insert" ON public.grocery_price_cache;
DROP POLICY IF EXISTS "grocery_price_cache_update" ON public.grocery_price_cache;

CREATE POLICY "grocery_price_cache_select" ON public.grocery_price_cache FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_price_cache_insert" ON public.grocery_price_cache FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_price_cache_update" ON public.grocery_price_cache FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_receipts
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_receipts_select" ON public.grocery_receipts;
DROP POLICY IF EXISTS "grocery_receipts_insert" ON public.grocery_receipts;
DROP POLICY IF EXISTS "grocery_receipts_delete" ON public.grocery_receipts;

CREATE POLICY "grocery_receipts_select" ON public.grocery_receipts FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_receipts_insert" ON public.grocery_receipts FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_receipts_delete" ON public.grocery_receipts FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_receipt_items
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_receipt_items_select" ON public.grocery_receipt_items;
DROP POLICY IF EXISTS "grocery_receipt_items_insert" ON public.grocery_receipt_items;
DROP POLICY IF EXISTS "grocery_receipt_items_update" ON public.grocery_receipt_items;
DROP POLICY IF EXISTS "grocery_receipt_items_delete" ON public.grocery_receipt_items;

CREATE POLICY "grocery_receipt_items_select" ON public.grocery_receipt_items FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_receipt_items_insert" ON public.grocery_receipt_items FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_receipt_items_update" ON public.grocery_receipt_items FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_receipt_items_delete" ON public.grocery_receipt_items FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_runs
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_runs_select" ON public.grocery_runs;
DROP POLICY IF EXISTS "grocery_runs_insert" ON public.grocery_runs;
DROP POLICY IF EXISTS "grocery_runs_update" ON public.grocery_runs;
DROP POLICY IF EXISTS "grocery_runs_delete" ON public.grocery_runs;

CREATE POLICY "grocery_runs_select" ON public.grocery_runs FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_runs_insert" ON public.grocery_runs FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_runs_update" ON public.grocery_runs FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_runs_delete" ON public.grocery_runs FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_run_items
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_run_items_select" ON public.grocery_run_items;
DROP POLICY IF EXISTS "grocery_run_items_insert" ON public.grocery_run_items;
DROP POLICY IF EXISTS "grocery_run_items_update" ON public.grocery_run_items;
DROP POLICY IF EXISTS "grocery_run_items_delete" ON public.grocery_run_items;

CREATE POLICY "grocery_run_items_select" ON public.grocery_run_items FOR SELECT
  USING (run_id IN (SELECT id FROM public.grocery_runs WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "grocery_run_items_insert" ON public.grocery_run_items FOR INSERT
  WITH CHECK (run_id IN (SELECT id FROM public.grocery_runs WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "grocery_run_items_update" ON public.grocery_run_items FOR UPDATE
  USING (run_id IN (SELECT id FROM public.grocery_runs WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (run_id IN (SELECT id FROM public.grocery_runs WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "grocery_run_items_delete" ON public.grocery_run_items FOR DELETE
  USING (run_id IN (SELECT id FROM public.grocery_runs WHERE family_id = public.current_user_family_id()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- grocery_staples
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grocery_staples_select" ON public.grocery_staples;
DROP POLICY IF EXISTS "grocery_staples_insert" ON public.grocery_staples;
DROP POLICY IF EXISTS "grocery_staples_update" ON public.grocery_staples;
DROP POLICY IF EXISTS "grocery_staples_delete" ON public.grocery_staples;

CREATE POLICY "grocery_staples_select" ON public.grocery_staples FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_staples_insert" ON public.grocery_staples FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_staples_update" ON public.grocery_staples FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "grocery_staples_delete" ON public.grocery_staples FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- call_sessions, chat_bookmarks, chat_polls, chat_reactions_detail,
-- chat_read_receipts, chat_scheduled_messages, chat_typing — all scoped via
-- channel_id -> chat_channels.family_id.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "call_sessions_select" ON public.call_sessions;
DROP POLICY IF EXISTS "call_sessions_insert" ON public.call_sessions;
DROP POLICY IF EXISTS "call_sessions_update" ON public.call_sessions;

CREATE POLICY "call_sessions_select" ON public.call_sessions FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "call_sessions_insert" ON public.call_sessions FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "call_sessions_update" ON public.call_sessions FOR UPDATE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

DROP POLICY IF EXISTS "chat_bookmarks_select" ON public.chat_bookmarks;
DROP POLICY IF EXISTS "chat_bookmarks_insert" ON public.chat_bookmarks;
DROP POLICY IF EXISTS "chat_bookmarks_delete" ON public.chat_bookmarks;

CREATE POLICY "chat_bookmarks_select" ON public.chat_bookmarks FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_bookmarks_insert" ON public.chat_bookmarks FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_bookmarks_delete" ON public.chat_bookmarks FOR DELETE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

DROP POLICY IF EXISTS "chat_polls_select" ON public.chat_polls;
DROP POLICY IF EXISTS "chat_polls_insert" ON public.chat_polls;
DROP POLICY IF EXISTS "chat_polls_update" ON public.chat_polls;

CREATE POLICY "chat_polls_select" ON public.chat_polls FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_polls_insert" ON public.chat_polls FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_polls_update" ON public.chat_polls FOR UPDATE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

DROP POLICY IF EXISTS "chat_presence_select" ON public.chat_presence;
DROP POLICY IF EXISTS "chat_presence_insert" ON public.chat_presence;
DROP POLICY IF EXISTS "chat_presence_update" ON public.chat_presence;

CREATE POLICY "chat_presence_select" ON public.chat_presence FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "chat_presence_insert" ON public.chat_presence FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));
CREATE POLICY "chat_presence_update" ON public.chat_presence FOR UPDATE
  USING (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE family_id = public.current_user_family_id()));

DROP POLICY IF EXISTS "chat_reactions_detail_select" ON public.chat_reactions_detail;
DROP POLICY IF EXISTS "chat_reactions_detail_insert" ON public.chat_reactions_detail;
DROP POLICY IF EXISTS "chat_reactions_detail_delete" ON public.chat_reactions_detail;

CREATE POLICY "chat_reactions_detail_select" ON public.chat_reactions_detail FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_reactions_detail_insert" ON public.chat_reactions_detail FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_reactions_detail_delete" ON public.chat_reactions_detail FOR DELETE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

DROP POLICY IF EXISTS "chat_read_receipts_select" ON public.chat_read_receipts;
DROP POLICY IF EXISTS "chat_read_receipts_insert" ON public.chat_read_receipts;
DROP POLICY IF EXISTS "chat_read_receipts_update" ON public.chat_read_receipts;

CREATE POLICY "chat_read_receipts_select" ON public.chat_read_receipts FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_read_receipts_insert" ON public.chat_read_receipts FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_read_receipts_update" ON public.chat_read_receipts FOR UPDATE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

DROP POLICY IF EXISTS "chat_scheduled_messages_select" ON public.chat_scheduled_messages;
DROP POLICY IF EXISTS "chat_scheduled_messages_insert" ON public.chat_scheduled_messages;
DROP POLICY IF EXISTS "chat_scheduled_messages_update" ON public.chat_scheduled_messages;
DROP POLICY IF EXISTS "chat_scheduled_messages_delete" ON public.chat_scheduled_messages;

CREATE POLICY "chat_scheduled_messages_select" ON public.chat_scheduled_messages FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_scheduled_messages_insert" ON public.chat_scheduled_messages FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_scheduled_messages_update" ON public.chat_scheduled_messages FOR UPDATE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_scheduled_messages_delete" ON public.chat_scheduled_messages FOR DELETE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

DROP POLICY IF EXISTS "chat_typing_select" ON public.chat_typing;
DROP POLICY IF EXISTS "chat_typing_insert" ON public.chat_typing;
DROP POLICY IF EXISTS "chat_typing_update" ON public.chat_typing;
DROP POLICY IF EXISTS "chat_typing_delete" ON public.chat_typing;

CREATE POLICY "chat_typing_select" ON public.chat_typing FOR SELECT
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_typing_insert" ON public.chat_typing FOR INSERT
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_typing_update" ON public.chat_typing FOR UPDATE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "chat_typing_delete" ON public.chat_typing FOR DELETE
  USING (channel_id IN (SELECT id FROM public.chat_channels WHERE family_id = public.current_user_family_id()::text));

-- ─────────────────────────────────────────────────────────────────────────
-- kid_requests (superseded shape from 20260815000001_kid_requests_rls_fix.sql)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family members read kid_requests"   ON public.kid_requests;
DROP POLICY IF EXISTS "family members insert kid_requests" ON public.kid_requests;
DROP POLICY IF EXISTS "family members update kid_requests" ON public.kid_requests;
DROP POLICY IF EXISTS "family members delete kid_requests" ON public.kid_requests;

CREATE POLICY "family members read kid_requests" ON public.kid_requests FOR SELECT
  USING (family_id = public.current_user_family_id());
CREATE POLICY "family members insert kid_requests" ON public.kid_requests FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id());
CREATE POLICY "family members update kid_requests" ON public.kid_requests FOR UPDATE
  USING (family_id = public.current_user_family_id())
  WITH CHECK (family_id = public.current_user_family_id());
CREATE POLICY "family members delete kid_requests" ON public.kid_requests FOR DELETE
  USING (family_id = public.current_user_family_id() AND status = 'pending');

-- ─────────────────────────────────────────────────────────────────────────
-- trips (this session's own table — was written before this fix existed)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "family members read trips"   ON public.trips;
DROP POLICY IF EXISTS "family members insert trips" ON public.trips;
DROP POLICY IF EXISTS "family members update trips" ON public.trips;

CREATE POLICY "family members read trips" ON public.trips FOR SELECT
  USING (family_id = public.current_user_family_id());
CREATE POLICY "family members insert trips" ON public.trips FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id());
CREATE POLICY "family members update trips" ON public.trips FOR UPDATE
  USING (family_id = public.current_user_family_id());

-- ─────────────────────────────────────────────────────────────────────────
-- locations, errands, errand_items, responsibility_rules, route_context,
-- responsibility_history, assignment_decisions (from
-- 20260817150000_responsibility_engine_phase1.sql)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "locations_select" ON public.locations;
DROP POLICY IF EXISTS "locations_insert" ON public.locations;
DROP POLICY IF EXISTS "locations_update" ON public.locations;
DROP POLICY IF EXISTS "locations_delete" ON public.locations;

CREATE POLICY "locations_select" ON public.locations FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "locations_insert" ON public.locations FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "locations_update" ON public.locations FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "locations_delete" ON public.locations FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS "errands_select" ON public.errands;
DROP POLICY IF EXISTS "errands_insert" ON public.errands;
DROP POLICY IF EXISTS "errands_update" ON public.errands;
DROP POLICY IF EXISTS "errands_delete" ON public.errands;

CREATE POLICY "errands_select" ON public.errands FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "errands_insert" ON public.errands FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "errands_update" ON public.errands FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "errands_delete" ON public.errands FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS "errand_items_select" ON public.errand_items;
DROP POLICY IF EXISTS "errand_items_insert" ON public.errand_items;
DROP POLICY IF EXISTS "errand_items_update" ON public.errand_items;
DROP POLICY IF EXISTS "errand_items_delete" ON public.errand_items;

CREATE POLICY "errand_items_select" ON public.errand_items FOR SELECT
  USING (errand_id IN (SELECT id FROM public.errands WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "errand_items_insert" ON public.errand_items FOR INSERT
  WITH CHECK (errand_id IN (SELECT id FROM public.errands WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "errand_items_update" ON public.errand_items FOR UPDATE
  USING (errand_id IN (SELECT id FROM public.errands WHERE family_id = public.current_user_family_id()::text))
  WITH CHECK (errand_id IN (SELECT id FROM public.errands WHERE family_id = public.current_user_family_id()::text));
CREATE POLICY "errand_items_delete" ON public.errand_items FOR DELETE
  USING (errand_id IN (SELECT id FROM public.errands WHERE family_id = public.current_user_family_id()::text));

DROP POLICY IF EXISTS "responsibility_rules_select" ON public.responsibility_rules;
DROP POLICY IF EXISTS "responsibility_rules_insert" ON public.responsibility_rules;
DROP POLICY IF EXISTS "responsibility_rules_update" ON public.responsibility_rules;
DROP POLICY IF EXISTS "responsibility_rules_delete" ON public.responsibility_rules;

CREATE POLICY "responsibility_rules_select" ON public.responsibility_rules FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "responsibility_rules_insert" ON public.responsibility_rules FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "responsibility_rules_update" ON public.responsibility_rules FOR UPDATE
  USING (family_id = public.current_user_family_id()::text)
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "responsibility_rules_delete" ON public.responsibility_rules FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS "route_context_select" ON public.route_context;
DROP POLICY IF EXISTS "route_context_insert" ON public.route_context;
DROP POLICY IF EXISTS "route_context_delete" ON public.route_context;

CREATE POLICY "route_context_select" ON public.route_context FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "route_context_insert" ON public.route_context FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
CREATE POLICY "route_context_delete" ON public.route_context FOR DELETE
  USING (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS "responsibility_history_select" ON public.responsibility_history;
DROP POLICY IF EXISTS "responsibility_history_insert" ON public.responsibility_history;

CREATE POLICY "responsibility_history_select" ON public.responsibility_history FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "responsibility_history_insert" ON public.responsibility_history FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);

DROP POLICY IF EXISTS "assignment_decisions_select" ON public.assignment_decisions;
DROP POLICY IF EXISTS "assignment_decisions_insert" ON public.assignment_decisions;

CREATE POLICY "assignment_decisions_select" ON public.assignment_decisions FOR SELECT
  USING (family_id = public.current_user_family_id()::text);
CREATE POLICY "assignment_decisions_insert" ON public.assignment_decisions FOR INSERT
  WITH CHECK (family_id = public.current_user_family_id()::text);
