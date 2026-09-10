-- Grants app-owner admin console access (features/admin) to the app
-- owner's own account, per app_admins' own design: seeded only via
-- direct SQL/migration, never from the app itself
-- [live-requested: "enable the admin module to ...@gmail.com account ...
-- so I can change these pricing in the future"].
insert into public.app_admins (auth_user_id, note)
values ('ba78c69a-604d-4cc0-82d7-e13a906685b4', 'App owner')
on conflict (auth_user_id) do nothing;
