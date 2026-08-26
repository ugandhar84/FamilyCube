-- Seeds app_admins for the app owner's account. Looked up directly via the
-- Supabase Auth Admin API (GET /auth/v1/admin/users?email=...), confirmed:
-- ugandhar.nellore@gmail.com -> auth_user_id 62ac7da2-3f21-4fe3-acbb-fbe0cb576128
-- (provider: email+google, confirmed, last_sign_in_at present — a real,
-- active account, not a placeholder). This replaces the "manual follow-up"
-- step left at the bottom of 20260925090000_create_admin_console.sql, which
-- had been targeting the wrong address (outlook.com, which has zero rows in
-- auth.users) — the correct address, confirmed directly by the app owner
-- multiple times, is gmail.com.
insert into public.app_admins (auth_user_id, note)
values ('62ac7da2-3f21-4fe3-acbb-fbe0cb576128', 'ugandhar.nellore@gmail.com')
on conflict (auth_user_id) do nothing;
