-- assign_event_role hardcoded status 'pending' even for a self-assign, which
-- violates the "self-assignment is always auto-confirmed" rule. Nothing in the
-- client or edge functions calls it; reassign_event is the single
-- implementation of the rule. Found by the events e2e QA pass
-- (qa-scratch-family): self-assign via this RPC returned 'pending'.
drop function if exists public.assign_event_role(text, text, text, text);
