-- What the conversation was last about (person, date), so a follow-up like "cancel his events" or just "Cherry" continues
-- the same request instead of starting over. Written only by the ask-cube function.
alter table public.ask_cube_conversations add column if not exists context jsonb not null default '{}'::jsonb;
