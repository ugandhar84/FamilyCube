/**
 * chatStore — Supabase-backed chat with:
 *  - AES-256-GCM E2E encryption (ciphertext stored; plaintext only in memory)
 *  - Blind-index search (HMAC-SHA256 word hashes → server-side array overlap)
 *  - Cursor-based pagination (100 msgs on load, 50 per older page)
 *  - Supabase Realtime subscription per channel
 *  - AsyncStorage write-ahead cache for offline compose queue
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  encryptMessage, decryptMessage,
  buildBlindIndex, hashQuery,
} from '@/lib/chatCrypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;          // always plaintext in memory
  timestamp: string;     // ISO
  reactions?: Record<string, string[]>;
  imageUri?: string;
  mediaType?: 'image' | 'video';
  replyTo?: { id: string; senderId: string; text: string };
  edited?: boolean;
  // Voice note
  voiceUri?: string;
  voiceDuration?: number; // seconds
  // Location pin
  locationPin?: { address: string; lat: number; lng: number };
  // Document attachment
  documentUri?: string;
  documentName?: string;
  // Structured card payload (e.g. a shared meal/event/quest from Ask Cube)
  // — rendered as a read-only card instead of the plain text bubble.
  // Plaintext, unlike `text`, since it's app-rendered structured data, not
  // free-form prose that needs E2E encryption.
  systemEvent?: { type: string; payload: Record<string, any> };
  // Set by the async AI moderation pass (moderate-message edge function),
  // never by the client directly. Parent-only UI shows a small indicator —
  // the message itself stays visible to everyone as sent.
  moderationFlag?: { severity: string; reason: string; flagged_at: string };
}

// DB row shape — "text" column stores AES-256-GCM ciphertext
interface DBRow {
  id: string;
  channel_id: string;
  sender_id: string;
  text: string;           // ciphertext stored here
  ciphertext?: string;    // older rows may use this name
  blind_index: string[];
  image_url: string | null;
  media_type: string | null;
  reply_to: { id: string; senderId: string; text: string } | null;
  edited: boolean;
  reactions: Record<string, string[]>;
  created_at: string;
  duration_sec?: number | null;
  voice_duration?: number | null;
  voice_url?: string | null;
  location_pin?: { address: string; lat: number; lng: number } | null;
  document_url?: string | null;
  document_name?: string | null;
  system_event?: { type: string; payload: Record<string, any> } | null;
  moderation_flag?: { severity: string; reason: string; flagged_at: string } | null;
}

const PAGE_SIZE    = 100;
const OLDER_SIZE   = 50;
const OFFLINE_KEY  = '@familycube_chat_offline_v1';

async function rowToMessage(row: DBRow): Promise<ChatMessage> {
  const cipher = row.ciphertext ?? row.text ?? '';
  return {
    id:            row.id,
    senderId:      row.sender_id,
    text:          await decryptMessage(cipher),
    timestamp:     row.created_at,
    reactions:     row.reactions ?? {},
    imageUri:      row.image_url ?? undefined,
    mediaType:     (row.media_type as 'image' | 'video') ?? undefined,
    replyTo:       row.reply_to ?? undefined,
    edited:        row.edited,
    voiceDuration: row.duration_sec ?? row.voice_duration ?? undefined,
    voiceUri:      row.voice_url ?? undefined,
    locationPin:   row.location_pin ?? undefined,
    documentUri:   row.document_url ?? undefined,
    documentName:  row.document_name ?? undefined,
    systemEvent:   row.system_event ?? undefined,
    moderationFlag: row.moderation_flag ?? undefined,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface ChannelState {
  messages:    ChatMessage[];
  hasMore:     boolean;   // older messages available
  oldestTs:    string | null;
  loading:     boolean;
  searchResults: ChatMessage[] | null;  // null = not in search mode
  searching:   boolean;
}

interface ChatState {
  channels: Record<string, ChannelState>;
  // subscriptions: channelId → Supabase subscription handle
  _subs: Record<string, any>;
  // Latest message ISO timestamp per channel, keyed by channel_id — used to
  // auto-sort the channel strip by recent activity without having to
  // loadChannel() (and pull full message history) for every tab up front.
  lastActivity: Record<string, string>;
  // messageId → memberIds who have read it — drives the small avatar stack
  // under a group message. Only populated for messages actually loaded
  // (i.e. the currently-open channel), not globally.
  readReceipts: Record<string, string[]>;
  // channelId → count of messages from others sent after my last-read cursor
  // — cheap O(1) lookup per channel via chat_channel_reads, used for the
  // unread badge on each tab without loading that channel's messages.
  unreadCounts: Record<string, number>;

  channelState: (id: string) => ChannelState;

  loadChannel:  (channelId: string) => Promise<void>;
  loadOlder:    (channelId: string) => Promise<void>;
  unsubscribe:  (channelId: string) => void;
  loadLastActivity: (channelIds: string[]) => Promise<void>;
  loadUnreadCounts: (channelIds: string[], memberId: string) => Promise<void>;
  markChannelRead:  (channelId: string, memberId: string) => Promise<void>;
  loadReadReceipts: (channelId: string, messageIds: string[]) => Promise<void>;
  markMessagesRead: (channelId: string, messageIds: string[], memberId: string) => Promise<void>;

  sendMessage: (
    channelId: string, senderId: string, text: string,
    imageUri?: string, mediaType?: 'image' | 'video',
    replyTo?: ChatMessage,
    voiceDuration?: number,
    locationPin?: { address: string; lat: number; lng: number },
    voiceUri?: string,
    documentUri?: string, documentName?: string,
    systemEvent?: { type: string; payload: Record<string, any> },
  ) => Promise<void>;

  addReaction:   (channelId: string, messageId: string, emoji: string, memberId: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;

  search:        (channelId: string, query: string) => Promise<void>;
  clearSearch:   (channelId: string) => void;

  // Internal: called by realtime handler
  _upsertMessage: (channelId: string, msg: ChatMessage) => void;
  _removeMessage: (channelId: string, msgId: string) => void;
}

// ─── Default channel state ────────────────────────────────────────────────────

function emptyChannel(): ChannelState {
  return { messages: [], hasMore: false, oldestTs: null, loading: false, searchResults: null, searching: false };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  channels: {},
  _subs:    {},
  lastActivity: {},
  readReceipts: {},
  unreadCounts: {},

  channelState: (id) => get().channels[id] ?? emptyChannel(),

  // One cheap query for the latest message timestamp per channel — reads
  // chat_channels.last_message_at (kept live by the touch_chat_channel_
  // last_message trigger) instead of scanning chat_messages, so this stays
  // fast regardless of how much history a channel has accumulated.
  loadLastActivity: async (channelIds) => {
    if (channelIds.length === 0) return;
    const { data, error } = await supabase
      .from('chat_channels')
      .select('id, last_message_at')
      .in('id', channelIds);
    if (error || !data) return;
    const latest: Record<string, string> = {};
    for (const row of data as { id: string; last_message_at: string | null }[]) {
      if (row.last_message_at) latest[row.id] = row.last_message_at;
    }
    set(s => ({ lastActivity: { ...s.lastActivity, ...latest } }));
  },

  // O(1) per channel: count messages sent by someone else after my
  // chat_channel_reads cursor for that channel (no cursor row = never read,
  // so everything from others counts as unread).
  loadUnreadCounts: async (channelIds, memberId) => {
    if (channelIds.length === 0) return;
    const { data: cursors } = await supabase
      .from('chat_channel_reads')
      .select('channel_id, last_read_at')
      .eq('member_id', memberId)
      .in('channel_id', channelIds);
    const cursorMap = Object.fromEntries((cursors ?? []).map((c: any) => [c.channel_id, c.last_read_at]));

    const counts = await Promise.all(channelIds.map(async (id) => {
      let query = supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', id)
        .neq('sender_id', memberId);
      if (cursorMap[id]) query = query.gt('created_at', cursorMap[id]);
      const { count } = await query;
      return [id, count ?? 0] as const;
    }));
    set(s => ({ unreadCounts: { ...s.unreadCounts, ...Object.fromEntries(counts) } }));
  },

  // Bumps the read cursor to now and zeroes the badge locally — called when
  // a channel is opened/viewed.
  markChannelRead: async (channelId, memberId) => {
    set(s => ({ unreadCounts: { ...s.unreadCounts, [channelId]: 0 } }));
    await supabase.from('chat_channel_reads')
      .upsert({ channel_id: channelId, member_id: memberId, last_read_at: new Date().toISOString() },
        { onConflict: 'channel_id,member_id' });
  },

  // Per-message read-receipt rows for the messages currently on screen —
  // drives the avatar stack under a group message. Also inserts a receipt
  // for the viewer's own read of each message (upsert, so re-viewing is
  // idempotent).
  loadReadReceipts: async (channelId, messageIds) => {
    if (messageIds.length === 0) return;
    const { data } = await supabase
      .from('chat_read_receipts')
      .select('message_id, member_id')
      .in('message_id', messageIds);
    if (!data) return;
    set(s => {
      const next = { ...s.readReceipts };
      for (const row of data as { message_id: string; member_id: string }[]) {
        next[row.message_id] = [...new Set([...(next[row.message_id] ?? []), row.member_id])];
      }
      return { readReceipts: next };
    });
  },

  // Writes a read-receipt row for each message not sent by me (upsert —
  // (message_id, member_id) is unique, so re-viewing is a no-op). Called
  // when messages actually render on screen, not just when a channel opens,
  // so a message that arrives while the channel is open still gets marked.
  markMessagesRead: async (channelId, messageIds, memberId) => {
    if (messageIds.length === 0) return;
    const now = new Date().toISOString();
    set(s => {
      const next = { ...s.readReceipts };
      for (const id of messageIds) {
        next[id] = [...new Set([...(next[id] ?? []), memberId])];
      }
      return { readReceipts: next };
    });
    const rows = messageIds.map(id => ({ message_id: id, channel_id: channelId, member_id: memberId, read_at: now }));
    await supabase.from('chat_read_receipts').upsert(rows, { onConflict: 'message_id,member_id' });
  },

  // ── Load latest page + subscribe ──────────────────────────────────────────

  loadChannel: async (channelId) => {
    const current = get().channels[channelId];
    // Already subscribed — skip entirely (re-renders must not re-subscribe)
    if (get()._subs[channelId]) return;
    if (current?.loading) return;

    set(s => ({ channels: { ...s.channels, [channelId]: { ...(s.channels[channelId] ?? emptyChannel()), loading: true } } }));

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;

      const rows   = (data ?? []) as DBRow[];
      const msgs   = await Promise.all(rows.map(rowToMessage));
      msgs.reverse(); // oldest first for display

      const hasMore   = rows.length === PAGE_SIZE;
      const oldestTs  = rows.length ? rows[rows.length - 1].created_at : null; // rows DESC so last = oldest

      set(s => ({
        channels: {
          ...s.channels,
          [channelId]: { ...(s.channels[channelId] ?? emptyChannel()), messages: msgs, hasMore, oldestTs, loading: false },
        },
      }));

      // Subscribe to new messages on this channel
      if (!get()._subs[channelId]) {
        const sub = supabase
          .channel(`chat:${channelId}`)
          .on('postgres_changes', {
            event:  '*',
            schema: 'public',
            table:  'chat_messages',
            filter: `channel_id=eq.${channelId}`,
          }, async (payload) => {
            if (payload.eventType === 'INSERT') {
              console.log('[chatStore] realtime INSERT raw payload.new:', JSON.stringify(payload.new));
              const msg = await rowToMessage(payload.new as DBRow);
              console.log('[chatStore] realtime INSERT msg voiceUri:', msg.voiceUri, 'voiceDuration:', msg.voiceDuration);
              // If the schema cache hasn't refreshed voice_url yet, preserve the
              // voiceUri from the optimistic message already in state
              if (!msg.voiceUri) {
                const existing = get().channels[channelId]?.messages.find(m => m.id === msg.id);
                console.log('[chatStore] existing optimistic voiceUri:', existing?.voiceUri);
                if (existing?.voiceUri) msg.voiceUri = existing.voiceUri;
              }
              get()._upsertMessage(channelId, msg);
            }
            if (payload.eventType === 'UPDATE') {
              const msg = await rowToMessage(payload.new as DBRow);
              if (!msg.voiceUri) {
                const existing = get().channels[channelId]?.messages.find(m => m.id === msg.id);
                if (existing?.voiceUri) msg.voiceUri = existing.voiceUri;
              }
              get()._upsertMessage(channelId, msg);
            }
            if (payload.eventType === 'DELETE') {
              get()._removeMessage(channelId, (payload.old as DBRow).id);
            }
          })
          .subscribe();

        set(s => ({ _subs: { ...s._subs, [channelId]: sub } }));
      }
    } catch (err) {
      console.warn('[chatStore] loadChannel error', err);
      set(s => ({ channels: { ...s.channels, [channelId]: { ...(s.channels[channelId] ?? emptyChannel()), loading: false } } }));
    }
  },

  // ── Load older page (infinite scroll up) ─────────────────────────────────

  loadOlder: async (channelId) => {
    const ch = get().channels[channelId];
    if (!ch || !ch.hasMore || ch.loading || !ch.oldestTs) return;

    set(s => ({ channels: { ...s.channels, [channelId]: { ...ch, loading: true } } }));

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .lt('created_at', ch.oldestTs)
        .order('created_at', { ascending: false })
        .limit(OLDER_SIZE);

      if (error) throw error;

      const rows     = (data ?? []) as DBRow[];
      const older    = await Promise.all(rows.map(rowToMessage));
      older.reverse();

      const hasMore  = rows.length === OLDER_SIZE;
      const oldestTs = rows.length ? rows[rows.length - 1].created_at : ch.oldestTs;

      set(s => {
        const existing = s.channels[channelId]?.messages ?? [];
        return {
          channels: {
            ...s.channels,
            [channelId]: { ...s.channels[channelId], messages: [...older, ...existing], hasMore, oldestTs, loading: false },
          },
        };
      });
    } catch (err) {
      console.warn('[chatStore] loadOlder error', err);
      set(s => ({ channels: { ...s.channels, [channelId]: { ...s.channels[channelId], loading: false } } }));
    }
  },

  // ── Unsubscribe ───────────────────────────────────────────────────────────

  unsubscribe: (channelId) => {
    const sub = get()._subs[channelId];
    if (sub) { supabase.removeChannel(sub); }
    set(s => { const subs = { ...s._subs }; delete subs[channelId]; return { _subs: subs }; });
  },

  // ── Send ──────────────────────────────────────────────────────────────────

  sendMessage: async (channelId, senderId, text, imageUri, mediaType, replyTo, voiceDuration, locationPin, voiceUri, documentUri, documentName, systemEvent) => {
    const ciphertext   = await encryptMessage(text);
    const blind_index  = await buildBlindIndex(text);

    // Generate UUID client-side — don't rely on DB default in case column was added later
    const msgId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    // Optimistic update — show immediately in UI
    const optimistic: ChatMessage = {
      id:        msgId,
      senderId,
      text,
      timestamp: new Date().toISOString(),
      imageUri,
      mediaType,
      replyTo:      replyTo ? { id: replyTo.id, senderId: replyTo.senderId, text: replyTo.text } : undefined,
      voiceDuration,
      voiceUri,
      locationPin,
      documentUri,
      documentName,
      systemEvent,
    };
    get()._upsertMessage(channelId, optimistic);

    try {
      const now = new Date().toISOString();
      const row: Record<string, any> = {
        id:          msgId,
        channel_id:  channelId,
        sender_id:   senderId,
        text:        ciphertext,
        blind_index,
        timestamp:   now,
        created_at:  now,
        image_url:   imageUri ?? null,
        media_type:  mediaType ?? null,
        reply_to:    replyTo ? { id: replyTo.id, senderId: replyTo.senderId, text: replyTo.text } : null,
        duration_sec: voiceDuration != null ? Math.round(voiceDuration) : null,
        location_pin: locationPin ?? null,
        document_url:  documentUri ?? null,
        document_name: documentName ?? null,
        system_event:  systemEvent ?? null,
        is_system:     !!systemEvent,
        // voice_url omitted from initial insert — added via background update after upload
      };
      const { error } = await supabase.from('chat_messages').insert(row);
      if (error) throw error;
      // Fire mention-notify if message contains @mentions
      const mentions = [...(text ?? '').matchAll(/@(\w+)/g)].map(m => m[1]);
      if (mentions.length > 0) {
        supabase.functions
          .invoke('mention-notify', { body: { messageId: msgId, channelId, senderId, text, mentions } })
          .catch(e => console.warn('[chatStore] mention-notify failed:', e?.message));
      }
      // Layer 2 moderation — fire-and-forget, runs AFTER the message is
      // already visible; only ever adds a parent-only flag, never blocks
      // or removes anything. Plain text messages only (a system_event card
      // or voice/image-only message has no prose to judge).
      if (text?.trim() && !systemEvent) {
        supabase.functions
          .invoke('moderate-message', { body: { table: 'chat_messages', messageId: msgId, text } })
          .catch(e => console.warn('[chatStore] moderate-message failed:', e?.message));
      }
      // Realtime subscription will deliver the real row and upsert it (replacing optimistic)
    } catch (err) {
      // Remove optimistic message on failure
      get()._removeMessage(channelId, optimistic.id);
      // Queue for offline retry
      const offline = JSON.parse(await AsyncStorage.getItem(OFFLINE_KEY) ?? '[]');
      offline.push({ channelId, senderId, ciphertext, blind_index, imageUri, mediaType });
      await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(offline));
      console.warn('[chatStore] send failed, queued offline', err);
    }
  },

  // ── Reactions ─────────────────────────────────────────────────────────────

  addReaction: async (channelId, messageId, emoji, memberId) => {
    const ch  = get().channels[channelId];
    const msg = ch?.messages.find(m => m.id === messageId);
    if (!msg) return;

    const reactions = { ...(msg.reactions ?? {}) };
    const ids       = reactions[emoji] ?? [];
    reactions[emoji] = ids.includes(memberId) ? ids.filter(id => id !== memberId) : [...ids, memberId];
    if (reactions[emoji].length === 0) delete reactions[emoji];

    // Optimistic
    get()._upsertMessage(channelId, { ...msg, reactions });

    const { error } = await supabase
      .from('chat_messages')
      .update({ reactions })
      .eq('id', messageId);
    if (error) console.warn('[chatStore] addReaction error', error);
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  deleteMessage: async (channelId, messageId) => {
    get()._removeMessage(channelId, messageId);
    const { error } = await supabase.from('chat_messages').delete().eq('id', messageId);
    if (error) console.warn('[chatStore] deleteMessage error', error);
  },

  // ── Blind-index search ────────────────────────────────────────────────────

  search: async (channelId, query) => {
    if (!query.trim()) { get().clearSearch(channelId); return; }

    set(s => ({ channels: { ...s.channels, [channelId]: { ...(s.channels[channelId] ?? emptyChannel()), searching: true, searchResults: null } } }));

    try {
      const hashes = await hashQuery(query);
      if (!hashes.length) { get().clearSearch(channelId); return; }

      // Server does array overlap: WHERE blind_index && ARRAY[hash1, hash2, ...]
      // This is a PostgreSQL `&&` operator — any hash matches.
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .overlaps('blind_index', hashes)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const rows    = (data ?? []) as DBRow[];
      const results = await Promise.all(rows.map(rowToMessage));
      results.reverse();

      set(s => ({
        channels: {
          ...s.channels,
          [channelId]: { ...(s.channels[channelId] ?? emptyChannel()), searching: false, searchResults: results },
        },
      }));
    } catch (err) {
      console.warn('[chatStore] search error', err);
      set(s => ({
        channels: {
          ...s.channels,
          [channelId]: { ...(s.channels[channelId] ?? emptyChannel()), searching: false, searchResults: [] },
        },
      }));
    }
  },

  clearSearch: (channelId) => {
    set(s => ({
      channels: {
        ...s.channels,
        [channelId]: { ...(s.channels[channelId] ?? emptyChannel()), searchResults: null, searching: false },
      },
    }));
  },

  // ── Internal helpers ──────────────────────────────────────────────────────

  _upsertMessage: (channelId, msg) => {
    set(s => {
      const ch   = s.channels[channelId] ?? emptyChannel();
      const msgs = ch.messages.filter(m => m.id !== msg.id);
      // Insert in timestamp order
      const idx  = msgs.findIndex(m => m.timestamp > msg.timestamp);
      if (idx === -1) msgs.push(msg); else msgs.splice(idx, 0, msg);
      const prevLatest = s.lastActivity[channelId];
      const lastActivity = (!prevLatest || msg.timestamp > prevLatest)
        ? { ...s.lastActivity, [channelId]: msg.timestamp } : s.lastActivity;
      return { channels: { ...s.channels, [channelId]: { ...ch, messages: msgs } }, lastActivity };
    });
  },

  _removeMessage: (channelId, msgId) => {
    set(s => {
      const ch   = s.channels[channelId] ?? emptyChannel();
      const msgs = ch.messages.filter(m => m.id !== msgId);
      return { channels: { ...s.channels, [channelId]: { ...ch, messages: msgs } } };
    });
  },
}));

// Legacy compatibility — kept so any import that still calls loadFromStorage doesn't crash
export const legacyLoadFromStorage = async () => {};
