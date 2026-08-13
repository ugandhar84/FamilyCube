-- FamilyCube — Notification infrastructure migration
-- Run once: psql $DATABASE_URL < supabase/migration_notification_infra.sql

-- ── members: push token column ────────────────────────────────────────────────
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS expo_push_token text;

-- ── notifications table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       text        NOT NULL,
  member_id       text        NOT NULL,
  type            text        NOT NULL,
  title           text        NOT NULL,
  body            text        NOT NULL,
  data            jsonb       DEFAULT '{}',
  read            boolean     NOT NULL DEFAULT false,
  expo_receipt_id text,
  receipt_checked boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_member_id_idx   ON notifications(member_id);
CREATE INDEX IF NOT EXISTS notifications_family_id_idx   ON notifications(family_id);
CREATE INDEX IF NOT EXISTS notifications_receipt_idx     ON notifications(expo_receipt_id) WHERE expo_receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_unread_idx      ON notifications(member_id, read) WHERE read = false;

-- ── member_locations table (GPS tracker) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_locations (
  member_id                 text        PRIMARY KEY,
  family_id                 text        NOT NULL,
  lat                       numeric(10, 6),
  lng                       numeric(10, 6),
  address                   text,
  speed_mph                 numeric(6, 2) DEFAULT 0,
  battery_level             int          DEFAULT 100,
  status                    text         DEFAULT 'unknown',
  safe_zone_name            text,
  distance_from_home_miles  numeric(8, 2),
  updated_at                timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_locations_family_id_idx ON member_locations(family_id);

-- ── geofences table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofences (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         text        NOT NULL,
  name              text        NOT NULL,
  lat               numeric(10, 6) NOT NULL,
  lng               numeric(10, 6) NOT NULL,
  radius_miles      numeric(6, 3)  NOT NULL DEFAULT 0.1,
  notify_on_exit    boolean        NOT NULL DEFAULT true,
  notify_on_arrive  boolean        NOT NULL DEFAULT true,
  created_at        timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geofences_family_id_idx ON geofences(family_id);

-- ── families: home coordinates ────────────────────────────────────────────────
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS home_lat     numeric(10, 6),
  ADD COLUMN IF NOT EXISTS home_lng     numeric(10, 6),
  ADD COLUMN IF NOT EXISTS home_address text;
