-- notification_logs was keyed only by user_id (Supabase Auth user), but
-- multiple family member PROFILES can share one auth session on a single
-- device (PIN-switched siblings, "Login with Code" anonymous sessions, or
-- simply one parent's login backing several profiles) — the notification
-- bell read every notification for that shared auth user, regardless of
-- which profile was actually active, leaking one member's notifications
-- (a kid's chore reminder, another parent's alert) to every other profile
-- on the same device. member_id lets the fetch scope to the actual active
-- profile instead of the shared auth identity.
alter table public.notification_logs
  add column if not exists member_id text references public.members(id) on delete cascade;

create index if not exists notification_logs_member_id_idx on public.notification_logs(member_id);

comment on column public.notification_logs.member_id is
  'The specific family member profile this notification is for — required to scope the bell correctly on a multi-profile shared device. user_id alone is the shared Auth session, not the active profile.';
