-- The previous migration backfilled family_id on the 4 legacy channel rows
-- (general/parents/kids/announcements), but ChatScreen.tsx — the actual
-- chat UI — hardcodes a DIFFERENT channel id set: 'all' (#all-family),
-- 'parents' (already covered), and 'seniors' (#seniors). Only 'parents'
-- overlapped, meaning real chat sends to the main family channel and the
-- seniors channel have had NO matching chat_channels row this whole time —
-- RLS should have been rejecting them for every user, not just Ask Cube's
-- new share-to-chat feature. Adding the two missing rows so the UI's real
-- channel set has a backing row each.
insert into public.chat_channels (id, name, type, family_id, icon)
values
  ('all',     'Family Chat', 'general', '211fd767-7a94-4099-8c91-3b7d53f51e65', '💬'),
  ('seniors', 'Seniors',     'group',   '211fd767-7a94-4099-8c91-3b7d53f51e65', '👵')
on conflict (id) do update set family_id = excluded.family_id;
