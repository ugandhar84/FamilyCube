-- broadcasts table doesn't exist in this project yet — the loose
-- supabase/migration_broadcasts.sql file (PawBond-era, non-standard
-- filename, never applied here per `supabase migration list`) referenced
-- profiles(id) for admin_id, which doesn't fit this project's app_admins
-- model anyway. Creating it fresh here, scoped to auth.users and
-- app_admins from the start, with audience targeting built in: 'all'
-- (default) or 'parents' (a paywall/upsell nudge that shouldn't reach a
-- kid's device). supabase/functions/send-broadcast/index.ts reads
-- `audience` from the request body and filters push_tokens by joining
-- through members.role = 'parent'; this table just logs what was sent.
create table if not exists public.broadcasts (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  body            text not null,
  audience        text not null default 'all' check (audience in ('all', 'parents')),
  recipient_count integer default 0,
  sent_at         timestamptz default now(),
  created_at      timestamptz default now()
);

create index if not exists broadcasts_admin_idx on public.broadcasts(admin_id);
create index if not exists broadcasts_sent_at_idx on public.broadcasts(sent_at desc);

alter table public.broadcasts enable row level security;

-- Admin-only, both read and write — send-broadcast (service-role) inserts
-- the log row; the admin console reads broadcast history back via the
-- authenticated client, so it needs its own SELECT policy rather than
-- relying on the service-role bypass.
drop policy if exists broadcasts_admin_all on public.broadcasts;
create policy broadcasts_admin_all
  on public.broadcasts for all
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.broadcasts is
  'Log of admin push broadcasts (features/admin/screens/broadcast.tsx, sent via supabase/functions/send-broadcast). admin_id references auth.users directly (not the unrelated PawBond profiles table). Admin-only read/write via is_app_admin().';
