-- Cleanup found by a deep exploratory QA trace of Chores: two overloads
-- of propose_terms_change existed — a 5-argument version with no
-- p_new_due_time parameter, and the real, currently-called 6-argument
-- version. The client always names p_new_due_time, so the 5-argument
-- overload is structurally unreachable today — but a future caller that
-- omitted p_new_due_time would silently dispatch to the stale overload,
-- which never records a due-time-only edit at all. Dropping it now while
-- it's inert, rather than leaving a live footgun for a future caller to
-- rediscover.
drop function if exists public.propose_terms_change(text, text, integer, integer, text);
