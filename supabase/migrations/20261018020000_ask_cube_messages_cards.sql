-- The structured cards (e.g. the schedule card) shown under a reply, so reopening a chat shows them again.
alter table public.ask_cube_messages add column if not exists cards jsonb;
