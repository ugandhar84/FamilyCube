-- ═══════════════════════════════════════════════════════════════════════════════
-- CHAT SCHEMA v2 — Comprehensive modern-app schema
-- Adds: threads, read receipts, call sessions, polls, scheduled messages,
--       link previews, contact cards, disappearing messages, channel settings,
--       rich message types, and per-channel permissions.
-- All changes are additive (IF NOT EXISTS / IF NOT EXISTS columns).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. chat_channels — enrich ───────────────────────────────────────────────

ALTER TABLE chat_channels
  -- Channel identity
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS avatar_url        text,
  ADD COLUMN IF NOT EXISTS family_id         text,          -- scopes channel to a family
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz    DEFAULT now(),

  -- Last-message cache (avoids expensive join for channel list)
  ADD COLUMN IF NOT EXISTS last_message_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_sender_id text,

  -- Per-member state stored as jsonb maps  { memberId: true/timestamp }
  ADD COLUMN IF NOT EXISTS muted_by          jsonb          DEFAULT '{}',   -- { id: true }
  ADD COLUMN IF NOT EXISTS archived_by       jsonb          DEFAULT '{}',   -- { id: true }
  ADD COLUMN IF NOT EXISTS pinned_by         jsonb          DEFAULT '{}',   -- { id: true }

  -- Membership roles  { memberId: "admin"|"moderator"|"member" }
  ADD COLUMN IF NOT EXISTS member_roles      jsonb          DEFAULT '{}',

  -- Access control
  ADD COLUMN IF NOT EXISTS max_members       int,
  ADD COLUMN IF NOT EXISTS invite_code       text,          -- shareable invite code
  ADD COLUMN IF NOT EXISTS is_read_only      boolean        DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived       boolean        DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,

  -- Flexible per-channel settings (slow-mode, retention, allowed media types …)
  ADD COLUMN IF NOT EXISTS settings          jsonb          DEFAULT '{}',

  -- Permissions blueprint  { "send_media": ["admin","member"], … }
  ADD COLUMN IF NOT EXISTS permissions       jsonb          DEFAULT '{}',

  -- Encryption
  ADD COLUMN IF NOT EXISTS channel_key_id    text;          -- references a key in vault (future)


-- ─── 2. chat_messages — enrich ───────────────────────────────────────────────

ALTER TABLE chat_messages
  -- Canonical ciphertext column (some rows use "text", some used "ciphertext")
  ADD COLUMN IF NOT EXISTS ciphertext        text,

  -- Soft delete (preserves thread context; client shows "Message deleted")
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by        text,

  -- Threads (a message can start a thread; replies reference parent)
  ADD COLUMN IF NOT EXISTS thread_parent_id  text,          -- parent message id
  ADD COLUMN IF NOT EXISTS thread_reply_count int           DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thread_last_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS thread_preview    text,          -- latest reply snippet

  -- Forwarded messages
  ADD COLUMN IF NOT EXISTS is_forwarded      boolean        DEFAULT false,
  ADD COLUMN IF NOT EXISTS forwarded_from_id text,          -- original message id
  ADD COLUMN IF NOT EXISTS forwarded_from_channel_id text,

  -- Disappearing / ephemeral
  ADD COLUMN IF NOT EXISTS disappears_at     timestamptz,   -- null = never

  -- Scheduling
  ADD COLUMN IF NOT EXISTS scheduled_at      timestamptz,   -- null = send immediately
  ADD COLUMN IF NOT EXISTS sent_at           timestamptz,   -- actual send time

  -- Read / delivery receipts (lightweight denorm: full detail in chat_read_receipts)
  ADD COLUMN IF NOT EXISTS delivered_to      jsonb          DEFAULT '{}',  -- { memberId: iso }
  ADD COLUMN IF NOT EXISTS read_by           jsonb          DEFAULT '{}',  -- { memberId: iso }

  -- Mentions (fast server-side lookup; duplicates data in text body)
  ADD COLUMN IF NOT EXISTS mentioned_ids     text[]         DEFAULT '{}',

  -- Silent push (user won't get a push, but message still lands)
  ADD COLUMN IF NOT EXISTS is_silent         boolean        DEFAULT false,

  -- System messages (member joined, call ended, quest completed, etc.)
  ADD COLUMN IF NOT EXISTS is_system         boolean        DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_event      jsonb,         -- { type, payload }

  -- Rich content
  ADD COLUMN IF NOT EXISTS sticker_url       text,
  ADD COLUMN IF NOT EXISTS gif_url           text,
  ADD COLUMN IF NOT EXISTS link_preview      jsonb,         -- { url, title, desc, image_url, site_name }
  ADD COLUMN IF NOT EXISTS contact_card      jsonb,         -- { name, phone, email, avatar_url }
  ADD COLUMN IF NOT EXISTS poll_id           text,          -- FK → chat_polls
  ADD COLUMN IF NOT EXISTS call_session_id   text,          -- FK → call_sessions (for call-start msgs)

  -- Pinned (stored redundantly for fast single-row lookup)
  ADD COLUMN IF NOT EXISTS pinned_at         timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by         text,

  -- Star / bookmark (per-message, per-user stored in chat_bookmarks)
  ADD COLUMN IF NOT EXISTS star_count        int            DEFAULT 0,

  -- Media extras (supplement existing image_url / media_url)
  ADD COLUMN IF NOT EXISTS media_width       int,
  ADD COLUMN IF NOT EXISTS media_height      int,
  ADD COLUMN IF NOT EXISTS media_size_bytes  bigint,
  ADD COLUMN IF NOT EXISTS media_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS media_duration_ms  int,          -- video/audio in ms

  -- Voice note (consolidates voice_duration + duration_sec)
  ADD COLUMN IF NOT EXISTS voice_url         text,
  ADD COLUMN IF NOT EXISTS voice_waveform    int[]          DEFAULT '{}',  -- amplitude bars

  -- Translation cache  { "es": "Hola", "fr": "Bonjour" }
  ADD COLUMN IF NOT EXISTS translations      jsonb          DEFAULT '{}',

  -- AI / moderation
  ADD COLUMN IF NOT EXISTS is_flagged        boolean        DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason       text,
  ADD COLUMN IF NOT EXISTS ai_summary        text;          -- for long voice/video


-- ─── 3. call_sessions — audio & video calls ──────────────────────────────────

CREATE TABLE IF NOT EXISTS call_sessions (
  id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel_id       text        NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  family_id        text,

  -- Who started it
  initiated_by     text        NOT NULL,

  -- 'audio' | 'video' | 'screen_share' | 'group_audio' | 'group_video'
  call_type        text        NOT NULL DEFAULT 'audio',

  -- 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'busy' | 'failed'
  status           text        NOT NULL DEFAULT 'ringing',

  -- Timestamps
  created_at       timestamptz NOT NULL DEFAULT now(),
  ringing_at       timestamptz,
  answered_at      timestamptz,       -- first participant joined
  ended_at         timestamptz,
  duration_sec     int,               -- computed on end

  -- Who ended it and why
  ended_by         text,
  -- 'hangup' | 'no_answer' | 'declined' | 'network_error' | 'timeout' | 'busy'
  end_reason       text,

  -- Participants — array of { memberId, status, joinedAt, leftAt, isMuted, isVideoOff, isScreenSharing }
  participants     jsonb       NOT NULL DEFAULT '[]',

  -- WebRTC / TURN
  room_id          text,              -- e.g. Livekit / Agora / Daily room id
  room_token       text,              -- server-generated JWT for room
  ice_servers      jsonb,             -- TURN/STUN server list (expires per session)

  -- Recording
  recording_url    text,
  recording_expires_at timestamptz,

  -- The system chat message that announced the call
  announcement_message_id text,

  -- Extra metadata (codec, quality stats, etc.)
  meta             jsonb       DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS call_sessions_channel_id_idx ON call_sessions(channel_id);
CREATE INDEX IF NOT EXISTS call_sessions_status_idx     ON call_sessions(status);
CREATE INDEX IF NOT EXISTS call_sessions_created_at_idx ON call_sessions(created_at DESC);


-- ─── 4. chat_read_receipts — per-message, per-member ─────────────────────────
-- Separate table keeps chat_messages lean; query when opening message detail.

CREATE TABLE IF NOT EXISTS chat_read_receipts (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id  text        NOT NULL,
  channel_id  text        NOT NULL,
  member_id   text        NOT NULL,
  read_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, member_id)
);

CREATE INDEX IF NOT EXISTS read_receipts_message_idx ON chat_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS read_receipts_member_idx  ON chat_read_receipts(member_id);
CREATE INDEX IF NOT EXISTS read_receipts_channel_idx ON chat_read_receipts(channel_id);


-- ─── 5. chat_polls ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_polls (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel_id      text        NOT NULL,
  message_id      text,                   -- the message that contains this poll
  created_by      text        NOT NULL,
  question        text        NOT NULL,

  -- Options: [{ id, text, votes: [memberId] }]
  options         jsonb       NOT NULL DEFAULT '[]',

  is_multiple_choice boolean  NOT NULL DEFAULT false,
  is_anonymous    boolean     NOT NULL DEFAULT false,
  is_closed       boolean     NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  closed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS chat_polls_channel_idx ON chat_polls(channel_id);


-- ─── 6. chat_scheduled_messages ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_scheduled_messages (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel_id      text        NOT NULL,
  sender_id       text        NOT NULL,
  text            text,
  ciphertext      text,
  media_url       text,
  media_type      text,
  location_pin    jsonb,
  document_url    text,
  document_name   text,
  reply_to        jsonb,

  scheduled_at    timestamptz NOT NULL,
  sent_at         timestamptz,           -- set when actually sent
  cancelled_at    timestamptz,

  -- 'pending' | 'sent' | 'cancelled' | 'failed'
  status          text        NOT NULL DEFAULT 'pending',

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_messages_channel_idx  ON chat_scheduled_messages(channel_id);
CREATE INDEX IF NOT EXISTS scheduled_messages_status_idx   ON chat_scheduled_messages(status, scheduled_at);


-- ─── 7. chat_bookmarks — starred messages per member ─────────────────────────

CREATE TABLE IF NOT EXISTS chat_bookmarks (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id  text        NOT NULL,
  channel_id  text        NOT NULL,
  member_id   text        NOT NULL,
  note        text,                       -- personal note on the bookmark
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, member_id)
);

CREATE INDEX IF NOT EXISTS chat_bookmarks_member_idx  ON chat_bookmarks(member_id);
CREATE INDEX IF NOT EXISTS chat_bookmarks_channel_idx ON chat_bookmarks(channel_id);


-- ─── 8. chat_reactions_detail — per-reaction analytics ───────────────────────
-- Lightweight supplement to the jsonb reactions column.

CREATE TABLE IF NOT EXISTS chat_reactions_detail (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message_id  text        NOT NULL,
  channel_id  text        NOT NULL,
  member_id   text        NOT NULL,
  emoji       text        NOT NULL,
  reacted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS reactions_detail_message_idx ON chat_reactions_detail(message_id);


-- ─── 9. chat_typing — ephemeral typing indicators ────────────────────────────
-- Rows auto-expire; realtime subscription drives "X is typing…" UI.

CREATE TABLE IF NOT EXISTS chat_typing (
  channel_id  text        NOT NULL,
  member_id   text        NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '5 seconds'),
  PRIMARY KEY (channel_id, member_id)
);

CREATE INDEX IF NOT EXISTS chat_typing_channel_idx ON chat_typing(channel_id);
CREATE INDEX IF NOT EXISTS chat_typing_expires_idx ON chat_typing(expires_at);


-- ─── 10. chat_presence — online/away/offline per channel ─────────────────────

CREATE TABLE IF NOT EXISTS chat_presence (
  member_id       text        PRIMARY KEY,
  status          text        NOT NULL DEFAULT 'offline',  -- 'online'|'away'|'offline'
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  active_channel  text,
  device_type     text,        -- 'ios'|'android'|'web'
  push_token      text
);


-- ─── 11. Useful indexes on existing chat_messages ────────────────────────────

CREATE INDEX IF NOT EXISTS chat_messages_channel_id_created_at_idx
  ON chat_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_thread_parent_idx
  ON chat_messages(thread_parent_id)
  WHERE thread_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_disappears_idx
  ON chat_messages(disappears_at)
  WHERE disappears_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_scheduled_idx
  ON chat_messages(scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_poll_id_idx
  ON chat_messages(poll_id)
  WHERE poll_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_call_session_idx
  ON chat_messages(call_session_id)
  WHERE call_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_mentioned_ids_idx
  ON chat_messages USING GIN(mentioned_ids);


-- ─── 12. Enable Realtime for new tables ──────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_typing;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_read_receipts;
