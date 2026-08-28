-- Day 15+ soft-lock enforcement (docs/paywall_setup_and_implementation.md).
-- The client-side paywall UI (PaywallSheet, TrialNagBanner) is only the UX
-- layer — a client-only check is trivially bypassed by a jailbroken device,
-- a patched/sideloaded build, or a direct call to the Supabase REST/RPC
-- endpoint with a captured auth token, none of which touch the React
-- Native UI code at all. This is the actual gate: an RLS WITH CHECK that
-- Postgres enforces on every INSERT regardless of what the client does.
--
-- Trial window is anchored to families.created_at — an immutable,
-- server-recorded timestamp set once at family creation — never a
-- client-supplied date, which could trivially be spoofed by resetting
-- local storage or app data.
--
-- family_id is `text` on chore_tasks/calendar_events (not uuid — confirmed
-- against the live schema via information_schema, since chore_tasks has no
-- CREATE TABLE in the tracked migration history to read instead), so this
-- function takes text to match every call site's actual column type.
create or replace function public.family_can_create_content(p_family_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Day 1-14 (trial + the days-8-14 nag window, both still full access):
    -- always allowed regardless of subscription state.
    (select created_at from public.families where id::text = p_family_id) > (now() - interval '15 days')
    or
    -- Day 15+: only allowed if there's an active (or grace-period, so a
    -- billing hiccup doesn't instantly lock a paying family out) premium
    -- subscription for ANY member of this family — subscriptions is keyed
    -- by user_id (the auth user who purchased), not family_id, and any
    -- parent on a shared-device family can be the one who actually paid.
    exists (
      select 1
      from public.subscriptions s
      join public.members m on m.auth_user_id = s.user_id
      where m.family_id::text = p_family_id
        and s.tier = 'premium'
        and s.status in ('active', 'grace_period')
        and (s.expires_at is null or s.expires_at > now())
    );
$$;

comment on function public.family_can_create_content(text) is 'Day 15+ soft-lock gate (see docs/paywall_setup_and_implementation.md): true during the first 14 days of a family''s life regardless of subscription, or at any time thereafter if any member''s auth_user_id has an active/grace-period premium subscription. Used in WITH CHECK clauses on create-content tables — never a SELECT/view-time gate, since existing data must always stay viewable.';

-- Applied only to the "create new content" tables named in the gating doc.
-- Deliberately NOT applied to any SELECT policy on these tables, nor to
-- members/families/rewards themselves — viewing existing data is never
-- gated, only creating new rows. Each ALTER POLICY targets the real,
-- currently-live policy (name + exact WITH CHECK) as confirmed against the
-- migration history's most recent version of each — not a guessed name.

-- chore_tasks_insert — from 20260926010000_fix_chore_tasks_rls_wrong_table.sql
alter policy "chore_tasks_insert" on public.chore_tasks
  with check (
    family_id = public.current_user_family_id()::text
    and public.family_can_create_content(family_id)
  );

-- calendar_events_insert — from 20260818194500_repoint_all_rls_to_auth_user_id.sql
alter policy "calendar_events_insert" on public.calendar_events
  with check (
    family_id = public.current_user_family_id()::text
    and public.family_can_create_content(family_id)
  );

-- chat_messages_insert — from 20260824020000_chat_channel_participation_rls.sql.
-- chat_messages has no family_id column of its own; family is resolved via
-- the channel it's being posted into (chat_channels.family_id).
alter policy "chat_messages_insert" on public.chat_messages
  with check (
    channel_id in (select cc.id from public.chat_channels cc where cc.family_id = (current_user_family_id())::text)
    and public.is_chat_channel_participant(channel_id)
    and public.family_can_create_content((current_user_family_id())::text)
  );

-- "reward_redemptions family insert" (literal space in the name) — from
-- 20260818194500_repoint_all_rls_to_auth_user_id.sql. reward_redemptions has
-- no family_id column either; scoped via member_id -> members.family_id.
alter policy "reward_redemptions family insert" on public.reward_redemptions
  with check (
    member_id in (select id from public.members where family_id = public.current_user_family_id())
    and public.family_can_create_content(public.current_user_family_id()::text)
  );
