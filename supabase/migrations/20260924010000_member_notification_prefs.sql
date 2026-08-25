-- Per-member, per-category notification preferences — was a single flat
-- "Push notifications" toggle with no real backing (UI-only local state),
-- per user request ("let user can choose which notifications they need").
-- jsonb keyed by category rather than one column per type, since NotifType
-- in family-notifier already has 20+ individual values that map onto a much
-- smaller set of categories a user actually thinks in terms of (chores,
-- family/location, chat, rewards, requests, grocery). Missing keys default
-- to enabled (see family-notifier's own read of this column) so existing
-- members with no row here yet keep getting every notification, matching
-- today's actual behavior, until they explicitly opt out of a category.
alter table public.members
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
