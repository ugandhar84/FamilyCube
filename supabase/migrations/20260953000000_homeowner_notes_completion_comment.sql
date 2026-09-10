-- Adds a free-text completion comment field to homeowner_notes
-- [live-requested: "while clicking on complete we should ask for the
-- confirmation swith comments text"] — captured at the moment a
-- maintenance reminder is marked done (e.g. "used ABC HVAC, cost $180,
-- filter was more worn than expected").
alter table public.homeowner_notes add column if not exists completion_notes text;
