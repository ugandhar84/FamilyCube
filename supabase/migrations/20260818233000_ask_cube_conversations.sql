-- Ask Cube — conversation persistence. One conversation per member (not
-- shared across the whole family — each person's chat with Cube is their
-- own thread, same as how a kid's own quest list is scoped to them, not
-- shared editing of one family-wide chat). Messages belong to a
-- conversation; RLS scopes both to the current auth session's own member
-- row via current_user_family_id()/members, consistent with every other
-- family-scoped table in this app.

CREATE TABLE IF NOT EXISTS public.ask_cube_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   text NOT NULL,
  member_id   text NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  title       text,                 -- optional short label, e.g. first message truncated
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ask_cube_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ask_cube_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content         text,                 -- assistant/user plain text; null for pure tool-call turns
  tool_calls      jsonb,                -- assistant turn: [{id, name, arguments}] if the model called tools
  tool_call_id    text,                 -- tool turn: which call this result answers
  tool_name       text,                 -- tool turn: which tool ran
  proposal        jsonb,                -- a pending create_event/create_quest proposal shown as a confirm card, if any
  proposal_status text CHECK (proposal_status IN ('pending', 'created', 'discarded')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ask_cube_messages_conversation ON public.ask_cube_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ask_cube_conversations_member ON public.ask_cube_conversations(member_id, updated_at DESC);

ALTER TABLE public.ask_cube_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_cube_messages ENABLE ROW LEVEL SECURITY;

-- A conversation belongs to exactly one member — only that member (via
-- their own auth session) can read/write it. Not family-wide: Priya
-- shouldn't see Alex's private chat with Cube any more than she'd see his
-- private notes, even though both are in the same family.
DROP POLICY IF EXISTS "ask_cube_conversations_own" ON public.ask_cube_conversations;
CREATE POLICY "ask_cube_conversations_own" ON public.ask_cube_conversations
  FOR ALL
  USING (member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "ask_cube_messages_own" ON public.ask_cube_messages;
CREATE POLICY "ask_cube_messages_own" ON public.ask_cube_messages
  FOR ALL
  USING (conversation_id IN (
    SELECT id FROM public.ask_cube_conversations
    WHERE member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid())
  ))
  WITH CHECK (conversation_id IN (
    SELECT id FROM public.ask_cube_conversations
    WHERE member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid())
  ));
