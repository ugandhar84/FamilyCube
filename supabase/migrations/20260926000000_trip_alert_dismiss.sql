-- Manual dismiss for the Hub's "Trip Never Started" banner, alongside the
-- existing 1-hour auto-clear (ParentView.tsx's neverDispatchedOverdue).
-- Deliberately separate from conflict_acknowledged/acknowledged_by, which
-- are scoped to the unrelated schedule-conflict-acknowledgment feature.
-- Per-row (per-occurrence) rather than per-series, so dismissing today's
-- overdue banner on a recurring event doesn't suppress tomorrow's — each
-- occurrence is already its own row, so this just naturally resets.
alter table public.calendar_events
  add column if not exists trip_alert_dismissed_at timestamptz,
  add column if not exists trip_alert_dismissed_by text references public.members(id) on delete set null;
