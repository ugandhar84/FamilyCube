-- helper_status = 'confirmed' only means the driver agreed to the run — it
-- never recorded whether the pickup actually happened. Adds a distinct,
-- later signal either the rider or the driver can set (whichever acts
-- first), so the ride-countdown banner can clear and notify the other side
-- once the pickup is real, not just assigned.
alter table calendar_events
  add column if not exists pickup_confirmed_at timestamptz,
  add column if not exists pickup_confirmed_by text;
