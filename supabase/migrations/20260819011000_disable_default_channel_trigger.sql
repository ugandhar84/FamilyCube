-- The previous migration's create_default_chat_channels_for_family trigger
-- assumed the client resolves a per-family channel id, but ChatScreen.tsx
-- actually hardcodes literal ids ('all'/'parents'/'seniors') shared across
-- every family — there is no per-family channel lookup anywhere in the
-- client today. Auto-creating '<familyId>-all' etc rows for a new family
-- would just recreate the same "UI's hardcoded id has no matching row" bug
-- this fix-pass exists to solve, not prevent it.
--
-- Dropping the trigger rather than leaving a broken one in place. The real
-- fix — giving chat_channels a proper family-scoped lookup that ChatScreen.tsx
-- queries instead of hardcoding literals — is a separate, larger piece of
-- work than this pass covers; today's single real family works because its
-- channel rows were backfilled directly (20260819010000, 20260819010500).
drop trigger if exists trg_create_default_chat_channels on public.families;
drop function if exists public.create_default_chat_channels_for_family();
