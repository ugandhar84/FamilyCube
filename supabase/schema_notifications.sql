-- ─────────────────────────────────────────────────────────────────────────────
-- notification_logs — stores push/in-app notifications per user
-- Run once in your Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists notification_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in (
                'lost_alert', 'pet_found', 'appointment_reminder', 'medication_reminder',
                'invite', 'family_update', 'system',
                'post_like', 'post_comment', 'follow', 'mention',
                'playdate_request', 'playdate_resend', 'playdate_accepted', 'playdate_declined',
                'playdate_withdrawal', 'playdate_proposal', 'playdate_confirmed',
                'playdate_proposal_declined', 'playdate_proposal_cancelled', 'playdate_reminder',
                'chat_message'
              )),
  title       text not null,
  body        text not null default '',
  data        jsonb not null default '{}',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notification_logs_user_created_idx
  on notification_logs (user_id, created_at desc);

alter table notification_logs enable row level security;

-- Users can only see their own notifications
drop policy if exists "Users can view own notifications" on notification_logs;
create policy "Users can view own notifications" on notification_logs
  for select using (auth.uid() = user_id);

-- Users can mark their own notifications read / delete them
drop policy if exists "Users can update own notifications" on notification_logs;
create policy "Users can update own notifications" on notification_logs
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own notifications" on notification_logs;
create policy "Users can delete own notifications" on notification_logs
  for delete using (auth.uid() = user_id);

-- Only service-role / edge functions insert notifications (no direct user insert)
-- If you want to test via SQL editor, you can temporarily allow insert:
-- create policy "Service inserts notifications" on notification_logs
--   for insert with check (true);
