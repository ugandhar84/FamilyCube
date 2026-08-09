-- ═══════════════════════════════════════════════════════════════════════════
-- PETKOINIA — Consolidated Supabase Schema
-- Unified SQL schema merging all migrations in logical order
-- Safe to run multiple times (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ EXTENSIONS ═══
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ═══ TYPES / ENUMS ═══
-- (None defined as standalone types; constraints used inline)

-- ═══ CORE: PROFILES & PETS ═══

-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  phone text,
  timezone text DEFAULT 'UTC',
  bio text,
  notification_enabled boolean DEFAULT true,
  onboarding_completed boolean NOT NULL DEFAULT false,
  terms_accepted boolean NOT NULL DEFAULT false,
  terms_accepted_at timestamptz,
  terms_version text,
  ai_consent_accepted boolean NOT NULL DEFAULT false,
  ai_consent_accepted_at timestamptz,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Pets
CREATE TABLE IF NOT EXISTS pets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  species text NOT NULL,
  breed text,
  gender text,
  birthday date,
  adoption_date date,
  emoji text DEFAULT '🐾',
  accent_color text DEFAULT '#7C5CBF',
  avatar_url text,
  weight_kg decimal(5,2),
  microchip_id text,
  insurance_policy text,
  neutered boolean DEFAULT false,
  color_coat text,
  temperament text[],
  diet_type text,
  notes text,
  is_active boolean DEFAULT true,
  location_lat decimal(10,7),
  location_lng decimal(10,7),
  location_updated_at timestamptz,
  location_shared boolean NOT NULL DEFAULT true,
  followers_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets (owner_id);
CREATE INDEX IF NOT EXISTS idx_pets_location ON pets (location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pets_location_shared ON pets (location_shared)
  WHERE location_shared = true;

-- Pet family (shared caretakers per pet)
CREATE TABLE IF NOT EXISTS pet_family (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'caretaker',
  joined_at timestamptz DEFAULT now(),
  UNIQUE(pet_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pet_family_pet ON pet_family (pet_id);
CREATE INDEX IF NOT EXISTS idx_pet_family_user ON pet_family (user_id);

-- Family invitations
CREATE TABLE IF NOT EXISTS family_invitations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'caretaker',
  message text,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  status text DEFAULT 'pending',
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_invitations_token ON family_invitations (token);
CREATE INDEX IF NOT EXISTS idx_family_invitations_email ON family_invitations (email);

-- ═══ HEALTH RECORDS ═══

-- Health records (scanned documents)
CREATE TABLE IF NOT EXISTS health_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'image',
  status text NOT NULL DEFAULT 'processing',
  source text NOT NULL DEFAULT 'upload',
  ai_summary text,
  extracted_data jsonb,
  extraction_count integer NOT NULL DEFAULT 0,
  error_message text,
  processed_at timestamptz,
  pages jsonb DEFAULT '[]'::jsonb,
  page_count integer DEFAULT 1,
  auto_saved boolean DEFAULT false,
  debug_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_records_pet_id ON health_records (pet_id);
CREATE INDEX IF NOT EXISTS idx_health_records_user_id ON health_records (user_id);

-- Lab results
CREATE TABLE IF NOT EXISTS lab_results (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  test_name text,
  result text,
  result_value text,
  interpretation text,
  tested_at date,
  unit text,
  reference_range text,
  is_abnormal boolean DEFAULT false,
  lab_name text,
  file_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_results_pet_id ON lab_results (pet_id);

-- Vaccines
CREATE TABLE IF NOT EXISTS vaccines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name text NOT NULL,
  last_given date,
  next_due date,
  vet_name text,
  clinic text,
  manufacturer text,
  batch_no text,
  source text DEFAULT 'manual',
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Vet visits
CREATE TABLE IF NOT EXISTS vet_visits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  vet_name text,
  clinic_name text,
  reason text,
  diagnosis text,
  prescription text,
  weight_kg decimal(5,2),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Weight logs
CREATE TABLE IF NOT EXISTS weight_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  weight_kg decimal(5,2) NOT NULL,
  logged_at date DEFAULT current_date,
  notes text
);

-- Medications
CREATE TABLE IF NOT EXISTS medications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text,
  frequency text NOT NULL DEFAULT 'daily',
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  source text DEFAULT 'manual',
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medications_pet_id ON medications (pet_id);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  clinic_id uuid,
  created_by uuid REFERENCES profiles(id),
  type text NOT NULL,
  title text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer DEFAULT 30,
  vet_name text,
  clinic_name text,
  clinic_address text,
  notes text,
  reminder_sent boolean DEFAULT false,
  reminder_at timestamptz,
  status text DEFAULT 'upcoming',
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

-- Allergies
CREATE TABLE IF NOT EXISTS allergies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  allergen text NOT NULL,
  category text,
  severity text DEFAULT 'mild',
  symptoms text,
  diagnosed_by text,
  diagnosed_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Diet & Nutrition Plans
CREATE TABLE IF NOT EXISTS diet_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  name text NOT NULL,
  food_brand text,
  food_type text,
  daily_amount_grams integer,
  meals_per_day integer DEFAULT 2,
  calories_per_day integer,
  special_instructions text,
  prescribed_by text,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insurance policies
CREATE TABLE IF NOT EXISTS insurance_policies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  policy_number text,
  plan_name text,
  coverage_type text,
  monthly_premium decimal(8,2),
  deductible decimal(8,2),
  reimbursement_pct integer,
  annual_limit decimal(10,2),
  start_date date,
  renewal_date date,
  phone text,
  website text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ═══ DAILY CARE ═══

-- Mood logs (AI scan results)
CREATE TABLE IF NOT EXISTS mood_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  scanned_by uuid REFERENCES profiles(id),
  mood_label text NOT NULL,
  mood_score integer NOT NULL CHECK (mood_score between 0 and 100),
  happy_pct integer DEFAULT 0,
  playful_pct integer DEFAULT 0,
  tired_pct integer DEFAULT 0,
  anxious_pct integer DEFAULT 0,
  situation text,
  advice jsonb,
  photo_url text,
  notes text,
  date date DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

-- Feeding logs
CREATE TABLE IF NOT EXISTS feeding_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  fed_by uuid REFERENCES profiles(id),
  meal_type text DEFAULT 'meal',
  amount_grams integer,
  food_type text,
  photo_url text,
  date date DEFAULT current_date,
  fed_at timestamptz DEFAULT now()
);

-- Grooming logs
CREATE TABLE IF NOT EXISTS grooming_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  type text NOT NULL,
  done_at date DEFAULT current_date,
  photo_url text,
  notes text
);

-- Daily checklist
CREATE TABLE IF NOT EXISTS daily_checklist (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date date DEFAULT current_date,
  type text NOT NULL,
  label text NOT NULL,
  completed boolean DEFAULT false,
  completed_by uuid REFERENCES profiles(id),
  completed_at timestamptz,
  photo_url text,
  notes text,
  due_time time,
  created_at timestamptz DEFAULT now()
);

-- Daily notes per pet per day
CREATE TABLE IF NOT EXISTS daily_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(pet_id, date)
);

-- Daily scan counts (tracking mood scans, AI attempts, slots)
CREATE TABLE IF NOT EXISTS daily_scan_counts (
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  ai_attempts integer NOT NULL DEFAULT 0,
  slot_counter integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pet_id, date)
);

-- Training logs
CREATE TABLE IF NOT EXISTS training_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  logged_by uuid REFERENCES profiles(id),
  skill text NOT NULL,
  category text DEFAULT 'obedience',
  level text DEFAULT 'learning',
  duration_minutes integer,
  reward_used text,
  notes text,
  logged_at date DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

-- Milestones
CREATE TABLE IF NOT EXISTS milestones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  day_count integer NOT NULL,
  title text NOT NULL,
  achieved_at date NOT NULL,
  shared boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ═══ HEALTH DIRECTORY ═══

-- Vet clinics (searchable directory)
CREATE TABLE IF NOT EXISTS vet_clinics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  country text DEFAULT 'US',
  phone text,
  email text,
  website text,
  lat decimal(10,7),
  lng decimal(10,7),
  is_emergency boolean DEFAULT false,
  is_24h boolean DEFAULT false,
  specialties text[],
  rating decimal(2,1),
  created_at timestamptz DEFAULT now()
);

-- Emergency contacts
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  relationship text,
  is_vet boolean DEFAULT false,
  clinic_name text,
  clinic_address text,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Pet photos
CREATE TABLE IF NOT EXISTS pet_photos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  url text NOT NULL,
  thumbnail_url text,
  caption text,
  is_avatar boolean DEFAULT false,
  taken_at date DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

-- ═══ SOCIAL ═══

-- Social posts (feed)
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  caption text,
  photo_url text,
  type text NOT NULL DEFAULT 'moment',
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  is_flagged boolean NOT NULL DEFAULT false,
  moderated boolean NOT NULL DEFAULT false,
  flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_pet ON social_posts (pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_public ON social_posts (is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_flagged ON social_posts (is_flagged, moderated)
  WHERE is_flagged = true;

-- Post comments
CREATE TABLE IF NOT EXISTS post_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES pets(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments (post_id, created_at);

-- Pet follows
CREATE TABLE IF NOT EXISTS pet_follows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_pet_id)
);

CREATE INDEX IF NOT EXISTS idx_pet_follows_follower ON pet_follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_pet_follows_pet ON pet_follows (following_pet_id);

-- Pet notes (journal)
CREATE TABLE IF NOT EXISTS pet_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  noted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pet_notes_pet_noted_idx ON pet_notes (pet_id, noted_at DESC);

-- ═══ PLAYDATES ═══

-- Playdate requests
CREATE TABLE IF NOT EXISTS playdate_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  to_pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_pet_id, to_pet_id)
);

CREATE INDEX IF NOT EXISTS idx_playdate_from_pet ON playdate_requests (from_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_to_pet ON playdate_requests (to_pet_id);
CREATE INDEX IF NOT EXISTS idx_playdate_status ON playdate_requests (status);

-- Playdate chats (negotiation)
CREATE TABLE IF NOT EXISTS playdate_chats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  playdate_request_id uuid NOT NULL REFERENCES playdate_requests(id) ON DELETE CASCADE,
  from_pet_id uuid NOT NULL REFERENCES pets(id),
  to_pet_id uuid NOT NULL REFERENCES pets(id),
  from_owner_id uuid NOT NULL REFERENCES profiles(id),
  to_owner_id uuid NOT NULL REFERENCES profiles(id),
  status text DEFAULT 'negotiating',
  agreed_date date,
  agreed_time time,
  agreed_location text,
  reminder_1day_sent boolean DEFAULT false,
  reminder_3hour_sent boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playdate_chats_from_owner ON playdate_chats (from_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_chats_to_owner ON playdate_chats (to_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_chats_status ON playdate_chats (status);

-- Playdate chat messages
CREATE TABLE IF NOT EXISTS playdate_chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id uuid NOT NULL REFERENCES playdate_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id),
  sender_pet_id uuid NOT NULL REFERENCES pets(id),
  message_type text,
  content text NOT NULL,
  proposed_date date,
  proposed_time time,
  proposed_location text,
  proposal_status text DEFAULT 'pending',
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playdate_chat_messages_chat ON playdate_chat_messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_playdate_chat_messages_sender ON playdate_chat_messages (sender_id);

ALTER TABLE playdate_chat_messages REPLICA IDENTITY FULL;

-- Playdate meetings
CREATE TABLE IF NOT EXISTS playdate_meetings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  playdate_request_id uuid NOT NULL REFERENCES playdate_requests(id) ON DELETE CASCADE,
  from_pet_id uuid NOT NULL REFERENCES pets(id),
  to_pet_id uuid NOT NULL REFERENCES pets(id),
  from_owner_id uuid NOT NULL REFERENCES profiles(id),
  to_owner_id uuid NOT NULL REFERENCES profiles(id),
  scheduled_date date NOT NULL,
  scheduled_time time,
  meeting_location text,
  meeting_notes text,
  reminder_1day_sent boolean DEFAULT false,
  reminder_3hour_sent boolean DEFAULT false,
  status text DEFAULT 'confirmed',
  cancelled_by uuid REFERENCES profiles(id),
  cancelled_at timestamp,
  completed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playdate_meetings_from_owner ON playdate_meetings (from_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_meetings_to_owner ON playdate_meetings (to_owner_id);
CREATE INDEX IF NOT EXISTS idx_playdate_meetings_scheduled_date ON playdate_meetings (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_playdate_meetings_status ON playdate_meetings (status);

-- ═══ EVENTS & COMMUNITY ═══

-- Community events
CREATE TABLE IF NOT EXISTS community_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'meetup',
  event_date date NOT NULL,
  event_time text,
  event_end_date date,
  event_end_time text,
  location_name text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_events_date ON community_events (event_date);
CREATE INDEX IF NOT EXISTS idx_community_events_organizer ON community_events (organizer_id);

-- Event RSVPs
CREATE TABLE IF NOT EXISTS event_rsvps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user ON event_rsvps (user_id);

-- Event messages
CREATE TABLE IF NOT EXISTS event_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) <= 1000),
  sent_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_messages_event ON event_messages (event_id, sent_at);

-- ═══ LOST & FOUND ═══

-- Lost pet alerts
CREATE TABLE IF NOT EXISTS lost_alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES profiles(id),
  last_seen_address text,
  last_seen_lat decimal(10,7),
  last_seen_lng decimal(10,7),
  location geometry(Point, 4326),
  description text,
  is_found boolean DEFAULT false,
  found_at timestamptz,
  radius_km decimal(5,2) DEFAULT 5,
  contact_phone text,
  reward_amount decimal(8,2),
  photo_url text,
  view_count integer DEFAULT 0,
  notification_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lost_alerts_location_idx ON lost_alerts USING GIST(location);

-- ═══ NEARBY / DISCOVERY ═══

-- User locations (for SOS alerts)
CREATE TABLE IF NOT EXISTS user_locations (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  accuracy_m numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_locations_geo_idx ON user_locations USING BTREE (lat, lng);

-- Nearby places cache (by grid cell)
CREATE TABLE IF NOT EXISTS nearby_places (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_key text NOT NULL UNIQUE,
  lat_center numeric NOT NULL,
  lng_center numeric NOT NULL,
  radius_m integer NOT NULL DEFAULT 4000,
  places jsonb NOT NULL DEFAULT '[]',
  enriched boolean NOT NULL DEFAULT false,
  raw_count integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nearby_places_area_key_idx ON nearby_places (area_key);
CREATE INDEX IF NOT EXISTS nearby_places_refreshed_idx ON nearby_places (refreshed_at);

-- Partners (local services)
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('vet','grooming','food','store','boarding','training','other')),
  subtitle text,
  lat double precision,
  lng double precision,
  city text,
  rating numeric(2,1),
  price_from numeric(10,2),
  is_24h boolean NOT NULL DEFAULT false,
  phone text,
  species text[],
  emoji text,
  image_url text,
  accent_color text,
  sponsored boolean NOT NULL DEFAULT false,
  sponsor_rank integer NOT NULL DEFAULT 0,
  cta_label text NOT NULL DEFAULT 'View',
  cta_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partners_active_cat_idx ON partners (active, category);
CREATE INDEX IF NOT EXISTS partners_geo_idx ON partners (lat, lng);

-- Pet products (matched product feed)
CREATE TABLE IF NOT EXISTS pet_products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand text,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'food',
  species text,
  breed_size text CHECK (breed_size IN ('small','medium','large')),
  min_age_years numeric(4,1),
  max_age_years numeric(4,1),
  price numeric(10,2),
  original_price numeric(10,2),
  emoji text,
  image_url text,
  sponsored boolean NOT NULL DEFAULT true,
  sponsor_rank integer NOT NULL DEFAULT 0,
  cta_label text NOT NULL DEFAULT 'Shop',
  cta_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pet_products_match_idx ON pet_products (active, species, breed_size);

-- Sponsored listings (admin-managed promotions)
CREATE TABLE IF NOT EXISTS sponsored_listings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category text NOT NULL CHECK (category IN ('clinic','food','toy','facility','grooming','boarding','training','insurance','other')),
  business_name text NOT NULL,
  tagline text,
  description text,
  logo_url text,
  cover_url text,
  website_url text,
  phone text,
  address text,
  city text,
  state text,
  country text DEFAULT 'US',
  lat numeric(10,6),
  lng numeric(10,6),
  target_species text[] DEFAULT '{}',
  cta_label text DEFAULT 'Learn More',
  cta_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsored_active ON sponsored_listings (is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_sponsored_category ON sponsored_listings (category);
CREATE INDEX IF NOT EXISTS idx_sponsored_featured ON sponsored_listings (is_featured)
  WHERE is_featured = true;

-- ═══ NOTIFICATIONS & MESSAGING ═══

-- Push tokens
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text,
  device_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Notification log (in-app inbox)
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'general',
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id, created_at DESC);

-- Notification logs (alternative schema from schema_notifications.sql)
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('lost_alert', 'appointment_reminder', 'invite', 'family_update', 'system')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_logs_user_created_idx ON notification_logs (user_id, created_at DESC);

-- Notification deduplication
CREATE TABLE IF NOT EXISTS notification_dedup (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid,
  chat_id uuid,
  notification_type text NOT NULL,
  recipient_id uuid NOT NULL REFERENCES profiles(id),
  sent_at timestamp DEFAULT now(),
  UNIQUE(request_id, notification_type, recipient_id),
  UNIQUE(chat_id, notification_type, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_dedup_request ON notification_dedup (request_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_dedup_chat ON notification_dedup (chat_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_dedup_recipient ON notification_dedup (recipient_id, notification_type);

-- ═══ API USAGE & ADMIN ═══

-- API usage logs
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  api_type text NOT NULL,
  subcategory text,
  called_at timestamptz NOT NULL DEFAULT now(),
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10,6),
  duration_ms int,
  success boolean NOT NULL DEFAULT true,
  error_msg text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage_logs (user_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_type ON api_usage_logs (api_type, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage_logs (called_at DESC);

-- Content moderation: blocked words
CREATE TABLE IF NOT EXISTS blocked_words (
  id serial PRIMARY KEY,
  word text NOT NULL UNIQUE
);

INSERT INTO blocked_words (word) VALUES
  ('fuck'),('shit'),('ass'),('bitch'),('cunt'),('dick'),('cock'),('pussy'),
  ('bastard'),('whore'),('slut'),('nigger'),('nigga'),('faggot'),('fag'),
  ('retard'),('piss'),('twat'),('wank'),('bollocks'),('motherfucker'),('mofo'),
  ('asshole'),('arsehole'),('jackass'),('bullshit'),('douchebag'),('prick'),
  ('cum'),('jizz')
ON CONFLICT (word) DO NOTHING;

-- Media retention config
CREATE TABLE IF NOT EXISTS media_retention_config (
  id serial PRIMARY KEY,
  category text UNIQUE NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  retain_days int NOT NULL DEFAULT 180,
  table_name text NOT NULL,
  column_name text NOT NULL DEFAULT 'photo_url',
  date_column text NOT NULL,
  storage_path_prefix text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO media_retention_config
  (category, label, retain_days, table_name, date_column, storage_path_prefix, description)
VALUES
  ('mood',            'Mood scan photos',      180, 'mood_logs',        'created_at', 'mood',           'AI mood-scan captures under pets/<petId>/mood/'),
  ('daily/meal',      'Meal proof photos',     180, 'feeding_logs',     'fed_at',     'daily/meal',     'Food proof shots under pets/<petId>/daily/meal/'),
  ('daily/activity',  'Activity proof photos', 180, 'daily_checklist',  'completed_at','daily/activity','Walk / play proof shots under pets/<petId>/daily/activity/'),
  ('daily/grooming',  'Grooming proof photos', 180, 'grooming_logs',    'done_at',    'daily/grooming', 'Grooming proof shots under pets/<petId>/daily/grooming/')
ON CONFLICT (category) DO NOTHING;

-- ═══ ROW LEVEL SECURITY ENABLE ═══

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeding_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE grooming_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_scan_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE playdate_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nearby_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsored_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_retention_config ENABLE ROW LEVEL SECURITY;

-- ═══ HELPER FUNCTIONS ═══

-- Security definer: get caller's own pet IDs
CREATE OR REPLACE FUNCTION get_my_pet_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM pets WHERE owner_id = auth.uid();
$$;

-- Security definer: get caller's family pet IDs
CREATE OR REPLACE FUNCTION get_my_family_pet_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT pet_id FROM pet_family WHERE user_id = auth.uid();
$$;

-- Check if caller is owner or family member of pet
CREATE OR REPLACE FUNCTION is_pet_member(p_pet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
  );
$$;

-- Role-aware: can log daily care
CREATE OR REPLACE FUNCTION can_log_daily_care(p_pet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
      AND role IN ('caretaker', 'caregiver')
  );
$$;

-- Role-aware: can log health records
CREATE OR REPLACE FUNCTION can_log_health(p_pet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
      AND role = 'caretaker'
  );
$$;

-- Role-aware: can read pet data
CREATE OR REPLACE FUNCTION can_read_pet(p_pet_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pets WHERE id = p_pet_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM pet_family WHERE pet_id = p_pet_id AND user_id = auth.uid()
  );
$$;

-- Check if participant in event (organizer or RSVP'd)
CREATE OR REPLACE FUNCTION is_event_participant(p_event_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_events WHERE id = p_event_id AND organizer_id = auth.uid()
    UNION ALL
    SELECT 1 FROM event_rsvps WHERE event_id = p_event_id AND user_id = auth.uid()
  );
$$;

-- Storage path is pet member
CREATE OR REPLACE FUNCTION storage_path_is_pet_member(object_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  folder text := split_part(object_name, '/', 1);
  pet_uuid uuid;
BEGIN
  BEGIN
    pet_uuid := folder::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN is_pet_member(pet_uuid);
END;
$$;

-- ═══ RLS POLICIES: PROFILES ═══

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Public can view public content creators" ON profiles;
CREATE POLICY "Public can view public content creators"
  ON profiles FOR SELECT
  USING (
    id IN (SELECT DISTINCT author_id FROM social_posts WHERE is_public = true)
    OR
    id IN (
      SELECT DISTINCT author_id
      FROM post_comments pc
      JOIN social_posts sp ON pc.post_id = sp.id
      WHERE sp.is_public = true
    )
    OR
    id IN (SELECT DISTINCT organizer_id FROM community_events WHERE is_public = true)
    OR
    id IN (SELECT DISTINCT sender_id FROM playdate_chat_messages)
    OR
    id IN (SELECT DISTINCT sender_id FROM event_messages)
  );

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profile created on signup" ON profiles;
CREATE POLICY "Profile created on signup"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ═══ RLS POLICIES: PETS ═══

DROP POLICY IF EXISTS "Owner can manage pets" ON pets;
CREATE POLICY "Owner can manage pets"
  ON pets FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Family can view pets" ON pets;
CREATE POLICY "Family can view pets"
  ON pets FOR SELECT USING (id IN (SELECT get_my_family_pet_ids()));

DROP POLICY IF EXISTS "Public can view social pets" ON pets;
CREATE POLICY "Public can view social pets"
  ON pets FOR SELECT
  USING (
    auth.uid() = owner_id
    OR id IN (SELECT get_my_family_pet_ids())
    OR id IN (SELECT DISTINCT pet_id FROM social_posts WHERE pet_id IS NOT NULL AND is_public = true)
  );

DROP POLICY IF EXISTS "Anyone can view nearby pets" ON pets;
CREATE POLICY "Anyone can view nearby pets"
  ON pets FOR SELECT
  USING (
    auth.uid() = owner_id
    OR id IN (SELECT get_my_family_pet_ids())
    OR (location_shared = true AND location_lat IS NOT NULL AND location_lng IS NOT NULL)
  );

-- ═══ RLS POLICIES: PET_FAMILY ═══

DROP POLICY IF EXISTS "Owner can manage family" ON pet_family;
CREATE POLICY "Owner can manage family"
  ON pet_family FOR ALL USING (pet_id IN (SELECT get_my_pet_ids()));

DROP POLICY IF EXISTS "Members can view family" ON pet_family;
CREATE POLICY "Members can view family"
  ON pet_family FOR SELECT USING (is_pet_member(pet_id));

DROP POLICY IF EXISTS "pet family readable" ON pet_family;
CREATE POLICY "pet family readable"
  ON pet_family FOR SELECT USING (is_pet_member(pet_id));

DROP POLICY IF EXISTS "pet owner manages" ON pet_family;
CREATE POLICY "pet owner manages"
  ON pet_family FOR ALL
  USING (EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid()));

-- ═══ RLS POLICIES: FAMILY_INVITATIONS ═══

DROP POLICY IF EXISTS "Pet owners can manage invitations" ON family_invitations;
CREATE POLICY "Pet owners can manage invitations"
  ON family_invitations FOR ALL
  USING (pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid()) OR invited_by = auth.uid());

DROP POLICY IF EXISTS "Invitees can view and accept their invitation" ON family_invitations;
CREATE POLICY "Invitees can view and accept their invitation"
  ON family_invitations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Invitees can update their invitation status" ON family_invitations;
CREATE POLICY "Invitees can update their invitation status"
  ON family_invitations FOR UPDATE
  USING (true) WITH CHECK (status IN ('accepted', 'declined'));

DROP POLICY IF EXISTS "inviter can read own invitations" ON family_invitations;
CREATE POLICY "inviter can read own invitations"
  ON family_invitations FOR SELECT USING (invited_by = auth.uid());

DROP POLICY IF EXISTS "anyone can read by token" ON family_invitations;
CREATE POLICY "anyone can read by token"
  ON family_invitations FOR SELECT USING (true);

DROP POLICY IF EXISTS "pet owner creates invitations" ON family_invitations;
CREATE POLICY "pet owner creates invitations"
  ON family_invitations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM pets WHERE id = pet_id AND owner_id = auth.uid()));

-- ═══ RLS POLICIES: HEALTH RECORDS ═══

DROP POLICY IF EXISTS "health_records_owner" ON health_records;
CREATE POLICY "health_records_owner" ON health_records
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM pets WHERE pets.id = health_records.pet_id AND pets.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "lab_results_owner" ON lab_results;
CREATE POLICY "lab_results_owner" ON lab_results
  FOR ALL USING (EXISTS (SELECT 1 FROM pets WHERE pets.id = lab_results.pet_id AND pets.owner_id = auth.uid()));

DROP POLICY IF EXISTS "medications_owner" ON medications;
CREATE POLICY "medications_owner" ON medications
  FOR ALL USING (EXISTS (SELECT 1 FROM pets WHERE pets.id = medications.pet_id AND pets.owner_id = auth.uid()));

-- ═══ RLS POLICIES: DAILY CARE ═══

DROP POLICY IF EXISTS "Pet members can manage mood_logs" ON mood_logs;
CREATE POLICY "mood_logs: members can read" ON mood_logs FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "mood_logs: daily care roles can insert" ON mood_logs FOR INSERT WITH CHECK (can_log_daily_care(pet_id));
CREATE POLICY "mood_logs: daily care roles can update" ON mood_logs FOR UPDATE USING (can_log_daily_care(pet_id));
CREATE POLICY "mood_logs: daily care roles can delete" ON mood_logs FOR DELETE USING (can_log_daily_care(pet_id));

DROP POLICY IF EXISTS "Pet members can manage feeding_logs" ON feeding_logs;
CREATE POLICY "feeding_logs: members can read" ON feeding_logs FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "feeding_logs: daily care roles can write" ON feeding_logs FOR INSERT WITH CHECK (can_log_daily_care(pet_id));
CREATE POLICY "feeding_logs: daily care roles can delete" ON feeding_logs FOR DELETE USING (can_log_daily_care(pet_id));

DROP POLICY IF EXISTS "Pet members can manage grooming_logs" ON grooming_logs;
CREATE POLICY "grooming_logs: members can read" ON grooming_logs FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "grooming_logs: daily care roles can write" ON grooming_logs FOR INSERT WITH CHECK (can_log_daily_care(pet_id));
CREATE POLICY "grooming_logs: daily care roles can delete" ON grooming_logs FOR DELETE USING (can_log_daily_care(pet_id));

DROP POLICY IF EXISTS "Pet members can manage daily_checklist" ON daily_checklist;
CREATE POLICY "daily_checklist: members can read" ON daily_checklist FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "daily_checklist: daily care roles can write" ON daily_checklist FOR INSERT WITH CHECK (can_log_daily_care(pet_id));
CREATE POLICY "daily_checklist: daily care roles can update" ON daily_checklist FOR UPDATE USING (can_log_daily_care(pet_id));
CREATE POLICY "daily_checklist: daily care roles can delete" ON daily_checklist FOR DELETE USING (can_log_daily_care(pet_id));

DROP POLICY IF EXISTS "Pet members can manage daily_notes" ON daily_notes;
CREATE POLICY "Pet members can manage daily_notes" ON daily_notes FOR ALL USING (is_pet_member(pet_id));

DROP POLICY IF EXISTS "pet members can manage scan counts" ON daily_scan_counts;
CREATE POLICY "daily_scan_counts: members can read" ON daily_scan_counts FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "daily_scan_counts: no direct writes" ON daily_scan_counts FOR INSERT WITH CHECK (false);
CREATE POLICY "daily_scan_counts: no direct updates" ON daily_scan_counts FOR UPDATE USING (false);

DROP POLICY IF EXISTS "Pet members can manage training" ON training_logs;
CREATE POLICY "Pet members can manage training" ON training_logs FOR ALL USING (is_pet_member(pet_id));

DROP POLICY IF EXISTS "Pet members can manage milestones" ON milestones;
CREATE POLICY "milestones: members can read" ON milestones FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "milestones: caretaker+ can write" ON milestones FOR INSERT WITH CHECK (can_log_health(pet_id));
CREATE POLICY "milestones: caretaker+ can delete" ON milestones FOR DELETE USING (can_log_health(pet_id));

-- ═══ RLS POLICIES: VACCINES & MEDS ═══

DROP POLICY IF EXISTS "Pet members can manage vaccines" ON vaccines;
CREATE POLICY "vaccines: members can read" ON vaccines FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "vaccines: health roles can write" ON vaccines FOR INSERT WITH CHECK (can_log_health(pet_id));
CREATE POLICY "vaccines: health roles can update" ON vaccines FOR UPDATE USING (can_log_health(pet_id));
CREATE POLICY "vaccines: health roles can delete" ON vaccines FOR DELETE USING (can_log_health(pet_id));

DROP POLICY IF EXISTS "Pet members can manage vet_visits" ON vet_visits;
CREATE POLICY "vet_visits: members can read" ON vet_visits FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "vet_visits: health roles can write" ON vet_visits FOR INSERT WITH CHECK (can_log_health(pet_id));
CREATE POLICY "vet_visits: health roles can update" ON vet_visits FOR UPDATE USING (can_log_health(pet_id));
CREATE POLICY "vet_visits: health roles can delete" ON vet_visits FOR DELETE USING (can_log_health(pet_id));

DROP POLICY IF EXISTS "Pet members can manage weight_logs" ON weight_logs;
CREATE POLICY "weight_logs: members can read" ON weight_logs FOR SELECT USING (can_read_pet(pet_id));
CREATE POLICY "weight_logs: health roles can write" ON weight_logs FOR INSERT WITH CHECK (can_log_health(pet_id));
CREATE POLICY "weight_logs: health roles can delete" ON weight_logs FOR DELETE USING (can_log_health(pet_id));

DROP POLICY IF EXISTS "Pet members can manage appointments" ON appointments;
CREATE POLICY "Pet members can manage appointments" ON appointments FOR ALL USING (is_pet_member(pet_id));

DROP POLICY IF EXISTS "Pet members can manage allergies" ON allergies;
CREATE POLICY "Pet members can manage allergies" ON allergies FOR ALL USING (is_pet_member(pet_id));

DROP POLICY IF EXISTS "Pet members can manage diet plans" ON diet_plans;
CREATE POLICY "Pet members can manage diet plans" ON diet_plans FOR ALL USING (is_pet_member(pet_id));

DROP POLICY IF EXISTS "Pet members can manage insurance" ON insurance_policies;
CREATE POLICY "Pet members can manage insurance" ON insurance_policies FOR ALL USING (is_pet_member(pet_id));

-- ═══ RLS POLICIES: EMERGENCY CONTACTS ═══

DROP POLICY IF EXISTS "Users can manage own contacts" ON emergency_contacts;
CREATE POLICY "Users can manage own contacts" ON emergency_contacts FOR ALL USING (user_id = auth.uid());

-- ═══ RLS POLICIES: VET CLINICS ═══

DROP POLICY IF EXISTS "Anyone can view clinics" ON vet_clinics;
CREATE POLICY "Anyone can view clinics" ON vet_clinics FOR SELECT USING (true);

-- ═══ RLS POLICIES: PET PHOTOS ═══

DROP POLICY IF EXISTS "Pet members can manage photos" ON pet_photos;
DROP POLICY IF EXISTS "Pet members can read photos" ON pet_photos;
DROP POLICY IF EXISTS "Pet members can insert photos" ON pet_photos;
DROP POLICY IF EXISTS "Pet members can update photos" ON pet_photos;
DROP POLICY IF EXISTS "Pet members can delete photos" ON pet_photos;

CREATE POLICY "Pet members can read photos" ON pet_photos FOR SELECT USING (is_pet_member(pet_id));
CREATE POLICY "Pet members can insert photos" ON pet_photos FOR INSERT WITH CHECK (is_pet_member(pet_id));
CREATE POLICY "Pet members can update photos" ON pet_photos FOR UPDATE USING (is_pet_member(pet_id)) WITH CHECK (is_pet_member(pet_id));
CREATE POLICY "Pet members can delete photos" ON pet_photos FOR DELETE USING (is_pet_member(pet_id));

-- ═══ RLS POLICIES: PET NOTES ═══

DROP POLICY IF EXISTS "Pet members can view notes" ON pet_notes;
CREATE POLICY "Pet members can view notes" ON pet_notes FOR SELECT USING (
  (
    pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
    OR pet_id IN (SELECT pet_id FROM pet_family WHERE user_id = auth.uid())
  )
  AND (is_private = false OR author_id = auth.uid())
);

DROP POLICY IF EXISTS "Pet members can insert notes" ON pet_notes;
CREATE POLICY "Pet members can insert notes" ON pet_notes FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND (
    pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
    OR pet_id IN (SELECT pet_id FROM pet_family WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Only author can update notes" ON pet_notes;
CREATE POLICY "Only author can update notes" ON pet_notes FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Author or owner can delete notes" ON pet_notes;
CREATE POLICY "Author or owner can delete notes" ON pet_notes FOR DELETE USING (
  auth.uid() = author_id
  OR pet_id IN (SELECT id FROM pets WHERE owner_id = auth.uid())
);

-- ═══ RLS POLICIES: SOCIAL ═══

DROP POLICY IF EXISTS "Public posts readable" ON social_posts;
DROP POLICY IF EXISTS "Public posts are visible to all" ON social_posts;
CREATE POLICY "Public posts readable" ON social_posts FOR SELECT
  USING (is_public = true OR author_id = auth.uid());

DROP POLICY IF EXISTS "Pet members can create posts" ON social_posts;
DROP POLICY IF EXISTS "Auth users create own posts" ON social_posts;
CREATE POLICY "Auth users create own posts" ON social_posts FOR INSERT WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Authors can manage own posts" ON social_posts;
DROP POLICY IF EXISTS "Authors can update own posts" ON social_posts;
CREATE POLICY "Authors can update own posts" ON social_posts FOR UPDATE USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can update likes" ON social_posts;
CREATE POLICY "Anyone can update likes" ON social_posts FOR UPDATE USING (is_public = true) WITH CHECK (is_public = true);

DROP POLICY IF EXISTS "Authors can delete own posts" ON social_posts;
CREATE POLICY "Authors can delete own posts" ON social_posts FOR DELETE USING (author_id = auth.uid());

-- Post comments
DROP POLICY IF EXISTS "Anyone can read comments" ON post_comments;
CREATE POLICY "Anyone can read comments" ON post_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth users can comment" ON post_comments;
CREATE POLICY "Auth users can comment" ON post_comments FOR INSERT WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Authors can delete comments" ON post_comments;
CREATE POLICY "Authors can delete comments" ON post_comments FOR DELETE USING (author_id = auth.uid());

-- Pet follows
DROP POLICY IF EXISTS "Anyone can read follows" ON pet_follows;
CREATE POLICY "Anyone can read follows" ON pet_follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own follows" ON pet_follows;
CREATE POLICY "Users manage own follows" ON pet_follows FOR ALL USING (follower_id = auth.uid());

-- ═══ RLS POLICIES: PLAYDATE ═══

DROP POLICY IF EXISTS "Pet members can manage playdate_requests" ON playdate_requests;
CREATE POLICY "Pet members can manage playdate_requests" ON playdate_requests FOR ALL
  USING (is_pet_member(from_pet_id) OR is_pet_member(to_pet_id));

DROP POLICY IF EXISTS "Target pet owner can read requests" ON playdate_requests;
CREATE POLICY "Target pet owner can read requests" ON playdate_requests FOR SELECT USING (is_pet_member(to_pet_id));

-- Playdate chats
DROP POLICY IF EXISTS "Users can view own playdate chats" ON playdate_chats;
CREATE POLICY "Users can view own playdate chats" ON playdate_chats FOR SELECT
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own playdate chats" ON playdate_chats;
CREATE POLICY "Users can update own playdate chats" ON playdate_chats FOR UPDATE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

-- Playdate chat messages
DROP POLICY IF EXISTS "Users can view own chat messages" ON playdate_chat_messages;
CREATE POLICY "Users can view own chat messages" ON playdate_chat_messages FOR SELECT
  USING (
    chat_id IN (
      SELECT id FROM playdate_chats
      WHERE from_owner_id = auth.uid() OR to_owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert chat messages" ON playdate_chat_messages;
CREATE POLICY "Users can insert chat messages" ON playdate_chat_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Playdate meetings
DROP POLICY IF EXISTS "Users can view own playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can view own playdate meetings" ON playdate_meetings FOR SELECT
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can update own playdate meetings" ON playdate_meetings FOR UPDATE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can cancel playdate meetings" ON playdate_meetings;
CREATE POLICY "Users can cancel playdate meetings" ON playdate_meetings FOR UPDATE
  USING (from_owner_id = auth.uid() OR to_owner_id = auth.uid())
  WITH CHECK (status = 'cancelled' AND cancelled_by = auth.uid());

-- ═══ RLS POLICIES: EVENTS ═══

DROP POLICY IF EXISTS "public events readable" ON community_events;
CREATE POLICY "public events readable" ON community_events FOR SELECT
  USING (is_public = true OR organizer_id = auth.uid());

DROP POLICY IF EXISTS "users create events" ON community_events;
CREATE POLICY "users create events" ON community_events FOR INSERT WITH CHECK (organizer_id = auth.uid());

DROP POLICY IF EXISTS "organizer updates events" ON community_events;
CREATE POLICY "organizer updates events" ON community_events FOR UPDATE USING (organizer_id = auth.uid());

DROP POLICY IF EXISTS "organizer deletes events" ON community_events;
CREATE POLICY "organizer deletes events" ON community_events FOR DELETE USING (organizer_id = auth.uid());

-- Event RSVPs
DROP POLICY IF EXISTS "rsvps readable" ON event_rsvps;
CREATE POLICY "rsvps readable" ON event_rsvps FOR SELECT USING (true);

DROP POLICY IF EXISTS "users rsvp" ON event_rsvps;
CREATE POLICY "users rsvp" ON event_rsvps FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users cancel rsvp" ON event_rsvps;
CREATE POLICY "users cancel rsvp" ON event_rsvps FOR DELETE USING (user_id = auth.uid());

-- Event messages
DROP POLICY IF EXISTS "Event participants can read messages" ON event_messages;
CREATE POLICY "Event participants can read messages" ON event_messages FOR SELECT
  USING (is_event_participant(event_id));

DROP POLICY IF EXISTS "Event participants can send messages" ON event_messages;
CREATE POLICY "Event participants can send messages" ON event_messages FOR INSERT
  WITH CHECK (is_event_participant(event_id) AND sender_id = auth.uid());

-- ═══ RLS POLICIES: LOST & FOUND ═══

DROP POLICY IF EXISTS "Pet members can manage lost_alerts" ON lost_alerts;
CREATE POLICY "lost_alerts: members can read" ON lost_alerts FOR SELECT USING (can_read_pet(pet_id));

CREATE POLICY "lost_alerts: caretaker+ can write" ON lost_alerts FOR INSERT WITH CHECK (can_log_health(pet_id));

CREATE POLICY "lost_alerts: caretaker+ can update" ON lost_alerts FOR UPDATE USING (can_log_health(pet_id));

DROP POLICY IF EXISTS "Anyone can view lost_alerts" ON lost_alerts;
CREATE POLICY "Anyone can view lost_alerts" ON lost_alerts FOR SELECT USING (true);

-- ═══ RLS POLICIES: LOCATIONS & NEARBY ═══

DROP POLICY IF EXISTS "user_locations_own_write" ON user_locations;
CREATE POLICY "user_locations_own_write" ON user_locations FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_locations_service_read" ON user_locations;
CREATE POLICY "user_locations_service_read" ON user_locations FOR SELECT USING (true);

-- Nearby places
DROP POLICY IF EXISTS "nearby_read" ON nearby_places;
CREATE POLICY "nearby_read" ON nearby_places FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "nearby_upsert" ON nearby_places;
CREATE POLICY "nearby_upsert" ON nearby_places FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "nearby_update" ON nearby_places;
CREATE POLICY "nearby_update" ON nearby_places FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "nearby_delete" ON nearby_places;
CREATE POLICY "nearby_delete" ON nearby_places FOR DELETE USING (auth.role() = 'authenticated');

-- ═══ RLS POLICIES: DISCOVERY ═══

DROP POLICY IF EXISTS "Partners are publicly readable" ON partners;
CREATE POLICY "Partners are publicly readable" ON partners FOR SELECT TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS "Products are publicly readable" ON pet_products;
CREATE POLICY "Products are publicly readable" ON pet_products FOR SELECT TO anon, authenticated
  USING (active = true);

-- Sponsored listings
DROP POLICY IF EXISTS "read active listings" ON sponsored_listings;
CREATE POLICY "read active listings" ON sponsored_listings FOR SELECT
  USING (is_active = true OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

DROP POLICY IF EXISTS "admin write" ON sponsored_listings;
CREATE POLICY "admin write" ON sponsored_listings FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- ═══ RLS POLICIES: PUSH & NOTIFICATIONS ═══

DROP POLICY IF EXISTS "Users can manage own tokens" ON push_tokens;
CREATE POLICY "Users can manage own tokens" ON push_tokens FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own notifications" ON notification_log;
CREATE POLICY "Users can manage own notifications" ON notification_log FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own notifications" ON notification_logs;
CREATE POLICY "Users can view own notifications" ON notification_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notification_logs;
CREATE POLICY "Authenticated users can insert notifications" ON notification_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON notification_logs;
CREATE POLICY "Users can update own notifications" ON notification_logs FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notification_logs;
CREATE POLICY "Users can delete own notifications" ON notification_logs FOR DELETE USING (auth.uid() = user_id);

-- ═══ RLS POLICIES: API & ADMIN ═══

DROP POLICY IF EXISTS "blocked_words: no direct access" ON blocked_words;
CREATE POLICY "blocked_words: no direct access" ON blocked_words USING (false);

DROP POLICY IF EXISTS "admin read usage" ON api_usage_logs;
CREATE POLICY "admin read usage" ON api_usage_logs FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "service insert" ON api_usage_logs;
CREATE POLICY "service insert" ON api_usage_logs FOR INSERT WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "admin read" ON media_retention_config;
CREATE POLICY "admin read" ON media_retention_config FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "admin write" ON media_retention_config;
CREATE POLICY "admin write" ON media_retention_config FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- ═══ FUNCTIONS & TRIGGERS ═══

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_full_name text;
BEGIN
  v_full_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'user_name',
    split_part(new.email, '@', 1)
  );
  INSERT INTO profiles (id, full_name)
  VALUES (new.id, v_full_name)
  ON CONFLICT (id) DO UPDATE
    SET full_name = v_full_name
    WHERE profiles.full_name IS NULL OR profiles.full_name = '';
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Failed to create profile for user %: %', new.id, SQLERRM;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-create milestones
CREATE OR REPLACE FUNCTION check_milestone()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  days_count integer;
  pet_record pets%ROWTYPE;
BEGIN
  SELECT * INTO pet_record FROM pets WHERE id = new.id;
  IF pet_record.adoption_date IS NULL THEN RETURN new; END IF;
  days_count := (current_date - pet_record.adoption_date);
  IF days_count IN (1, 100, 365, 500, 1000) THEN
    INSERT INTO milestones (pet_id, day_count, title, achieved_at)
    VALUES (
      new.id,
      days_count,
      'Day ' || days_count || ' with ' || pet_record.name || '!',
      current_date
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

-- Expire old invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE family_invitations
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at < now();
END;
$$;

-- Notify on invite
CREATE OR REPLACE FUNCTION notify_on_invite()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pet_name text;
  inviter_name text;
BEGIN
  SELECT name INTO pet_name FROM pets WHERE id = new.pet_id;
  SELECT full_name INTO inviter_name FROM profiles WHERE id = new.invited_by;
  INSERT INTO notification_log (user_id, title, body, type, data)
  SELECT id,
    'You''re invited to care for ' || pet_name,
    (inviter_name ?? 'Someone') || ' invited you to join ' || pet_name || '''s family',
    'invite',
    jsonb_build_object('invitation_token', new.token, 'pet_id', new.pet_id)
  FROM auth.users
  WHERE email = new.email;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_family_invitation_created ON family_invitations;
CREATE TRIGGER on_family_invitation_created
  AFTER INSERT ON family_invitations
  FOR EACH ROW EXECUTE FUNCTION notify_on_invite();

-- Update pet location timestamp
CREATE OR REPLACE FUNCTION update_pet_location_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.location_lat IS DISTINCT FROM old.location_lat
  OR new.location_lng IS DISTINCT FROM old.location_lng THEN
    new.location_updated_at := now();
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_pet_location_update ON pets;
CREATE TRIGGER on_pet_location_update
  BEFORE UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION update_pet_location_timestamp();

-- Set updated_at on social posts
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_social_posts_updated_at ON social_posts;
CREATE TRIGGER set_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Post comments count trigger
CREATE OR REPLACE FUNCTION trg_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE social_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_count ON post_comments;
CREATE TRIGGER trg_comments_count
  AFTER INSERT OR DELETE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION trg_post_comment_count();

-- Pet follows count trigger
CREATE OR REPLACE FUNCTION trg_pet_follow_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE pets SET followers_count = followers_count + 1 WHERE id = NEW.following_pet_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE pets SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_pet_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_count ON pet_follows;
CREATE TRIGGER trg_follow_count
  AFTER INSERT OR DELETE ON pet_follows
  FOR EACH ROW EXECUTE FUNCTION trg_pet_follow_count();

-- Sponsored listings updated_at
CREATE OR REPLACE FUNCTION _sponsored_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_sponsored_updated_at ON sponsored_listings;
CREATE TRIGGER trg_sponsored_updated_at
  BEFORE UPDATE ON sponsored_listings
  FOR EACH ROW EXECUTE FUNCTION _sponsored_set_updated_at();

-- Media retention config updated_at
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_media_retention_updated_at ON media_retention_config;
CREATE TRIGGER trg_media_retention_updated_at
  BEFORE UPDATE ON media_retention_config
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- Content moderation: check message content
CREATE OR REPLACE FUNCTION check_message_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  clean_msg text;
  matched text;
BEGIN
  clean_msg := lower(NEW.message);
  clean_msg := regexp_replace(clean_msg, '[@4]',  'a', 'g');
  clean_msg := regexp_replace(clean_msg, '[3]',   'e', 'g');
  clean_msg := regexp_replace(clean_msg, '[1!|]', 'i', 'g');
  clean_msg := regexp_replace(clean_msg, '[0]',   'o', 'g');
  clean_msg := regexp_replace(clean_msg, '[$5]',  's', 'g');
  clean_msg := regexp_replace(clean_msg, '[^a-z\s]', '', 'g');
  SELECT word INTO matched FROM blocked_words
  WHERE clean_msg ~ ('\m' || regexp_replace(word, '[^a-z]', '', 'g') || '\M')
  LIMIT 1;
  IF matched IS NOT NULL THEN
    RAISE EXCEPTION 'OFFENSIVE_CONTENT: Message contains prohibited language.'
      USING HINT = 'Please keep the conversation respectful.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_playdate_message ON playdate_chat_messages;
CREATE TRIGGER trg_check_playdate_message
  BEFORE INSERT ON playdate_chat_messages
  FOR EACH ROW EXECUTE FUNCTION check_message_content();

DROP TRIGGER IF EXISTS trg_check_event_message ON event_messages;
CREATE TRIGGER trg_check_event_message
  BEFORE INSERT ON event_messages
  FOR EACH ROW EXECUTE FUNCTION check_message_content();

-- Check post content
CREATE OR REPLACE FUNCTION check_post_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  clean_text text;
  matched text;
BEGIN
  IF NEW.caption IS NULL OR trim(NEW.caption) = '' THEN RETURN NEW; END IF;
  clean_text := lower(NEW.caption);
  clean_text := regexp_replace(clean_text, '[@4]',  'a', 'g');
  clean_text := regexp_replace(clean_text, '[3]',   'e', 'g');
  clean_text := regexp_replace(clean_text, '[1!|]', 'i', 'g');
  clean_text := regexp_replace(clean_text, '[0]',   'o', 'g');
  clean_text := regexp_replace(clean_text, '[$5]',  's', 'g');
  clean_text := regexp_replace(clean_text, '[^a-z\s]', '', 'g');
  SELECT word INTO matched FROM blocked_words
  WHERE clean_text ~ ('\m' || regexp_replace(word, '[^a-z]', '', 'g') || '\M')
  LIMIT 1;
  IF matched IS NOT NULL THEN
    RAISE EXCEPTION 'OFFENSIVE_CONTENT: Post contains prohibited language.'
      USING HINT = 'Please keep posts respectful.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_social_post ON social_posts;
CREATE TRIGGER trg_check_social_post
  BEFORE INSERT OR UPDATE OF caption ON social_posts
  FOR EACH ROW EXECUTE FUNCTION check_post_content();

-- Check comment content
CREATE OR REPLACE FUNCTION check_comment_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  clean_text text;
  matched text;
BEGIN
  clean_text := lower(NEW.body);
  clean_text := regexp_replace(clean_text, '[@4]',  'a', 'g');
  clean_text := regexp_replace(clean_text, '[3]',   'e', 'g');
  clean_text := regexp_replace(clean_text, '[1!|]', 'i', 'g');
  clean_text := regexp_replace(clean_text, '[0]',   'o', 'g');
  clean_text := regexp_replace(clean_text, '[$5]',  's', 'g');
  clean_text := regexp_replace(clean_text, '[^a-z\s]', '', 'g');
  SELECT word INTO matched FROM blocked_words
  WHERE clean_text ~ ('\m' || regexp_replace(word, '[^a-z]', '', 'g') || '\M')
  LIMIT 1;
  IF matched IS NOT NULL THEN
    RAISE EXCEPTION 'OFFENSIVE_CONTENT: Comment contains prohibited language.'
      USING HINT = 'Please keep comments respectful.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_post_comment ON post_comments;
CREATE TRIGGER trg_check_post_comment
  BEFORE INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION check_comment_content();

-- ═══ RPC FUNCTIONS ═══

-- Nearby lost alerts (with PostGIS)
CREATE OR REPLACE FUNCTION get_nearby_lost_alerts(
  p_lat decimal,
  p_lng decimal,
  p_radius_km decimal DEFAULT 10
)
RETURNS SETOF lost_alerts
LANGUAGE sql STABLE AS $$
  SELECT * FROM lost_alerts
  WHERE is_found = false
  AND location IS NOT NULL
  AND ST_DWithin(
    location::geography,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius_km * 1000
  )
  ORDER BY created_at DESC;
$$;

-- Nearby users (SOS notifications)
CREATE OR REPLACE FUNCTION get_nearby_users(
  p_lat decimal,
  p_lng decimal,
  p_radius_km decimal DEFAULT 10
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  token text,
  platform text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT ON (pt.user_id)
    pt.user_id,
    pr.full_name,
    pt.token,
    pt.platform
  FROM push_tokens pt
  JOIN profiles pr ON pr.id = pt.user_id
  LEFT JOIN user_locations ul ON ul.user_id = pt.user_id
  LEFT JOIN (
    SELECT DISTINCT ON (owner_id) owner_id, location_lat, location_lng
    FROM pets
    WHERE location_lat IS NOT NULL
    ORDER BY owner_id, location_updated_at DESC NULLS LAST
  ) pp ON pp.owner_id = pt.user_id
  WHERE pt.token LIKE 'ExponentPushToken%'
    AND pt.user_id != auth.uid()
    AND (
      (ul.user_id IS NOT NULL AND
       earth_distance(
         ll_to_earth(ul.lat::float8, ul.lng::float8),
         ll_to_earth(p_lat::float8, p_lng::float8)
       ) <= p_radius_km * 1000)
      OR
      (ul.user_id IS NULL AND pp.owner_id IS NOT NULL AND
       earth_distance(
         ll_to_earth(pp.location_lat::float8, pp.location_lng::float8),
         ll_to_earth(p_lat::float8, p_lng::float8)
       ) <= p_radius_km * 1000)
    )
  ORDER BY pt.user_id;
$$;

-- Nearby partners (haversine distance)
CREATE OR REPLACE FUNCTION get_nearby_partners(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_species text DEFAULT NULL,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  subtitle text,
  city text,
  rating numeric,
  price_from numeric,
  is_24h boolean,
  phone text,
  emoji text,
  image_url text,
  accent_color text,
  sponsored boolean,
  cta_label text,
  cta_url text,
  distance_km double precision
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id, p.name, p.category, p.subtitle, p.city, p.rating, p.price_from,
    p.is_24h, p.phone, p.emoji, p.image_url, p.accent_color,
    p.sponsored, p.cta_label, p.cta_url,
    CASE
      WHEN p_lat IS NULL OR p_lng IS NULL OR p.lat IS NULL OR p.lng IS NULL THEN NULL
      ELSE 6371 * acos(
        LEAST(1.0,
          cos(radians(p_lat)) * cos(radians(p.lat)) *
          cos(radians(p.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(p.lat))
        )
      )
    END AS distance_km
  FROM partners p
  WHERE p.active = true
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_species IS NULL OR p.species IS NULL OR cardinality(p.species) = 0 OR p_species = ANY(p.species))
  ORDER BY
    p.sponsored DESC,
    p.sponsor_rank DESC,
    distance_km ASC NULLS LAST,
    p.rating DESC NULLS LAST
  LIMIT GREATEST(1, p_limit);
$$;

-- Daily scan count management
CREATE OR REPLACE FUNCTION increment_scan_count(p_pet_id uuid, p_date date)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO daily_scan_counts (pet_id, date, count, ai_attempts, slot_counter)
  VALUES (p_pet_id, p_date, 1, 0, 0)
  ON CONFLICT (pet_id, date)
  DO UPDATE SET count = daily_scan_counts.count + 1;
$$;

CREATE OR REPLACE FUNCTION start_scan_slot(p_pet_id uuid, p_date date)
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO daily_scan_counts (pet_id, date, count, ai_attempts, slot_counter)
  VALUES (p_pet_id, p_date, 0, 0, 1)
  ON CONFLICT (pet_id, date)
  DO UPDATE SET slot_counter = daily_scan_counts.slot_counter + 1
  RETURNING slot_counter;
$$;

CREATE OR REPLACE FUNCTION record_ai_attempt(p_pet_id uuid, p_date date)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO daily_scan_counts (pet_id, date, count, ai_attempts, slot_counter)
  VALUES (p_pet_id, p_date, 0, 1, 0)
  ON CONFLICT (pet_id, date)
  DO UPDATE SET ai_attempts = daily_scan_counts.ai_attempts + 1;
$$;

-- Atomic counter updates
CREATE OR REPLACE FUNCTION increment_post_likes(p_post_id uuid, p_delta int)
RETURNS void LANGUAGE sql AS $$
  UPDATE social_posts
  SET likes_count = GREATEST(0, COALESCE(likes_count, 0) + p_delta)
  WHERE id = p_post_id;
$$;

CREATE OR REPLACE FUNCTION increment_post_comments(p_post_id uuid, p_delta int)
RETURNS void LANGUAGE sql AS $$
  UPDATE social_posts
  SET comments_count = GREATEST(0, COALESCE(comments_count, 0) + p_delta)
  WHERE id = p_post_id;
$$;

GRANT EXECUTE ON FUNCTION increment_post_likes(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_post_comments(uuid, int) TO authenticated;

-- ═══ STORAGE ═══

-- Create 'pets' bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pets',
  'pets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create 'health-records' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('health-records', 'health-records', true)
ON CONFLICT (id) DO NOTHING;

-- ═══ STORAGE POLICIES ═══

-- Health records bucket
DROP POLICY IF EXISTS "health_records_upload" ON storage.objects;
CREATE POLICY "health_records_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'health-records' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "health_records_read" ON storage.objects;
CREATE POLICY "health_records_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'health-records' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "health_records_delete" ON storage.objects;
CREATE POLICY "health_records_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'health-records' AND auth.uid() IS NOT NULL);

-- Pets bucket: authenticated users
DROP POLICY IF EXISTS "Authenticated users can upload to owned paths" ON storage.objects;
CREATE POLICY "Authenticated users can upload to owned paths" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pets' AND (
      (split_part(name, '/', 1) = 'users' AND split_part(name, '/', 2) = auth.uid()::text)
      OR storage_path_is_pet_member(name)
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update owned paths" ON storage.objects;
CREATE POLICY "Authenticated users can update owned paths" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pets' AND (
      (split_part(name, '/', 1) = 'users' AND split_part(name, '/', 2) = auth.uid()::text)
      OR storage_path_is_pet_member(name)
    )
  );

DROP POLICY IF EXISTS "Authenticated users can delete owned paths" ON storage.objects;
CREATE POLICY "Authenticated users can delete owned paths" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pets' AND (
      (split_part(name, '/', 1) = 'users' AND split_part(name, '/', 2) = auth.uid()::text)
      OR storage_path_is_pet_member(name)
    )
  );

-- Sponsored content
DROP POLICY IF EXISTS "admin upload sponsored" ON storage.objects;
CREATE POLICY "admin upload sponsored" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pets'
    AND (storage.foldername(name))[1] = 'sponsored'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "public read sponsored" ON storage.objects;
CREATE POLICY "public read sponsored" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'pets' AND (storage.foldername(name))[1] = 'sponsored');

DROP POLICY IF EXISTS "admin update sponsored" ON storage.objects;
CREATE POLICY "admin update sponsored" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pets'
    AND (storage.foldername(name))[1] = 'sponsored'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

DROP POLICY IF EXISTS "admin delete sponsored" ON storage.objects;
CREATE POLICY "admin delete sponsored" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pets'
    AND (storage.foldername(name))[1] = 'sponsored'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- Public read
DROP POLICY IF EXISTS "Pet photos are publicly readable" ON storage.objects;
CREATE POLICY "Pet photos are publicly readable" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'pets');

-- ═══ REALTIME & PUBLICATIONS ═══

ALTER TABLE playdate_chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE playdate_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE event_messages;

-- ═══ VIEWS ═══

DROP VIEW IF EXISTS storage_usage_summary;
CREATE OR REPLACE VIEW storage_usage_summary AS
SELECT
  COALESCE(p.owner_id::text, o.first_segment) AS user_id,
  COUNT(*) AS file_count,
  SUM((o.metadata->>'size')::bigint) AS total_bytes,
  MAX(o.created_at) AS last_upload
FROM (
  SELECT *,
    split_part(name, '/', 1) AS first_segment
  FROM storage.objects
  WHERE bucket_id = 'pets'
) o
LEFT JOIN pets p ON p.id::text = o.first_segment
GROUP BY 1
ORDER BY total_bytes DESC NULLS LAST;

