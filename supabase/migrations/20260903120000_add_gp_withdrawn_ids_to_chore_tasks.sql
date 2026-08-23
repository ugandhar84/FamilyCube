-- withdrawGPOffer fully erased any trace that a grandparent had already
-- offered and backed out (status reset to 'todo', gp_offer_by_id cleared),
-- so the invitation card looked identical to one that GP had never touched
-- — same "I'd Love To Help"/"Pass" framing either way. Tracking who's
-- already withdrawn lets the card show different framing for that specific
-- GP without affecting how a GP who never touched it sees the same chore.
alter table public.chore_tasks
  add column if not exists gp_withdrawn_ids jsonb not null default '[]'::jsonb;

comment on column public.chore_tasks.gp_withdrawn_ids is
  'Member ids of grandparents who previously offered (claimGPErrand) and then withdrew (withdrawGPOffer) from this chore — lets the invitation card distinguish "never touched" from "tried and backed out" for that specific GP.';
