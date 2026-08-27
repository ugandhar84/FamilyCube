-- Ask Cube's proposal_status was a single text column, but a message row
-- can carry MULTIPLE proposals (proposal is a jsonb array — e.g. several
-- meal options in one turn). Worse: discarding or confirming a proposal was
-- 100% client-side state (AskCubeChat.tsx's discardProposal/
-- markProposalCreated only ever mutated in-memory proposalStatuses) — never
-- written back to this column at all. Reopening the conversation re-read
-- proposal_status fresh from the DB (still 'pending', since nothing ever
-- wrote to it) and reset every proposal back to active, regardless of what
-- the user had already decided (user-reported: "next time user opens the
-- same chat the card status is not persistent... coming as active").
--
-- Fix: convert to a jsonb array of per-proposal-index statuses, matching
-- proposal's own array shape, so a message with 3 meal options can track
-- "picked #1, discarded #2, still pending #3" independently. Existing rows'
-- single text value (if any) is migrated to a same-length array of that one
-- value, matching AskCubeChat.tsx's own old fallback behavior of applying
-- one status to every proposal in the row.

alter table public.ask_cube_messages
  add column if not exists proposal_statuses jsonb;

-- No aggregate needed — every element gets the same single status value
-- (the old column's own semantics), so this is just N repeats of one jsonb
-- string built via array_fill + a plain array-to-jsonb cast.
update public.ask_cube_messages m
  set proposal_statuses = case
    when jsonb_typeof(m.proposal) = 'array' and jsonb_array_length(m.proposal) > 0
      then to_jsonb(array_fill(coalesce(m.proposal_status, 'pending'), array[jsonb_array_length(m.proposal)]))
    else m.proposal_statuses
  end
  where m.proposal_statuses is null;

comment on column public.ask_cube_messages.proposal_statuses is
  'jsonb array of per-proposal status ("pending"/"created"/"discarded"), same length/order as the proposal jsonb array. Written by the client whenever the user confirms or discards a card, so the decision survives reopening the conversation. Supersedes the old single-value proposal_status column (kept for backward read-compat, no longer written).';
