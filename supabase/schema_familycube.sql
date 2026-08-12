-- WARNING: This schema is for context only and is not meant to be run directly.
-- Table order and constraints may not be valid for execution.
-- FamilyCube Supabase project: gqzdbxrqpkwvwcwvdnix

CREATE TABLE public.members (
  id text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['parent'::text, 'child'::text, 'kid'::text, 'grandparent'::text])),
  avatar text NOT NULL,
  coins integer DEFAULT 0,
  xp integer DEFAULT 0,
  level integer DEFAULT 1,
  max_xp integer DEFAULT 100,
  streak integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  color text DEFAULT '#4F46E5'::text,
  title text DEFAULT 'Explorer'::text,
  pin text,
  timezone text DEFAULT 'America/New_York'::text,
  custom_badge text,
  last_active timestamp with time zone DEFAULT now(),
  family_id uuid,
  CONSTRAINT members_pkey PRIMARY KEY (id),
  CONSTRAINT members_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id)
);

CREATE TABLE public.chore_tasks (
  id text NOT NULL,
  title text NOT NULL,
  description text,
  coins_reward integer DEFAULT 10,
  xp_reward integer DEFAULT 15,
  assigned_to_id text,
  due_date text,
  category text DEFAULT 'home'::text,
  status text DEFAULT 'todo'::text CHECK (status = ANY (ARRAY['todo'::text, 'pending_approval'::text, 'completed'::text, 'declined'::text])),
  submission_note text,
  approved_at text,
  created_at timestamp with time zone DEFAULT now(),
  difficulty text DEFAULT 'easy'::text,
  due_time text,
  timezone text DEFAULT 'UTC'::text,
  submission_photo_url text,
  submission_attachment_name text,
  rejection_reason text,
  declined_at timestamp with time zone,
  submitted_at timestamp with time zone,
  is_common_chore boolean DEFAULT false,
  is_unassigned boolean DEFAULT false,
  requires_photo boolean DEFAULT false,
  created_by_id text,
  is_daily_quest boolean DEFAULT false,
  CONSTRAINT chore_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT chore_tasks_assigned_to_id_fkey FOREIGN KEY (assigned_to_id) REFERENCES public.members(id),
  CONSTRAINT chore_tasks_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.members(id)
);

CREATE TABLE public.reward_items (
  id text NOT NULL,
  title text NOT NULL,
  description text,
  coin_cost integer DEFAULT 50,
  icon text DEFAULT '🎁'::text,
  category text DEFAULT 'fun'::text,
  created_at timestamp with time zone DEFAULT now(),
  stock integer,
  is_screen_time_pass boolean DEFAULT false,
  CONSTRAINT reward_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reward_redemptions (
  id text NOT NULL,
  reward_id text,
  reward_title text NOT NULL,
  coin_cost integer NOT NULL,
  member_id text,
  member_name text NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])),
  requested_at text DEFAULT 'Just now'::text,
  created_at timestamp with time zone DEFAULT now(),
  screen_time_code text,
  declined_reason text,
  approved_at timestamp with time zone,
  declined_at timestamp with time zone,
  CONSTRAINT reward_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT reward_redemptions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.reward_items(id),
  CONSTRAINT reward_redemptions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id)
);

CREATE TABLE public.calendar_events (
  id text NOT NULL,
  title text NOT NULL,
  date text NOT NULL,
  start_time text,
  end_time text,
  category text DEFAULT 'family'::text,
  assigned_member_ids jsonb DEFAULT '[]'::jsonb,
  location text,
  description text,
  is_work_meeting boolean DEFAULT false,
  is_pickup_or_dropoff boolean DEFAULT false,
  driver_id text,
  created_at timestamp with time zone DEFAULT now(),
  timezone text DEFAULT 'America/New_York'::text,
  start_utc timestamp with time zone,
  end_utc timestamp with time zone,
  status text DEFAULT 'approved'::text CHECK (status = ANY (ARRAY['approved'::text, 'pending_approval'::text, 'declined'::text])),
  approved_by text,
  approved_at text,
  rejection_note text,
  assistance_type text DEFAULT 'none'::text,
  assigned_assistant_id text,
  created_by_id text,
  driver_en_route boolean DEFAULT false,
  recurrence text DEFAULT 'none'::text CHECK (recurrence = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text, 'monthly'::text])),
  recurrence_end_date text,
  CONSTRAINT calendar_events_pkey PRIMARY KEY (id),
  CONSTRAINT calendar_events_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.members(id),
  CONSTRAINT calendar_events_assigned_assistant_id_fkey FOREIGN KEY (assigned_assistant_id) REFERENCES public.members(id),
  CONSTRAINT calendar_events_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.members(id)
);

CREATE TABLE public.member_locations (
  member_id text NOT NULL,
  address text NOT NULL,
  neighborhood text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  battery_level integer DEFAULT 100,
  is_charging boolean DEFAULT false,
  speed_mph integer DEFAULT 0,
  last_updated timestamp with time zone DEFAULT now(),
  status text DEFAULT 'at_home'::text CHECK (status = ANY (ARRAY['at_home'::text, 'at_school'::text, 'at_work'::text, 'in_transit'::text, 'at_activity'::text])),
  status_text text,
  distance_from_home_miles numeric DEFAULT 0.0,
  safe_zone_name text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT member_locations_pkey PRIMARY KEY (member_id),
  CONSTRAINT member_locations_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id)
);

CREATE TABLE public.grocery_items (
  id text NOT NULL,
  name text NOT NULL,
  category text DEFAULT 'Pantry'::text,
  quantity text DEFAULT '1'::text,
  bought boolean DEFAULT false,
  added_by_member_id text,
  created_at timestamp with time zone DEFAULT now(),
  family_id text,
  store_preference text,
  added_by text,
  is_bought boolean NOT NULL DEFAULT false,
  bought_by text,
  bought_at timestamp with time zone,
  estimated_price numeric,
  notes text,
  ai_generated boolean NOT NULL DEFAULT false,
  CONSTRAINT grocery_items_pkey PRIMARY KEY (id),
  CONSTRAINT grocery_items_added_by_member_id_fkey FOREIGN KEY (added_by_member_id) REFERENCES public.members(id)
);

CREATE TABLE public.chat_messages (
  id text NOT NULL DEFAULT gen_random_uuid(),
  sender_id text,
  text text NOT NULL,
  timestamp text NOT NULL,
  type text DEFAULT 'text'::text CHECK (type = ANY (ARRAY['text'::text, 'announcement'::text, 'sos'::text])),
  reactions jsonb DEFAULT '{}'::jsonb,
  channel_id text DEFAULT 'general'::text,
  created_at timestamp with time zone DEFAULT now(),
  photo_url text,
  is_pinned boolean DEFAULT false,
  is_edited boolean DEFAULT false,
  reply_to_id text,
  media_url text,
  media_type text CHECK (media_type = ANY (ARRAY['image'::text, 'audio'::text, 'video'::text, 'file'::text, NULL::text])),
  file_name text,
  duration_sec integer,
  image_url text,
  reply_to jsonb,
  edited boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  voice_duration integer,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.members(id),
  CONSTRAINT chat_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.chat_messages(id)
);

CREATE TABLE public.family_goals (
  id text NOT NULL,
  title text NOT NULL,
  target_xp integer DEFAULT 600,
  current_xp integer DEFAULT 0,
  voting_open boolean DEFAULT true,
  options jsonb DEFAULT '[]'::jsonb,
  winning_option_id text,
  unlocked_at text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT family_goals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
  id text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  timestamp text NOT NULL,
  type text DEFAULT 'general'::text,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  action_url text,
  target_member text,
  meta jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.family_photos (
  id text NOT NULL,
  url text NOT NULL,
  caption text,
  uploaded_by text,
  tagged_members jsonb DEFAULT '[]'::jsonb,
  taken_at text,
  album text DEFAULT 'general'::text,
  reaction_counts jsonb DEFAULT '{}'::jsonb,
  is_favorite boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT family_photos_pkey PRIMARY KEY (id),
  CONSTRAINT family_photos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.members(id)
);

CREATE TABLE public.family_meals (
  id text NOT NULL,
  day text NOT NULL,
  title text NOT NULL,
  type text DEFAULT 'dinner'::text CHECK (type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text])),
  ingredients jsonb DEFAULT '[]'::jsonb,
  chef_id text,
  recipe_url text,
  image_url text,
  week_of text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT family_meals_pkey PRIMARY KEY (id),
  CONSTRAINT family_meals_chef_id_fkey FOREIGN KEY (chef_id) REFERENCES public.members(id)
);

CREATE TABLE public.daily_streaks (
  member_id text NOT NULL,
  streak integer DEFAULT 0,
  last_active_date text NOT NULL,
  longest_streak integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_streaks_pkey PRIMARY KEY (member_id),
  CONSTRAINT daily_streaks_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id)
);

CREATE TABLE public.audit_log (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  actor_id text,
  action_type text NOT NULL,
  subject_id text,
  subject_type text,
  detail text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.members(id)
);

CREATE TABLE public.notification_preferences (
  member_id text NOT NULL,
  chore_reminders boolean DEFAULT true,
  event_alerts boolean DEFAULT true,
  reward_alerts boolean DEFAULT true,
  quiet_hours_start text DEFAULT '22:00'::text,
  quiet_hours_end text DEFAULT '07:00'::text,
  push_token text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (member_id),
  CONSTRAINT notification_preferences_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id)
);

CREATE TABLE public.family_posts (
  id text NOT NULL,
  author_id text NOT NULL,
  type text NOT NULL DEFAULT 'text'::text CHECK (type = ANY (ARRAY['text'::text, 'photo'::text, 'milestone'::text, 'poll'::text, 'announcement'::text, 'memory'::text])),
  title text,
  body text,
  media_urls jsonb DEFAULT '[]'::jsonb,
  media_type text CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, NULL::text])),
  poll_options jsonb,
  poll_ends_at timestamp with time zone,
  tags jsonb DEFAULT '[]'::jsonb,
  is_pinned boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  visibility text DEFAULT 'family'::text CHECK (visibility = ANY (ARRAY['family'::text, 'parents_only'::text, 'kids_only'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT family_posts_pkey PRIMARY KEY (id),
  CONSTRAINT family_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.members(id)
);

CREATE TABLE public.post_reactions (
  id text NOT NULL DEFAULT (gen_random_uuid())::text,
  post_id text NOT NULL,
  member_id text NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT post_reactions_pkey PRIMARY KEY (id),
  CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.family_posts(id),
  CONSTRAINT post_reactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id)
);

CREATE TABLE public.comments (
  id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type = ANY (ARRAY['post'::text, 'task'::text, 'event'::text, 'photo'::text])),
  subject_id text NOT NULL,
  author_id text NOT NULL,
  body text NOT NULL,
  media_url text,
  parent_id text,
  is_edited boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.members(id),
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id)
);

CREATE TABLE public.chat_channels (
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'group'::text CHECK (type = ANY (ARRAY['general'::text, 'parents_only'::text, 'kids_only'::text, 'group'::text, 'direct'::text, 'activity'::text])),
  member_ids jsonb DEFAULT '[]'::jsonb,
  icon text DEFAULT '💬'::text,
  is_encrypted boolean DEFAULT false,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_channels_pkey PRIMARY KEY (id),
  CONSTRAINT chat_channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.members(id)
);

CREATE TABLE public.families (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT families_pkey PRIMARY KEY (id),
  CONSTRAINT families_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE TABLE public.family_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text])),
  created_by uuid,
  used_by uuid,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT family_invites_pkey PRIMARY KEY (id),
  CONSTRAINT family_invites_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id),
  CONSTRAINT family_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT family_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id)
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  display_name text,
  handle text,
  avatar_url text,
  email text,
  phone text,
  timezone text DEFAULT 'UTC'::text,
  bio text,
  family_role text DEFAULT 'parent'::text CHECK (family_role = ANY (ARRAY['parent'::text, 'kid'::text, 'admin'::text])),
  onboarding_completed boolean NOT NULL DEFAULT false,
  terms_accepted boolean NOT NULL DEFAULT false,
  terms_accepted_at timestamp with time zone,
  terms_version text DEFAULT '1.0'::text,
  ai_consent_accepted boolean NOT NULL DEFAULT false,
  ai_consent_accepted_at timestamp with time zone,
  ai_consent_version text DEFAULT '1.0'::text,
  notification_enabled boolean DEFAULT true,
  location_sharing_enabled boolean DEFAULT false,
  quiet_hours_start text,
  quiet_hours_end text,
  is_admin boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE public.family_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'kid'::text CHECK (role = ANY (ARRAY['parent'::text, 'kid'::text])),
  emoji text,
  avatar_url text,
  pin text,
  pin_enabled boolean NOT NULL DEFAULT false,
  coins integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT family_members_pkey PRIMARY KEY (id),
  CONSTRAINT family_members_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.notification_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  dedup_key text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notification_logs_pkey PRIMARY KEY (id),
  CONSTRAINT notification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.push_tokens (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE,
  tier text NOT NULL DEFAULT 'free'::text CHECK (tier = ANY (ARRAY['free'::text, 'pro'::text, 'ultimate'::text])),
  rc_customer_id text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

CREATE TABLE public.app_config (
  key text NOT NULL,
  value text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_config_pkey PRIMARY KEY (key)
);

CREATE TABLE public.grocery_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  family_id text NOT NULL,
  name text NOT NULL,
  store text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'done'::text])),
  shopper_id text,
  linked_event_id uuid,
  linked_quest_id uuid,
  linked_channel_id text,
  planned_at date,
  completed_at timestamp with time zone,
  created_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grocery_runs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grocery_run_items (
  run_id uuid NOT NULL,
  item_id text NOT NULL,
  checked_in_run boolean NOT NULL DEFAULT false,
  checked_by text,
  checked_at timestamp with time zone,
  CONSTRAINT grocery_run_items_pkey PRIMARY KEY (run_id, item_id),
  CONSTRAINT grocery_run_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.grocery_runs(id)
);
