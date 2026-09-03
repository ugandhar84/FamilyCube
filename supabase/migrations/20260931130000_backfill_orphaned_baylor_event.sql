-- Targeted follow-up to 20260931120000's backfill — that migration only
-- filled rows with an existing, live event_external_links row to join
-- against. Live-confirmed after a force-refresh that the Baylor Scott &
-- White appointment's badge is STILL missing, meaning its own link row
-- was very likely destroyed by the earlier unconditional-delete
-- orphaning bug (fixed this session) before ever reaching that backfill.
-- With no link left to join through, stamp the sync fields directly
-- using this family's one active personal Google connection — correct
-- as long as the family has exactly one (true for every family this
-- feature has shipped to so far); skips silently (does nothing) for any
-- family with zero or multiple active personal Google connections
-- rather than guessing which one a genuinely ambiguous case belongs to.
with candidate_connections as (
  select cc.id as connection_id, cc.family_id, cc.provider, cc.connected_account_email, cc.member_id
  from public.calendar_connections cc
  where cc.provider = 'google' and cc.purpose = 'personal' and cc.status = 'active'
),
family_counts as (
  select family_id, count(*) as n from candidate_connections group by family_id
),
one_connection as (
  select cc.*
  from candidate_connections cc
  join family_counts fc on fc.family_id = cc.family_id
  where fc.n = 1
)
update public.calendar_events ce
set
  last_external_sync_at = coalesce(ce.last_external_sync_at, now()),
  last_external_sync_provider = oc.provider,
  last_external_sync_account = oc.connected_account_email,
  last_external_sync_member_id = oc.member_id
from one_connection oc
where ce.family_id = oc.family_id
  and ce.deleted_at is null
  and ce.last_external_sync_provider is null
  and ce.title ilike '%Baylor Scott%White%';
