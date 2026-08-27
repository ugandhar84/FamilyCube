-- Companion to the chatStore.ts client fix (toDbChannelId/toBareChannelId):
-- the 5 fixed group-channel ids ('all', 'parents', 'seniors_a', 'seniors_b',
-- 'seniors_all') have always been bare, globally-unique chat_channels.id
-- values, but the SAME literal string is used by every family — so only
-- whichever family's device happened to create each row first actually has
-- a working group channel; every other family's own messages there
-- silently fail RLS forever (confirmed live).
--
-- The client now writes/reads these under a family-scoped id
-- (`${familyId}::${bareId}`) instead. Without this migration, the ONE
-- family that already owns a bare row (e.g. 'all') would lose access to
-- their own existing chat history the moment the new client ships, since
-- their queries now look for the scoped id instead of the bare one they
-- were actually stored under.
--
-- Renames each existing bare-id row (and repoints every FK-shaped text
-- column that references it by string) to the scoped id for ITS OWN
-- family_id. A family that never had a row for a given channel gets one
-- created fresh, on demand, the first time someone in that family sends
-- to it (ensureGroupChannelRow) — nothing to migrate for them.

do $$
declare
  bare_id text;
  chan record;
  new_id text;
begin
  foreach bare_id in array array['all', 'parents', 'seniors_a', 'seniors_b', 'seniors_all']
  loop
    for chan in
      select id, family_id from public.chat_channels where id = bare_id
    loop
      new_id := chan.family_id::text || '::' || bare_id;

      update public.chat_messages set channel_id = new_id where channel_id = bare_id;
      update public.chat_channel_reads set channel_id = new_id where channel_id = bare_id;
      update public.chat_read_receipts set channel_id = new_id where channel_id = bare_id;
      update public.chat_pinned_channels set channel_id = new_id where channel_id = bare_id;
      -- call_sessions.channel_id -> chat_channels(id) ON DELETE CASCADE with
      -- no ON UPDATE clause (defaults to NO ACTION) — no client code
      -- anywhere calls into call_sessions today (confirmed via full-repo
      -- grep), so this table is expected to be empty/irrelevant, but update
      -- it too rather than assume, so the id rename below doesn't fail if
      -- a row somehow exists.
      update public.call_sessions set channel_id = new_id where channel_id = bare_id;
      update public.chat_channels set id = new_id where id = bare_id;

      raise notice 'Migrated group channel % (family %) to %', bare_id, chan.family_id, new_id;
    end loop;
  end loop;
end $$;
