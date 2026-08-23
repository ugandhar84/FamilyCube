-- Ask Cube's reply text mentions chore titles ("Mop the kitchen floor",
-- "Clean Bathroom") but the model itself never sees a chore's real id — the
-- alias system deliberately keeps raw ids out of its context, same as it
-- keeps real names/addresses out. chore_refs carries the (id, title) pairs
-- resolved server-side from that turn's get_quests/get_chore_history tool
-- calls, so the client can turn a chore's title, wherever it appears in the
-- assistant's own reply, into a tap-through deep link to /quests?questId=.
-- Stored per-message (not just returned once) so reopening a saved
-- conversation from history still renders working links.
alter table public.ask_cube_messages
  add column if not exists chore_refs jsonb;

comment on column public.ask_cube_messages.chore_refs is
  'Array of {id, title} for chores mentioned via get_quests/get_chore_history this turn — used client-side to linkify chore titles in the reply text to /quests?questId=. Never sent to the model.';
