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
  getDeviceId, encryptForDevices, decryptFromDevice,
} from '@/lib/chatCrypto';
import { ensureDeviceRegistered, getFamilyDeviceDirectory } from '@/lib/deviceRegistry';
import { isFeatureEnabled } from '@/lib/featureFlags';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;          // always plaintext in memory
  timestamp: string;     // ISO
  reactions?: Record<string, string[]>;
  imageUri?: string;
  mediaType?: 'image' | 'video';
  // `kind` distinguishes what the quoted message actually was when its own
  // `text` is empty — previously the reply-quote preview hardcoded every
  // empty-text quote as "🎙️ Voice note" regardless of whether the original
  // was a voice note, image, video, document, or location pin.
  replyTo?: { id: string; senderId: string; text: string; kind?: 'voice' | 'image' | 'video' | 'document' | 'location' };
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
  // 'failed' — sendMessage's write (network drop, RLS error, etc.) threw.
  // Was silently removed from the message list on failure (get()._removeMessage)
  // with the only recovery being an invisible background retry the next time
  // flushOfflineQueue happened to run — the user had no way to tell the send
  // ever failed, or to retry it themselves on demand. Now stays visible with
  // a retry affordance instead of vanishing. Undefined/omitted = sent normally.
  status?: 'failed';
  // Captured only on a failed send — everything retryMessage needs to
  // re-attempt the exact same send without the caller having to keep its
  // own copy of every argument around just in case it fails.
  _retryArgs?: {
    channelId: string; senderId: string; text: string;
    imageUri?: string; mediaType?: 'image' | 'video';
    replyTo?: ChatMessage; voiceDuration?: number;
    locationPin?: { address: string; lat: number; lng: number };
    voiceUri?: string; documentUri?: string; documentName?: string;
    systemEvent?: { type: string; payload: Record<string, any> };
  };
}

// DB row shape — "text" column stores AES-256-GCM ciphertext
interface DBRow {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_device_id?: string | null;
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

// Global unread-badge subscription state — see ensureGlobalUnreadSubscription.
let _globalUnreadSub: ReturnType<typeof supabase.channel> | null = null;
let _globalUnreadMemberId: string | null = null;
let _openChannelId: string | null = null;

// ─── DM channel-id fix (critical privacy bug) ──────────────────────────────
// A DM "channel" was previously keyed by ONLY the other party's member id
// (e.g. sendMessage(priyaId, alexId, ...) wrote channel_id = priyaId) — that
// value is identical no matter who's the sender, so Alex's DM with Priya
// and Maya's DM with Priya collapsed into the SAME channel_id, meaning they
// were, in the database, literally the same conversation. Every family
// member with a DM to the same person shared one thread.
//
// dmChannelId() makes the id unique PER PAIR — both member ids, sorted so
// the value is identical regardless of which side computes it — instead of
// per-counterpart. ChatScreen.tsx's channel strip already calls this
// directly when building its DM tiles.
export function dmChannelId(idA: string, idB: string): string {
  return `dm_${[idA, idB].sort().join('_')}`;
}

// Reply-quote preview needs to know what an empty-text quoted message
// actually was — the quote card previously assumed any empty `text` meant
// a voice note, mislabeling replies to a quoted image/video/document/
// location pin the same way. Checked in attachment-type order so a message
// with more than one attachment field set still resolves to something
// sensible.
function deriveReplyKind(msg: ChatMessage): 'voice' | 'image' | 'video' | 'document' | 'location' | undefined {
  if (msg.voiceUri) return 'voice';
  if (msg.mediaType === 'video') return 'video';
  if (msg.imageUri) return 'image';
  if (msg.documentUri) return 'document';
  if (msg.locationPin) return 'location';
  return undefined;
}

// Fixed, non-DM channel ids — never rewritten, always used as-is. Matches
// every id literal in features/chat/components/constants.ts's
// GROUP_CHANNELS/buildGroupChannels.
const GROUP_CHANNEL_IDS = new Set(['all', 'parents', 'seniors_a', 'seniors_b', 'seniors_all']);

// The ~51 existing call sites across the app (choreStore, eventStore,
// kidRequestStore, etc.) all call sendMessage(recipientMemberId, senderId,
// ...) — the pre-existing, still-correct CALLING convention (pass who
// should receive it). What was broken is that this raw recipient id then
// got used AS the channel_id verbatim. Rather than rewrite every call site
// (and risk missing one, silently reintroducing the bug), sendMessage
// itself now normalizes: if the given channelId isn't a known fixed group
// channel and isn't already a dm_ composite id, treat it as "recipient id"
// and rewrite to the real pair-channel before writing anything.
function normalizeDmChannelId(channelId: string, senderId: string): string {
  if (GROUP_CHANNEL_IDS.has(channelId) || channelId.startsWith('dm_')) return channelId;
  if (!senderId || channelId === senderId) return channelId; // no pair to form
  return dmChannelId(channelId, senderId);
}

// chat_messages' own RLS (select/insert/update/delete) all require
// channel_id to already exist as a row in chat_channels, scoped to the
// caller's family_id — a message write/read with no matching chat_channels
// row is silently rejected. Existing DM rows in that table were created
// under the SAME broken per-counterpart id this whole fix corrects (e.g.
// id: 'm_...' = one specific member's id, confirmed via direct query — a
// pre-existing DM's chat_channels row belongs to whichever single sender's
// client happened to create it first), so a message under the new dm_
// composite id has no matching row and would otherwise fail RLS entirely.
// Ensures one exists — upsert so concurrent first-messages from both sides
// of a brand new DM don't race into a duplicate-key error.
const _ensuredDmChannels = new Set<string>();
async function ensureDmChannelRow(channelId: string, memberAId: string, memberBId: string): Promise<void> {
  if (!channelId.startsWith('dm_') || _ensuredDmChannels.has(channelId)) return;
  try {
    // Check-then-insert, not upsert(ignoreDuplicates) — confirmed via
    // direct testing that Supabase's upsert with ignoreDuplicates:true
    // (Prefer: resolution=ignore-duplicates) fails RLS's INSERT policy
    // even on a genuinely fresh row with zero conflict, while an
    // otherwise-identical plain insert succeeds. Same root cause already
    // fixed for ensureGroupChannelRow — applying the same pattern here.
    const { data: existing } = await supabase.from('chat_channels').select('id').eq('id', channelId).maybeSingle();
    if (existing) { _ensuredDmChannels.add(channelId); return; }

    const { useFamilyStore } = require('./familyStore');
    const members: any[] = useFamilyStore.getState().members;
    const memberA = members.find(m => m.id === memberAId);
    const memberB = members.find(m => m.id === memberBId);
    const familyId = memberA?.familyId ?? memberB?.familyId;
    if (!familyId) return;
    const { error } = await supabase.from('chat_channels').insert({
      id: channelId,
      family_id: familyId,
      type: 'direct',
      name: memberB?.name ?? memberA?.name ?? 'Direct Message',
      member_ids: [memberAId, memberBId],
      icon: '💬',
    });
    // A duplicate-key error means another device won the race and
    // created it between our SELECT and INSERT — not a real failure.
    if (error && error.code !== '23505') { console.warn('[chatStore] ensureDmChannelRow failed', error.message); return; }
    _ensuredDmChannels.add(channelId);
  } catch (e: any) {
    console.warn('[chatStore] ensureDmChannelRow failed', e?.message ?? e);
  }
}

// chat_channels never had rows for the fixed group channels ('all',
// 'parents', 'seniors_a', 'seniors_b', 'seniors_all') at all — unlike DMs,
// which at least had a (broken) row from the old scheme. Every existing
// send to a group channel was silently failing RLS
// (chat_messages_insert requires channel_id IN (SELECT id FROM
// chat_channels WHERE family_id = ...)), confirmed via direct query: none
// of these ids exist in chat_channels for any family. Visibility for these
// ids is computed server-side by is_chat_channel_participant() based on
// role, not a stored member_ids array (unlike DMs), so the row here only
// needs id/family_id/type/name to exist at all.
const GROUP_CHANNEL_NAMES: Record<string, string> = {
  all: '#all-family',
  parents: '#parents-vault',
  seniors_a: 'Grandparents',
  seniors_b: 'Grandparents',
  seniors_all: '#the-grand-squad',
};
const _ensuredGroupChannels = new Set<string>();
async function ensureGroupChannelRow(channelId: string, senderId: string): Promise<void> {
  if (!GROUP_CHANNEL_IDS.has(channelId) || _ensuredGroupChannels.has(channelId)) return;
  try {
    // Check-then-insert, not upsert(ignoreDuplicates) — an upsert's ON
    // CONFLICT DO NOTHING still evaluates the INSERT policy's WITH CHECK
    // on the attempted row before the conflict is resolved, so a plain
    // upsert kept failing RLS here even when the row already existed and
    // the "duplicate" would've been silently discarded anyway. Since
    // chat_channels.id for these fixed ids is a bare global string (not
    // scoped per-family), a SELECT-first check also avoids re-attempting
    // the INSERT at all once any device has already created the row.
    const { data: existing } = await supabase.from('chat_channels').select('id').eq('id', channelId).maybeSingle();
    if (existing) { _ensuredGroupChannels.add(channelId); return; }

    const { useFamilyStore } = require('./familyStore');
    const members: any[] = useFamilyStore.getState().members;
    const sender = members.find(m => m.id === senderId);
    const familyId = sender?.familyId;
    if (!familyId) return;
    const { error } = await supabase.from('chat_channels').insert({
      id: channelId,
      family_id: familyId,
      type: 'group',
      name: GROUP_CHANNEL_NAMES[channelId] ?? channelId,
      icon: '💬',
    });
    // A duplicate-key error here means another device won the race and
    // created it between our SELECT and INSERT — not a real failure.
    if (error && error.code !== '23505') { console.warn('[chatStore] ensureGroupChannelRow failed', error.message); return; }
    _ensuredGroupChannels.add(channelId);
  } catch (e: any) {
    console.warn('[chatStore] ensureGroupChannelRow failed', e?.message ?? e);
  }
}

// Device registration/directory lookup moved to lib/deviceRegistry.ts so
// lib/locationTracking.ts (location's own per-device envelope) can reuse
// the exact same logic instead of duplicating it. Entirely inert while
// per_device_e2e is off.

/**
 * Resolve the plaintext for one message. When per_device_e2e is on and this
 * device has its own chat_message_keys row for the message, decrypt via the
 * multi-device envelope (looking up the sender's public key to re-derive
 * the ECDH shared secret). Otherwise falls back to the legacy single
 * shared-key decrypt — covers both "flag is off" and "this is an older
 * message sent before the flag was enabled" without a separate migration.
 */
async function resolveMessageText(row: DBRow): Promise<string> {
  const cipher = row.ciphertext ?? row.text ?? '';
  if (!isFeatureEnabled('per_device_e2e')) return decryptMessage(cipher);
  try {
    const deviceId = await getDeviceId();
    const { data: keyRow } = await supabase
      .from('chat_message_keys')
      .select('wrapped_key')
      .eq('message_id', row.id)
      .eq('device_id', deviceId)
      .maybeSingle();
    if (!keyRow || !row.sender_device_id) return decryptMessage(cipher); // legacy message, no envelope for this device
    // device_keys is one row per (family, device, member) — a shared
    // device (parent's phone also used by PIN-switched kids) has one row
    // per member who's used it, all with the same device_id. Scope by the
    // message's actual sender too, not just device_id, or this can match
    // more than one row and .maybeSingle() throws.
    const { data: senderDevice } = await supabase
      .from('device_keys')
      .select('public_key')
      .eq('device_id', row.sender_device_id)
      .eq('member_id', row.sender_id)
      .maybeSingle();
    if (!senderDevice) return decryptMessage(cipher);
    return decryptFromDevice(cipher, keyRow.wrapped_key, senderDevice.public_key);
  } catch (e: any) {
    console.warn('[chatStore] resolveMessageText envelope decrypt failed, falling back', e?.message ?? e);
    return decryptMessage(cipher);
  }
}

async function rowToMessage(row: DBRow): Promise<ChatMessage> {
  return {
    id:            row.id,
    senderId:      row.sender_id,
    text:          await resolveMessageText(row),
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
  ensureGlobalUnreadSubscription: (memberId: string) => void;
  setOpenChannelId: (channelId: string | null) => void;
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
  ) => Promise<string | undefined>;

  addReaction:   (channelId: string, messageId: string, emoji: string, memberId: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
  // Re-sends a failed message (status: 'failed') using the args captured
  // at failure time — the tap-to-retry counterpart to the automatic
  // background retry flushOfflineQueue already does.
  retryMessage:  (channelId: string, messageId: string) => Promise<void>;

  search:        (channelId: string, query: string) => Promise<void>;
  clearSearch:   (channelId: string) => void;

  // Retries every message queued to OFFLINE_KEY by a failed sendMessage —
  // previously nothing in the app ever read this key back, so a message
  // sent while offline was queued once and then permanently lost (silently
  // dropped, not retried) the moment the device came back online. Call on
  // app-foreground / reconnect. Safe to call anytime; no-ops if queue empty.
  flushOfflineQueue: () => Promise<void>;

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

  // Was one COUNT query PER channel (Promise.all over channelIds, each
  // with its own chat_channel_reads cutoff) — a real N+1, fired every time
  // this runs across however many channels the family has. Now a single
  // get_unread_counts RPC does the per-channel grouping server-side (see
  // migration 20260927000000_batched_unread_counts_rpc.sql) — one round
  // trip regardless of channel count. A channel absent from the RPC's
  // result (nothing unread) is treated as 0, matching the old behavior.
  loadUnreadCounts: async (channelIds, memberId) => {
    if (channelIds.length === 0) return;
    const { data, error } = await supabase.rpc('get_unread_counts', {
      p_member_id: memberId,
      p_channel_ids: channelIds,
    });
    if (error) { console.warn('[chatStore] loadUnreadCounts RPC failed', error.message); return; }
    const countByChannel = Object.fromEntries((data ?? []).map((r: any) => [r.channel_id, r.unread_count]));
    const counts = channelIds.map(id => [id, countByChannel[id] ?? 0] as const);
    // The channel currently open on screen is excluded from this write —
    // this query and markChannelRead's own read-cursor upsert (fired from
    // a separate, unordered effect in ChatScreen) can race: if this
    // query's chat_channel_reads read lands before markChannelRead's
    // upsert commits, it computes a stale nonzero count and overwrites
    // the zero markChannelRead JUST set, right back to "unread" — for the
    // exact channel the user is actively looking at. Live-reported as the
    // bottom-nav Chat badge staying lit with no actual new messages.
    const filtered = Object.fromEntries(counts.filter(([id]) => id !== _openChannelId));
    set(s => ({ unreadCounts: { ...s.unreadCounts, ...filtered } }));
  },

  // Bumps the read cursor to now and zeroes the badge locally — called when
  // a channel is opened/viewed.
  markChannelRead: async (channelId, memberId) => {
    set(s => ({ unreadCounts: { ...s.unreadCounts, [channelId]: 0 } }));
    await supabase.from('chat_channel_reads')
      .upsert({ channel_id: channelId, member_id: memberId, last_read_at: new Date().toISOString() },
        { onConflict: 'channel_id,member_id' });
  },

  // Keeps unreadCounts LIVE, not just a one-shot snapshot from whenever
  // loadUnreadCounts last happened to run (only triggered by opening the
  // Chat tab). Previously the bottom-nav Chat dot could get stuck showing
  // stale unread state indefinitely — it never cleared if the user left
  // the tab without loadUnreadCounts re-running, and never picked up a
  // genuinely new message that arrived while the user was elsewhere in
  // the app, since nothing incremented it outside that one-shot query.
  // Subscribes globally (not per-channel, unlike loadChannel's own
  // subscription, which only ever exists for a channel actually opened)
  // to every chat_messages INSERT from someone else, and bumps the
  // relevant channel's count client-side — filtered to channels that are
  // actually "mine" (a group channel, or a DM whose composite id contains
  // my own member id) so a DM between two OTHER people never counts.
  ensureGlobalUnreadSubscription: (memberId) => {
    if (_globalUnreadSub && _globalUnreadMemberId === memberId) return;
    if (_globalUnreadSub) { supabase.removeChannel(_globalUnreadSub); _globalUnreadSub = null; }
    _globalUnreadMemberId = memberId;

    const staleTopic = `realtime:chat-unread:${memberId}`;
    const stale = supabase.getChannels().filter(c => c.topic === staleTopic);
    if (stale.length > 0) stale.forEach(c => supabase.removeChannel(c));

    try {
      _globalUnreadSub = supabase
        .channel(`chat-unread:${memberId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'chat_messages',
        }, (payload) => {
          const row = payload.new as any;
          if (!row || row.sender_id === memberId) return;
          const channelId = row.channel_id as string;
          const isMine = GROUP_CHANNEL_IDS.has(channelId) || channelId.split('_').slice(1).includes(memberId);
          if (!isMine) return;
          // Don't bump the badge for a channel the user currently has open
          // and visible — markChannelRead's own effect will clear it
          // right after this arrives via the per-channel subscription
          // anyway, so incrementing here would just cause a flash.
          if (channelId === _openChannelId) return;
          set(s => ({ unreadCounts: { ...s.unreadCounts, [channelId]: (s.unreadCounts[channelId] ?? 0) + 1 } }));
        })
        .subscribe();
    } catch (e: any) {
      console.warn('[chatStore] ensureGlobalUnreadSubscription failed', e?.message ?? e);
    }
  },

  // Lets ChatScreen tell the global unread listener which channel is
  // currently open/visible, so a message arriving on it doesn't flash the
  // badge on before markChannelRead's own zero-out lands a moment later.
  setOpenChannelId: (channelId) => { _openChannelId = channelId; },

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
              const existing = get().channels[channelId]?.messages.find(m => m.id === msg.id);
              // If the schema cache hasn't refreshed voice_url yet, preserve the
              // voiceUri from the optimistic message already in state
              if (!msg.voiceUri) {
                console.log('[chatStore] existing optimistic voiceUri:', existing?.voiceUri);
                if (existing?.voiceUri) msg.voiceUri = existing.voiceUri;
              }
              // Same gap for image/document attachments — sendMessage's own
              // insert deliberately writes image_url/document_url as null
              // (see chatStore.ts's row-building comment: the file itself
              // hasn't finished uploading yet at insert time, a follow-up
              // UPDATE patches the real signed URL in once it has). This
              // realtime INSERT echoes that same null-image_url row back
              // almost immediately, overwriting the optimistic message's
              // local imageUri/documentUri with nothing — the thumbnail
              // that was showing instantly disappears, then reappears
              // seconds later once the UPDATE lands (which already had this
              // exact preserve-if-missing guard, just not here on INSERT).
              // Live-reported as the attachment preview "briefly
              // disappearing and coming back."
              if (!msg.imageUri && existing?.imageUri) msg.imageUri = existing.imageUri;
              if (!msg.documentUri && existing?.documentUri) msg.documentUri = existing.documentUri;
              get()._upsertMessage(channelId, msg);
            }
            if (payload.eventType === 'UPDATE') {
              const msg = await rowToMessage(payload.new as DBRow);
              const existing = get().channels[channelId]?.messages.find(m => m.id === msg.id);
              // Same schema-cache-lag defense voiceUri already had below —
              // document_url is patched in by a follow-up UPDATE after
              // upload (same pattern as voice_url), and needed the
              // identical protection: if this UPDATE's row doesn't yet
              // reflect the real document_url, don't let it clobber
              // whatever the optimistic/previous state already had.
              if (!msg.voiceUri && existing?.voiceUri) msg.voiceUri = existing.voiceUri;
              if (!msg.documentUri && existing?.documentUri) msg.documentUri = existing.documentUri;
              if (!msg.imageUri && existing?.imageUri) msg.imageUri = existing.imageUri;
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
    // Critical fix: every existing call site across the app (choreStore,
    // eventStore, kidRequestStore, etc. — ~51 of them) calls this as
    // sendMessage(recipientMemberId, senderId, ...), which is still the
    // correct CALLING convention (pass who should get it) — what was wrong
    // is that raw recipient id then got used directly as channel_id,
    // colliding with every other sender's DM to that same person. Normalize
    // here, once, so every existing caller is fixed without needing to
    // touch each one individually (and risk missing some).
    const originalChannelArg = channelId;
    channelId = normalizeDmChannelId(channelId, senderId);
    // chat_messages RLS requires channel_id to already exist in
    // chat_channels — a brand new DM pair has no such row yet under the
    // new composite id, so ensure one before writing the message itself.
    if (channelId !== originalChannelArg) {
      await ensureDmChannelRow(channelId, senderId, originalChannelArg);
    } else {
      await ensureGroupChannelRow(channelId, senderId);
    }
    const blind_index  = await buildBlindIndex(text);

    // Per-device envelope (feature-flagged, see lib/chatCrypto.ts's design
    // doc) — encrypt once with a fresh session key, wrap that key once per
    // recipient device. Falls back to the legacy single shared-key encrypt
    // when the flag is off, so this is fully inert until explicitly enabled.
    let ciphertext: string;
    let senderDeviceId: string | undefined;
    let wrappedKeysToInsert: { deviceId: string; wrappedKey: string }[] = [];
    if (isFeatureEnabled('per_device_e2e')) {
      try {
        const { useFamilyStore } = require('./familyStore');
        const members: any[] = useFamilyStore.getState().members;
        const sender = members.find(m => m.id === senderId);
        const familyId = sender?.familyId;
        if (familyId) {
          await ensureDeviceRegistered(familyId, senderId);
          const directory = await getFamilyDeviceDirectory(familyId);
          const myDeviceId = await getDeviceId();
          senderDeviceId = myDeviceId;
          const envelope = await encryptForDevices(text, directory);
          ciphertext = envelope.ciphertext;
          wrappedKeysToInsert = envelope.wrappedKeys;
        } else {
          ciphertext = await encryptMessage(text);
        }
      } catch (e: any) {
        console.warn('[chatStore] per-device envelope encrypt failed, falling back to legacy', e?.message ?? e);
        ciphertext = await encryptMessage(text);
      }
    } else {
      ciphertext = await encryptMessage(text);
    }

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
      replyTo:      replyTo ? { id: replyTo.id, senderId: replyTo.senderId, text: replyTo.text, kind: deriveReplyKind(replyTo) } : undefined,
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
        sender_device_id: senderDeviceId ?? null,
        text:        ciphertext,
        blind_index,
        timestamp:   now,
        created_at:  now,
        // Same local-path guard as document_url below — imageUri/videoUri
        // was written here verbatim with NO upload step anywhere in the
        // app at all (unlike voice/document, which at least attempted an
        // upload) — every image/video sent in chat was 100% broken across
        // devices, confirmed live: 0 rows ever landed in the chat-media
        // bucket. ChatScreen.tsx's handleSend now uploads to chat-media
        // and patches this in after, same pattern as voice/document.
        image_url:   imageUri && !imageUri.startsWith('file://') ? imageUri : null,
        media_type:  mediaType ?? null,
        reply_to:    replyTo ? { id: replyTo.id, senderId: replyTo.senderId, text: replyTo.text, kind: deriveReplyKind(replyTo) } : null,
        duration_sec: voiceDuration != null ? Math.round(voiceDuration) : null,
        location_pin: locationPin ?? null,
        // A documentUri starting with "file://" is a local cache path from
        // the picker, not yet uploaded — writing it here made "Tap to open"
        // point at a path that only ever existed on the sender's own
        // device (live-reported: tapping a shared document does nothing on
        // any other device/session). Same "omit until the real upload
        // lands" treatment voice_url already gets below; ChatScreen.tsx's
        // sendDocument() uploads to chat-media and patches this in after.
        document_url:  documentUri && !documentUri.startsWith('file://') ? documentUri : null,
        document_name: documentName ?? null,
        system_event:  systemEvent ?? null,
        is_system:     !!systemEvent,
        // voice_url omitted from initial insert — added via background update after upload
      };
      const { error } = await supabase.from('chat_messages').insert(row);
      if (error) throw error;
      if (wrappedKeysToInsert.length > 0) {
        const { error: keysError } = await supabase.from('chat_message_keys').insert(
          wrappedKeysToInsert.map(k => ({ message_id: msgId, device_id: k.deviceId, wrapped_key: k.wrappedKey })),
        );
        if (keysError) console.warn('[chatStore] chat_message_keys insert failed', keysError.message);
      }
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
      return msgId;
    } catch (err) {
      // Was: removed the optimistic message outright on any failure,
      // silently re-queuing it for a background-only retry (flushOfflineQueue,
      // triggered elsewhere on reconnect/app-active) — the sender had no
      // visible sign the send ever failed, and no way to retry on demand.
      // Mark it failed and keep it in the list instead, with the exact args
      // needed to resend it stashed on the message itself.
      get()._upsertMessage(channelId, {
        ...optimistic,
        status: 'failed',
        _retryArgs: {
          channelId, senderId, text, imageUri, mediaType, replyTo,
          voiceDuration, locationPin, voiceUri, documentUri, documentName, systemEvent,
        },
      });
      // Also queue for the existing background offline-retry path — a
      // manual tap-to-retry and an automatic reconnect-retry aren't mutually
      // exclusive; whichever succeeds first wins, and retryMessage below
      // removes this queued copy if the user retries manually first.
      let offline: any[];
      try {
        offline = JSON.parse(await AsyncStorage.getItem(OFFLINE_KEY) ?? '[]');
      } catch {
        offline = [];
      }
      offline.push({ channelId, senderId, ciphertext, blind_index, imageUri, mediaType, _optimisticId: optimistic.id });
      await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(offline));
      console.warn('[chatStore] send failed, queued offline', err);
      return undefined;
    }
  },

  // Re-attempts a failed send using the args captured at failure time.
  // Removes the failed bubble and re-runs sendMessage exactly as if the
  // user tapped send again — a fresh optimistic message (and, if it fails
  // again, a fresh failed one) takes its place rather than mutating the old
  // one in place, keeping this on the same code path as every other send.
  retryMessage: async (channelId, messageId) => {
    const msg = get().channels[channelId]?.messages.find(m => m.id === messageId);
    if (!msg?._retryArgs) return;
    const args = msg._retryArgs;
    get()._removeMessage(channelId, messageId);
    // Drop the matching queued offline-retry copy, if any, so a manual
    // retry doesn't also get double-sent later by flushOfflineQueue.
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_KEY);
      if (raw) {
        const offline = JSON.parse(raw).filter((item: any) => item._optimisticId !== messageId);
        await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(offline));
      }
    } catch { /* best-effort cleanup only */ }
    await get().sendMessage(
      args.channelId, args.senderId, args.text, args.imageUri, args.mediaType,
      args.replyTo, args.voiceDuration, args.locationPin, args.voiceUri,
      args.documentUri, args.documentName, args.systemEvent,
    );
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

  // ── Offline retry ─────────────────────────────────────────────────────────

  flushOfflineQueue: async () => {
    let offline: { channelId: string; senderId: string; ciphertext: string; blind_index: string[]; imageUri?: string; mediaType?: 'image' | 'video'; _optimisticId?: string }[];
    try {
      offline = JSON.parse(await AsyncStorage.getItem(OFFLINE_KEY) ?? '[]');
    } catch {
      offline = [];
    }
    if (offline.length === 0) return;

    // Clear the queue up front and only re-queue what still fails — avoids
    // a duplicate send if flush is triggered twice in quick succession
    // (e.g. two AppState 'active' events) while a previous flush is still
    // in flight.
    await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify([]));

    const stillFailed: typeof offline = [];
    for (const item of offline) {
      const now = new Date().toISOString();
      const msgId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      try {
        const { error } = await supabase.from('chat_messages').insert({
          id:          msgId,
          channel_id:  item.channelId,
          sender_id:   item.senderId,
          text:        item.ciphertext,
          blind_index: item.blind_index,
          timestamp:   now,
          created_at:  now,
          image_url:   item.imageUri ?? null,
          media_type:  item.mediaType ?? null,
        });
        if (error) throw error;
        // Realtime subscription (if that channel is currently loaded) will
        // deliver and upsert the real row under the NEW msgId minted above.
        // The failed bubble from the original attempt (status: 'failed',
        // kept visible now instead of being removed) is a different id and
        // won't be touched by that upsert, so it must be explicitly cleared
        // here or a successful background retry leaves a stale "failed —
        // retry?" bubble sitting next to the message that actually went
        // through.
        if (item._optimisticId) get()._removeMessage(item.channelId, item._optimisticId);
      } catch (err) {
        console.warn('[chatStore] flushOfflineQueue: retry failed, re-queueing', err);
        stillFailed.push(item);
      }
    }

    if (stillFailed.length > 0) {
      const current = JSON.parse(await AsyncStorage.getItem(OFFLINE_KEY) ?? '[]');
      await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify([...current, ...stillFailed]));
    }
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
