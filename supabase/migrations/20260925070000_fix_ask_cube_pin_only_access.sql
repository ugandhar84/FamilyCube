-- ask_cube_conversations/ask_cube_messages used `auth_user_id = auth.uid()`
-- directly on the member row — a PIN-only member (kid/senior sharing a
-- parent's device session) has auth_user_id = NULL, so this can never
-- match. Confirmed live-relevant: lib/askCubeService.ts's
-- listConversations()/getMessages() (the just-shipped Ask Cube
-- conversation-history feature) filter by member_id at the app level
-- correctly, but RLS still silently returns zero rows for any PIN-only
-- kid/senior — their own conversation history and messages are invisible
-- to them.
--
-- Fix: resolve_active_member_id() — per-member (not family-wide) access,
-- matching this table's own deliberate design intent (a conversation is
-- private to the one member who had it, not shared family-wide, per this
-- migration's own original comment). This is the correct replacement per
-- that intent, not current_user_family_id() (which would make it
-- family-wide).
DROP POLICY IF EXISTS "ask_cube_conversations_own" ON public.ask_cube_conversations;
CREATE POLICY "ask_cube_conversations_own" ON public.ask_cube_conversations
  FOR ALL
  USING (member_id = public.resolve_active_member_id())
  WITH CHECK (member_id = public.resolve_active_member_id());

DROP POLICY IF EXISTS "ask_cube_messages_own" ON public.ask_cube_messages;
CREATE POLICY "ask_cube_messages_own" ON public.ask_cube_messages
  FOR ALL
  USING (conversation_id IN (
    SELECT id FROM public.ask_cube_conversations
    WHERE member_id = public.resolve_active_member_id()
  ))
  WITH CHECK (conversation_id IN (
    SELECT id FROM public.ask_cube_conversations
    WHERE member_id = public.resolve_active_member_id()
  ));
