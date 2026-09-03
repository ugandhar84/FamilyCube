-- Ask Cube can end a reply with 1-3 relevant, specific follow-up
-- suggestions (e.g. "Remind Praveena about it") — parsed server-side out of
-- a trailing "SUGGESTIONS: [...]" line the model is instructed to emit,
-- never shown to the user as raw text. Stored per-message (same rationale
-- as chore_refs above) so reopening a saved conversation still shows the
-- same tappable suggestion chips that were offered live.
alter table public.ask_cube_messages
  add column if not exists follow_ups jsonb;

comment on column public.ask_cube_messages.follow_ups is
  'Array of short follow-up prompt strings the model suggested this turn (parsed from a trailing SUGGESTIONS: [...] line) — rendered client-side as tappable chips under the reply. Null/empty when no follow-up was relevant.';
