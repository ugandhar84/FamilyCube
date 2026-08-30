-- store_proximity_reminders was never actually seeded into feature_flags
-- at all (only 9 of the app's flags were seeded when this table was
-- created) — it silently ran on its code default (false) forever, which is
-- why the grocery list's pin-location button and store-proximity push
-- reminders never appeared for anyone. Turning it on for the whole app now
-- (live-requested: "make it true for all user"), while keeping it a real
-- DB-backed flag rather than removing the kill-switch — a future bug can
-- still disable it remotely without a new app release.
insert into public.feature_flags (key, enabled) values
  ('store_proximity_reminders', true)
on conflict (key) do update set enabled = true, updated_at = now();
