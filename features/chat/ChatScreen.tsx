/**
 * ChatScreen — v2 bubbles, @mentions, long-press action sheet, double-tap emoji,
 * swipe-to-reply, per-channel context, search, photo/video, grocery convert, E2E.
 *
 * E2E key architecture (Option 1 — passcode-wrapped):
 *   - AES-256-GCM data key lives in expo-secure-store locally.
 *   - On first launch the key is generated and wrapped with the family passcode
 *     (PBKDF2 → AES-KW) → blob stored in Supabase `families.encrypted_key`.
 *   - DB admin sees only ciphertext; no raw key is ever sent to the server.
 *   - New device/reinstall: user enters passcode → fetch blob → unwrapKeyWithPasscode().
 *   - Implementation: @/lib/chatCrypto (wrapKeyWithPasscode / unwrapKeyWithPasscode).
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, Modal, Alert, Image, Animated, Clipboard, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import {
  Send, Search, X, XCircle,
  ChevronDown, ChevronUp, CornerUpLeft, Pencil,
  Paperclip, Mic, Lock, ShieldCheck, Video,
  Camera, Image as ImageIcon, MapPin, FileText, AudioLines,
  type LucideIcon,
} from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import AppHeader from '@/components/AppHeader';
import NotificationPanel from '@/components/NotificationPanel';
import { useNotifStore } from '@/store/notifStore';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useChatStore, ChatMessage, dmChannelId } from '@/store/chatStore';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { checkProfanity } from '@/lib/contentModeration';
import AskCubeRecipeSheet from '@/components/AskCubeRecipeSheet';
import { useGroceryStore } from '@/store/groceryStore';
import { supabase } from '@/lib/supabase';
import { RADIUS } from '@/constants/theme';

import { MessageBubble } from './components/MessageBubble';
import { MessageActionSheet } from './components/MessageActionSheet';
import { GroceryModal } from './components/GroceryModal';
import { RecordingBar, VoiceReviewBar } from './components/VoiceComponents';
import { formatDay, QUICK_REACTIONS, buildGroupChannels } from './components/constants';
import { s } from './components/styles';
import { loadPinnedChannels, togglePinnedChannel, sortChannelIds } from '@/lib/chatChannelOrder';
import { Pin, PinOff } from 'lucide-react-native';

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const {
    channels, loadChannel, sendMessage, addReaction, deleteMessage,
    lastActivity, loadLastActivity, unreadCounts, loadUnreadCounts, markChannelRead,
    readReceipts, loadReadReceipts, markMessagesRead, setOpenChannelId,
  } = useChatStore();
  const { addItem: addGrocery } = useGroceryStore();

  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const unreadNotifCount = useNotifStore(s => s.unreadCount);
  const [channelId, setChannelId]         = useState('all');
  const [pinnedChannels, setPinnedChannels] = useState<string[]>([]);
  const [text, setText]                   = useState('');
  // Dictation into the text box — distinct from the separate voice-NOTE mic
  // (Mic icon, outside the input pill, records+sends an audio attachment).
  // This one transcribes speech straight into the text field for a normal
  // typed-looking message, same on-device engine Ask Cube's chat input uses.
  const preDictationText = useRef('');
  const dictation = useVoiceDictation();
  const [moderationWarning, setModerationWarning] = useState(false);
  const [sharedCardPayload, setSharedCardPayload] = useState<any>(null);
  const [actionMsg, setActionMsg]         = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg]       = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo]       = useState<ChatMessage | null>(null);
  const [groceryMsg, setGroceryMsg]       = useState<ChatMessage | null>(null);
  const [quickEmojiFor, setQuickEmojiFor] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [searchMatchIdx, setSearchMatchIdx]     = useState(0);
  const [attachUri, setAttachUri]         = useState<string | null>(null);
  const [attachType, setAttachType]       = useState<'image' | 'video'>('image');
  const [mentionQuery, setMentionQuery]   = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // Collapses the channel strip + sub-header while the user scrolls up
  // (toward older messages) to free up vertical space, and brings it back
  // as soon as they scroll back down — direction-based, not just "am I at
  // the bottom", so it also reveals while actively scrolling down through
  // history, not only once they reach the very latest message.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  const headerAnim = useRef(new Animated.Value(0)).current; // 0 = shown, 1 = collapsed
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [lightboxUri, setLightboxUri]       = useState<string | null>(null);
  const [videoLightboxUri, setVideoLightboxUri] = useState<string | null>(null);
  const videoPlayer = useVideoPlayer(videoLightboxUri, pl => { pl.loop = false; pl.play(); });

  // Voice recording
  const recorder        = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording]       = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [reviewing, setReviewing]       = useState(false);
  const [reviewUri, setReviewUri]       = useState<string | null>(null);
  const [reviewDur, setReviewDur]       = useState(0);
  const recordStartRef  = useRef<number>(0);
  const recordTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const flatRef    = useRef<FlatList>(null);
  const inputRef   = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => {
    if (!activeMemberId) return;
    loadPinnedChannels(activeMemberId).then(setPinnedChannels);
  }, [activeMemberId]);
  // Inverted FlatList starts at bottom — no scroll-to-end needed.
  // Only reset scroll position on channel switch.
  const prevChannelRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevChannelRef.current !== channelId) {
      prevChannelRef.current = channelId;
      flatRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [channelId]);
  useEffect(() => {
    Animated.timing(searchAnim, { toValue: searchOpen ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    if (!searchOpen) setSearchQuery('');
  }, [searchOpen]);
  useEffect(() => { setSearchMatchIdx(0); }, [searchQuery]);

  // Was a chain of ~10 unmemoized derivations (memberMap, channel lists,
  // per-viewer filtering, DM tile construction) recomputed from scratch on
  // EVERY render — including high-frequency ones with nothing to do with
  // the roster/channel list at all, like a keystroke in the message box or
  // a scroll-throttle tick (every 100ms while scrolling). None of it
  // depends on anything but members/activeMemberId/pinnedChannels/
  // lastActivity, so it's wrapped in one useMemo keyed on just those —
  // live-reported as janky/unresponsive; this was one of several
  // contributors alongside the FlatList/MessageBubble memo fixes and the
  // items/reversedItems memo below.
  const {
    memberMap, activeMember, isParent, isSenior, kids, coParents,
    rawGroupChannels, groupChannels, allChannels, FULL_LABELS,
  } = useMemo(() => {
    const memberMap    = Object.fromEntries(members.map(m => [m.id, m]));
    const activeMember = members.find(m => m.id === activeMemberId);
    const isParent     = activeMember?.role === 'parent';
    const isSenior     = activeMember?.role === 'senior';
    const kids         = members.filter(m => m.role !== 'parent');
    // Co-parents need a 1:1 DM tab too — e.g. quest nudges between parents
    // route to each other's DM (not #all-family), which is invisible without
    // a tab to open it from.
    const coParents    = members.filter(m => m.role === 'parent' && m.id !== activeMemberId);

    // #all-family is no longer visible/postable to grandparents — they now
    // have their own maternal/paternal + combined Grand Squad channels
    // instead. The strip auto-sorts by most-recent-message so active
    // conversations surface without manual scrolling; a pin (tap the pin
    // icon while a channel is open) is the only manual override, always
    // sorting first regardless of activity. DM tabs stay appended after
    // group channels, in member order.
    // #parents-vault is a GROUP channel for 3+ co-parents/guardians — with
    // exactly the typical 2 parents, it's fully redundant with their own 1-1
    // DM (same 2 people, same content, just a second tab for it). Hidden
    // rather than removed: the channel/data model still fully supports it so
    // nothing needs re-adding if a 3rd parent-role member (a temp-approver,
    // a blended-family co-parent) is ever added — parentsCount recomputes
    // live off the real roster, not a one-time flag.
    const parentsCount = members.filter(m => m.role === 'parent').length;
    // Which side (a/b) THIS viewing senior belongs to — buildGroupChannels
    // always returns BOTH seniors_a and seniors_b whenever both sides have
    // GPs (it has no concept of "the current viewer"), and the filter below
    // previously only checked seniorOnly, not side — so a maternal
    // grandparent's channel strip showed the paternal side's private channel
    // too, and could open/post in it. Same derivation buildGroupChannels
    // itself uses (linkedParentId → parents[0]/parents[1]).
    const viewerGpSide: 'a' | 'b' | 'unlinked' | null = (() => {
      if (!isSenior || !activeMember) return null;
      const parents = members.filter(m => m.role === 'parent');
      if (!(activeMember as any).linkedParentId) return 'unlinked';
      if ((activeMember as any).linkedParentId === parents[0]?.id) return 'a';
      if ((activeMember as any).linkedParentId === parents[1]?.id) return 'b';
      return 'unlinked';
    })();
    const rawGroupChannels = buildGroupChannels(members)
      .filter(ch => ch.id !== 'all' || !isSenior)
      .filter(ch => ch.id !== 'parents' || parentsCount > 2)
      .filter(ch => !(ch as any).seniorOnly || isSenior || isParent)
      // A senior only ever sees/opens THEIR OWN side channel, never the
      // other side's — parents still see both (they're on neither side and
      // are the ones who'd coordinate across them). seniors_all (combined)
      // and an unlinked senior's fallback seniors_a are unaffected.
      .filter(ch => {
        if (!isSenior) return true;
        if (ch.id === 'seniors_a') return viewerGpSide === 'a' || viewerGpSide === 'unlinked';
        if (ch.id === 'seniors_b') return viewerGpSide === 'b';
        return true;
      });
    const groupChannels = sortChannelIds(rawGroupChannels.map(ch => ch.id), pinnedChannels, lastActivity)
      .map(id => rawGroupChannels.find(ch => ch.id === id))
      .filter((ch): ch is NonNullable<typeof ch> => !!ch);

    const allChannels = [
      ...groupChannels,
      // CRITICAL FIX: a DM's id used to be just the OTHER party's member id
      // (`p.id`/`k.id`) — that value is identical no matter who's viewing,
      // so Alex's "DM with Priya" and Maya's "DM with Priya" resolved to the
      // exact same channel_id and were, in the database, literally the same
      // conversation thread. dmChannelId() below makes the id unique PER
      // PAIR (both member ids, sorted so it's the same value regardless of
      // who opens it from which side) instead of per-counterpart.
      // label no longer carries a 💬 emoji prefix — the strip tab now renders
      // a real avatar for a DM tile (see allChannels.map below) instead of a
      // generic chat-bubble icon standing in for the actual person.
      ...coParents.map(p => ({ id: dmChannelId(activeMemberId ?? '', p.id), otherId: p.id, label: p.name.split(' ')[0], isDM: true, lock: false })),
      ...kids.map(k => ({ id: dmChannelId(activeMemberId ?? '', k.id), otherId: k.id, label: k.name.split(' ')[0], isDM: true, lock: false })),
    ];
    const FULL_LABELS: Record<string, string> = Object.fromEntries(groupChannels.map(ch => [ch.id, ch.label]));

    return { memberMap, activeMember, isParent, isSenior, kids, coParents, rawGroupChannels, groupChannels, allChannels, FULL_LABELS };
  }, [members, activeMemberId, pinnedChannels, lastActivity]);
  // channelLabel used to look up memberMap[channelId] directly, relying on
  // channelId itself being a raw member id — now that DM ids are a
  // composite pair-id, resolve the OTHER party via the matching
  // allChannels entry's otherId instead.
  const dmOtherId = (allChannels.find(c => c.id === channelId) as any)?.otherId;
  const channelLabel = FULL_LABELS[channelId] ?? `💬 ${memberMap[dmOtherId ?? channelId]?.name?.split(' ')[0] ?? ''}`;

  // A senior landing on the default 'all' channel (e.g. fresh login) gets
  // bounced to the combined Grand Squad channel instead, since #all-family
  // is no longer visible/postable to grandparents.
  useEffect(() => {
    if (channelId === 'all' && isSenior) setChannelId('seniors_all');
  }, [isSenior]);

  // Was an unconditional `useEffect(() => loadChannel(channelId), [channelId])`
  // placed near mount, before isSenior/activeMember were even declared —
  // it fired loadChannel('all') for EVERY viewer including seniors, who
  // get redirected to 'seniors_all' a moment later by the effect above
  // once isSenior resolves. That redirect changes channelId, re-triggering
  // a loadChannel call a SECOND time — every senior login paid for two
  // full message fetch+decrypt+subscribe cycles (one entirely wasted)
  // before the real channel ever loaded (live-reported: Chat feels slow/
  // unresponsive to open). Skip the 'all' fetch once activeMember has
  // resolved and turned out to be a senior — this effect only ever fires
  // loadChannel for the channel the viewer will actually end up on.
  useEffect(() => {
    if (channelId === 'all' && activeMember && isSenior) return;
    loadChannel(channelId);
  }, [channelId, isSenior, !!activeMember]);

  // One cheap query for last-activity + unread counts across every channel
  // this member can see, so the strip can sort/badge correctly even for
  // tabs never opened yet.
  useEffect(() => {
    const ids = allChannels.map(ch => ch.id);
    if (ids.length > 0 && activeMemberId) {
      loadLastActivity(ids);
      loadUnreadCounts(ids, activeMemberId);
    }
  }, [members.length, isSenior, activeMemberId]);

  // Opening a channel clears its own badge immediately (optimistic) and
  // bumps the read cursor server-side. Also tells the global unread
  // subscription which channel is currently visible, so a message
  // arriving on it while open doesn't flash the badge on right before
  // markChannelRead's own zero-out lands.
  useEffect(() => {
    if (activeMemberId) markChannelRead(channelId, activeMemberId);
    setOpenChannelId(channelId);
    return () => setOpenChannelId(null);
  }, [channelId, activeMemberId]);

  const isPinned = pinnedChannels.includes(channelId);
  const togglePin = () => {
    if (!activeMemberId) return;
    const next = isPinned ? pinnedChannels.filter(id => id !== channelId) : [...pinnedChannels, channelId];
    setPinnedChannels(next);
    togglePinnedChannel(activeMemberId, channelId, !isPinned);
  };

  const rawMsgs = channels[channelId]?.messages ?? [];
  // Was never read anywhere — loadChannel (chatStore.ts) sets this true
  // while fetching, but nothing here checked it, so a slow load rendered
  // the FlatList's empty state ("No messages yet. Say hello!") instead of
  // any loading indicator — a genuinely slow/stalled channel open looked
  // identical to an empty channel, reading as "hung" rather than "loading"
  // (live-reported: Chat feels unresponsive on open).
  const channelLoading = channels[channelId]?.loading ?? false;
  const msgs    = searchQuery.trim()
    ? rawMsgs.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawMsgs;

  // Mark incoming messages as read once they're actually loaded/rendered
  // for this channel — also fires when a new realtime message arrives
  // while the channel stays open (rawMsgs.length changes).
  useEffect(() => {
    if (!activeMemberId || rawMsgs.length === 0) return;
    const unread = rawMsgs.filter(m => m.senderId !== activeMemberId).map(m => m.id);
    if (unread.length > 0) markMessagesRead(channelId, unread, activeMemberId);
    loadReadReceipts(channelId, rawMsgs.map(m => m.id));
  }, [channelId, rawMsgs.length, activeMemberId]);

  type DayGroup = { type: 'day'; label: string } | { type: 'msg'; msg: ChatMessage };
  // Was recomputed synchronously on EVERY render (every keystroke, every
  // scroll-throttle tick at 100ms) — a full pass + array copy over up to
  // 100 messages, unconditionally, regardless of whether msgs actually
  // changed. Live-reported as janky/unresponsive; this was one of several
  // contributors (see MessageBubble memo + FlatList tuning fix earlier —
  // this is the ChatScreen-side counterpart).
  const reversedItems = useMemo(() => {
    const items: DayGroup[] = [];
    let lastDay = '';
    for (const m of msgs) {
      const day = formatDay(m.timestamp);
      if (day !== lastDay) { items.push({ type: 'day', label: day }); lastDay = day; }
      items.push({ type: 'msg', msg: m });
    }
    // Inverted FlatList renders index-0 at the visual bottom — newest first
    return [...items].reverse();
  }, [msgs]);

  // ── @mention suggestions ───────────────────────────────────────────────────
  // Scoped to who's ACTUALLY in the open channel — this used to suggest
  // every family member regardless of which conversation was open, so
  // typing "@" in a private 1-on-1 DM (e.g. Alex ↔ Priya) still offered
  // Maya/Leo/Sam etc. as mentionable. Since mention-notify (the edge
  // function that actually pushes a notification when a message is sent
  // containing "@FirstName") has no channel-membership check of its own,
  // picking one of those out-of-channel suggestions and sending would
  // genuinely notify someone with no access to that conversation, plus
  // give them a text preview of a message they can't otherwise read.
  // Also drives the channel sub-header's avatar cluster below — a group
  // channel previously fell through to the RAW `members` array regardless
  // of which one was open, so opening #parents-vault showed kid avatars
  // and opening a seniors_* channel showed the OTHER side's grandparent —
  // every group channel's header looked identical to #all-family's,
  // defeating the whole point of these being separate, scoped channels.
  // Side derivation (linkedParentId → parents[0]='a' side / parents[1]='b'
  // side) mirrors buildGroupChannels' own sideForGp exactly (constants.ts)
  // — kept in sync deliberately since this determines who a message in a
  // side-specific Grand Squad channel actually reaches.
  const parentsForSide = members.filter(m => m.role === 'parent');
  const sideForGp = (gp: any): 'a' | 'b' | 'unlinked' => {
    if (!gp.linkedParentId) return 'unlinked';
    if (gp.linkedParentId === parentsForSide[0]?.id) return 'a';
    if (gp.linkedParentId === parentsForSide[1]?.id) return 'b';
    return 'unlinked';
  };

  // Was recomputed unmemoized on every render (keystrokes, scroll ticks)
  // despite only ever depending on channelId/dmOtherId/members —
  // memoized alongside the channel-list derivation above for the same
  // reason.
  const currentChannelMemberIds: string[] = useMemo(() => dmOtherId
    ? [activeMemberId, dmOtherId].filter((id): id is string => !!id)
    : channelId === 'parents'
      ? members.filter(m => m.role === 'parent').map(m => m.id)
      // seniors_all (#the-grand-squad) — the WHOLE family: both
      // grandparents, both parents, every kid/teen.
      : channelId === 'seniors_all'
        ? members.map(m => m.id)
        // seniors_a / seniors_b — that SIDE's grandparent(s) + the whole
        // rest of the family (parents + kids/teens), excluding only the
        // OTHER side's grandparent(s). An unlinked senior (no side
        // determined) falls into seniors_a per buildGroupChannels' own
        // fallback, so mirror that here too.
        : channelId === 'seniors_a' || channelId === 'seniors_b'
          ? members.filter(m => {
              if (m.role !== 'senior') return true; // every parent + kid/teen
              const side = sideForGp(m);
              const wantSide = channelId === 'seniors_a' ? 'a' : 'b';
              return side === wantSide || (side === 'unlinked' && wantSide === 'a');
            }).map(m => m.id)
          // 'all' (#all-family) — grandparents are already blocked from even
          // opening this channel (see the groupChannels filter above and
          // the matching server-side RLS rule), so its real participants
          // are parents + kids/teens only, never seniors.
          : members.filter(m => m.role !== 'senior').map(m => m.id),
    [dmOtherId, channelId, members, activeMemberId]);

  const mentionSuggestions = mentionQuery !== null
    ? members.filter(m =>
        m.id !== activeMemberId
        && currentChannelMemberIds.includes(m.id)
        && m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  const handleTextChange = (val: string) => {
    setText(val);
    if (moderationWarning) setModerationWarning(false);
    const atIdx = val.lastIndexOf('@');
    if (atIdx !== -1) {
      const after = val.slice(atIdx + 1);
      if (!after.includes(' ') && !after.includes(']')) { setMentionQuery(after); return; }
    }
    setMentionQuery(null);
  };

  // pendingMentions maps display token "@FirstName_idx" → full @[Name|id] for send-time substitution
  const pendingMentions = useRef<Record<string, string>>({});

  const insertMention = (member: any) => {
    const atIdx    = text.lastIndexOf('@');
    const before   = text.slice(0, atIdx);
    const firstName = member.name.split(' ')[0];
    const token    = `@${firstName}`;
    // store the full mention format keyed by token so handleSend can substitute it
    pendingMentions.current[token] = `@[${member.name}|${member.id}]`;
    setText(before + token + ' ');
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    let sourceText = text;
    if (dictation.state === 'listening') {
      const finalTranscript = await dictation.stop();
      sourceText = preDictationText.current + finalTranscript;
    }
    if ((!sourceText.trim() && !attachUri) || !activeMemberId) return;

    // Layer 1 moderation — fast local blocklist, blocks the send outright
    // before anything reaches the server. Attachments/voice notes aren't
    // text-checked; only the message body.
    if (sourceText.trim()) {
      const check = checkProfanity(sourceText);
      if (check.blocked) { setModerationWarning(true); return; }
    }
    setModerationWarning(false);

    if (editingMsg) { deleteMessage(channelId, editingMsg.id); setEditingMsg(null); }
    // Convert display tokens "@FirstName" back to storage format "@[Name|id]"
    let finalText = sourceText.trim();
    for (const [token, full] of Object.entries(pendingMentions.current)) {
      finalText = finalText.split(token).join(full);
    }
    pendingMentions.current = {};
    sendMessage(channelId, activeMemberId, finalText, attachUri ?? undefined, attachUri ? attachType : undefined, replyingTo ?? undefined);
    setText(''); setAttachUri(null); setReplyingTo(null); setMentionQuery(null);
    // Scroll to newest (offset 0 on inverted list = visual bottom)
    requestAnimationFrame(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }));
  };

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85 });
    if (!result.canceled && result.assets[0]) { setAttachUri(result.assets[0].uri); setAttachType('image'); }
  }, []);

  const recordVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera needed'); return; }
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'] as any, videoMaxDuration: 10 });
      if (!result.canceled && result.assets[0]) { setAttachUri(result.assets[0].uri); setAttachType('video'); }
    } catch { Alert.alert('Not available', 'Video recording requires a physical device.'); }
  }, []);

  const pickCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera needed'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!result.canceled && result.assets[0]) { setAttachUri(result.assets[0].uri); setAttachType('image'); }
  }, []);

  const sendDocument = useCallback(async () => {
    if (!activeMemberId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      sendMessage(channelId, activeMemberId, '', undefined, undefined, undefined, undefined, undefined, undefined, asset.uri, asset.name);
    } catch {
      Alert.alert('Could not open document picker');
    }
  }, [activeMemberId, channelId, sendMessage]);

  const sendLocation = useCallback(async () => {
    if (!activeMemberId) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Location permission required'); return; }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const address = geo
        ? [geo.name, geo.street, geo.city, geo.region].filter(Boolean).join(', ')
        : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      sendMessage(channelId, activeMemberId, '', undefined, undefined, undefined, undefined, { address, lat, lng });
    } catch {
      Alert.alert('Could not get location', 'Please try again.');
    }
  }, [activeMemberId, channelId, sendMessage]);

  const handleAttach = () => setShowAttachMenu(v => !v);

  // ── Voice recording ──────────────────────────────────────────────────────

  const MAX_RECORD_SECS = 10;

  const doStopRecording = async () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    await recorder.stop();
    const uri = recorder.uri;
    const dur = Math.min((Date.now() - recordStartRef.current) / 1000, MAX_RECORD_SECS);
    setRecording(false);
    setRecordingElapsed(0);
    if (!uri || dur < 0.5) return;
    setReviewUri(uri); setReviewDur(dur); setReviewing(true);
  };

  const startRecording = async () => {
    if (recording) { await doStopRecording(); return; }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) { Alert.alert('Microphone permission required'); return; }
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordStartRef.current = Date.now();
    setRecording(true);
    setRecordingElapsed(0);
    recordTimerRef.current = setInterval(async () => {
      const elapsed = (Date.now() - recordStartRef.current) / 1000;
      setRecordingElapsed(Math.min(elapsed, MAX_RECORD_SECS));
      if (elapsed >= MAX_RECORD_SECS) { await doStopRecording(); }
    }, 100);
  };

  const stopAndReview = doStopRecording;

  const discardVoice = () => { setReviewing(false); setReviewUri(null); setReviewDur(0); };

  const sendVoiceNote = async () => {
    if (!reviewUri || !activeMemberId) return;
    const localUri = reviewUri; const dur = reviewDur;
    setReviewing(false); setReviewUri(null); setReviewDur(0);
    await sendMessage(channelId, activeMemberId, '', undefined, undefined, undefined, dur, undefined, localUri);
    try {
      const fileName = `voice/${activeMemberId}_${Date.now()}.mp4`;
      const response = await fetch(localUri);
      const blob     = await response.blob();
      const { error } = await supabase.storage.from('chat-media').upload(fileName, blob, { contentType: 'audio/mp4' });
      if (!error) {
        const { data } = supabase.storage.from('chat-media').getPublicUrl(fileName);
        const since    = new Date(Date.now() - 8000).toISOString();
        await supabase.from('chat_messages').update({ voice_url: data.publicUrl })
          .eq('channel_id', channelId).eq('sender_id', activeMemberId).gte('created_at', since).is('voice_url', null);
      }
    } catch (e) { console.warn('[ChatScreen] voice upload failed', e); }
  };

  const accentColor = (memberId: string) => {
    const m = memberMap[memberId];
    if (!m) return colors.primary;
    return m.role === 'parent' ? (colors.parent ?? '#2563eb') : (colors.kid ?? '#7c3aed');
  };

  const scrollToQuotedMsg = (replyToId: string) => {
    const idx = reversedItems.findIndex(it => it.type === 'msg' && it.msg.id === replyToId);
    if (idx < 0) return;
    flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightedMsgId(replyToId);
    setTimeout(() => setHighlightedMsgId(null), 2000);
  };

  const searchHeight = searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 52] });
  // While dictating, Send only lights up once the user has paused for a
  // beat (dictation.silenceReady) — the mic keeps listening either way, so
  // they can still keep talking to add more before actually tapping Send.
  const dictatedText = dictation.state === 'listening' ? preDictationText.current + dictation.liveTranscript : text;
  const canSend      = (dictation.state === 'listening' ? dictation.silenceReady && dictatedText.trim().length > 0 : dictatedText.trim().length > 0) || attachUri !== null;
  const parentLocked = channelId === 'parents' && !isParent;

  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Animated.View style={{
        maxHeight: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] }),
        opacity: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        overflow: 'hidden',
      }}>
        <AppHeader
          memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
          memberRole={activeMember?.role ?? 'parent'}
          notifCount={unreadNotifCount}
          onPersonaPress={() => setSwitcherOpen(true)}
          onBellPress={() => setNotifPanelOpen(true)}
        />
        <NotificationPanel visible={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />

        {/* ── Channel strip ── */}
        <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
          <View style={[s.strip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingHorizontal: 2, alignItems: 'center' }}>
              {allChannels.map(ch => {
                if ((ch as any).lock && !isParent) return null;
                const act = channelId === ch.id;
                const pinned = !(ch as any).isDM && pinnedChannels.includes(ch.id);
                const unread = act ? 0 : (unreadCounts[ch.id] ?? 0);
                return (
                  <Pressable key={ch.id} onPress={() => setChannelId(ch.id)}
                    style={[s.channelBtn, { backgroundColor: act ? ((ch as any).isDM ? colors.primary : colors.card) : 'transparent' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      {(ch as any).isDM && (
                        <View style={{ width: 16, height: 16 }}>
                          <FamilyAvatar
                            name={memberMap[(ch as any).otherId]?.name ?? ch.label}
                            emoji={memberMap[(ch as any).otherId]?.emoji}
                            avatarUrl={memberMap[(ch as any).otherId]?.avatarUrl}
                            siblings={[]}
                            size={16}
                            ringColor={accentColor((ch as any).otherId)}
                            ringWidth={0}
                            bgColor={accentColor((ch as any).otherId) + '44'}
                          />
                        </View>
                      )}
                      {pinned && <Pin size={10} color={act ? '#fff' : colors.textTertiary} fill={act ? '#fff' : colors.textTertiary} />}
                      <Text style={{ fontSize: 13, fontWeight: '700', color: act ? ((ch as any).isDM ? '#fff' : colors.textPrimary) : colors.textTertiary }}>
                        {ch.label}
                      </Text>
                      {unread > 0 && (
                        <View style={{ minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
                          backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{unread > 99 ? '99+' : unread}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Animated.View>

      {/* ── Channel sub-header: label + member avatars ──
          zIndex/elevation below 1 so this sibling row reliably renders
          UNDER the persona switcher dropdown (absolutely positioned inside
          AppHeader above, zIndex 50) instead of bleeding through it — a
          parent's zIndex alone doesn't guarantee ordering against a
          sibling subtree without matching zIndex/elevation of its own,
          especially on Android. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, gap: 8, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, zIndex: 0, elevation: 0 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <ShieldCheck size={12} color="#10b981" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }} numberOfLines={1}>{channelLabel}</Text>
          {/* A DM's participant count/avatars must be scoped to the 2
              people actually in it, not the whole family — this
              previously showed members.length/members unconditionally,
              which for a 1-1 DM misleadingly displayed "5 members" and
              every family member's avatar, undermining the fact that a
              DM is actually private. */}
          {!dmOtherId && <Text style={{ fontSize: 10, color: colors.textTertiary }}>· {currentChannelMemberIds.length} members</Text>}
        </View>

        {/* Avatar cluster — solid separator border so no ring bleed */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {(dmOtherId
            ? [activeMember, memberMap[dmOtherId]].filter(Boolean)
            : currentChannelMemberIds.map(id => memberMap[id]).filter(Boolean)
          ).slice(0, 5).map((m: any, i: number) => {
            const sep = colors.card;
            return (
              <View key={m.id} style={{
                marginLeft: i === 0 ? 0 : -10,
                zIndex: 10 - i,
                width: 26, height: 26, borderRadius: 13,
                borderWidth: 2, borderColor: sep,
                overflow: 'hidden',
              }}>
                <FamilyAvatar
                  name={m.name ?? ''}
                  emoji={m.emoji}
                  avatarUrl={m.avatarUrl}
                  siblings={[]}
                  size={22}
                  ringColor={accentColor(m.id)}
                  ringWidth={0}
                  bgColor={accentColor(m.id) + '44'}
                />
              </View>
            );
          })}
          {!dmOtherId && currentChannelMemberIds.length > 5 && (
            <View style={{
              marginLeft: -10, zIndex: 0,
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: colors.surface,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: colors.card,
            }}>
              <Text style={{ fontSize: 8, fontWeight: '900', color: colors.textSecondary }}>
                +{currentChannelMemberIds.length - 5}
              </Text>
            </View>
          )}
        </View>

        {groupChannels.some(ch => ch.id === channelId) && (
          <Pressable onPress={togglePin}
            style={[s.iconBtn, { backgroundColor: isPinned ? colors.primaryLight : colors.surface, borderColor: isPinned ? colors.primary : colors.border }]}>
            {isPinned ? <PinOff size={15} color={colors.primary} /> : <Pin size={15} color={colors.textSecondary} />}
          </Pressable>
        )}

        <Pressable onPress={() => setSearchOpen(v => !v)}
          style={[s.iconBtn, { backgroundColor: searchOpen ? colors.primaryLight : colors.surface, borderColor: searchOpen ? colors.primary : colors.border }]}>
          {searchOpen ? <X size={15} color={colors.primary} /> : <Search size={15} color={colors.textSecondary} />}
        </Pressable>
      </View>

      {/* ── Search bar ── */}
      <Animated.View style={{ height: searchHeight, overflow: 'hidden', paddingHorizontal: 14 }}>
        <View style={[s.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={14} color={colors.textTertiary} />
          <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search messages…"
            placeholderTextColor={colors.placeholder} autoFocus={searchOpen}
            style={{ flex: 1, fontSize: 13, color: colors.textPrimary, paddingVertical: 0 }} />
          {searchQuery.length > 0 && msgs.length > 0 && (
            <>
              <Text style={{ fontSize: 11, color: colors.textTertiary, marginHorizontal: 4 }}>
                {searchMatchIdx + 1}/{msgs.length}
              </Text>
              <Pressable onPress={() => {
                const next = (searchMatchIdx - 1 + msgs.length) % msgs.length;
                setSearchMatchIdx(next);
                const idx = reversedItems.findIndex(it => it.type === 'msg' && it.msg.id === msgs[next].id);
                if (idx >= 0) flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
              }}><ChevronUp size={18} color={colors.primary} /></Pressable>
              <Pressable onPress={() => {
                const next = (searchMatchIdx + 1) % msgs.length;
                setSearchMatchIdx(next);
                const idx = reversedItems.findIndex(it => it.type === 'msg' && it.msg.id === msgs[next].id);
                if (idx >= 0) flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
              }}><ChevronDown size={18} color={colors.primary} /></Pressable>
              <Pressable onPress={() => setSearchQuery('')}><XCircle size={16} color={colors.textTertiary} /></Pressable>
            </>
          )}
        </View>
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {parentLocked ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.amberLight, borderWidth: 2, borderColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={30} color={colors.amber} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' }}>🔒 Parents Vault</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>Restricted to parents. Switch profile to access.</Text>
          </View>
        ) : (
          <>
            {/* ── Messages — inverted so newest is always at visual bottom ── */}
            <FlatList
              ref={flatRef}
              data={reversedItems}
              inverted
              keyExtractor={(item, i) => item.type === 'day' ? `day-${i}` : item.msg.id}
              contentContainerStyle={{ paddingVertical: 6 }}
              style={{ backgroundColor: colors.background }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              // No tuning at all previously — FlatList's defaults render
              // more offscreen content than this variable-height, richly-
              // decorated row (images/voice waveforms/reactions/reply
              // quotes) needs, which is expensive to lay out per row.
              // initialNumToRender/windowSize/maxToRenderPerBatch tuned
              // down together with MessageBubble's new memo boundary
              // (above) — live-reported as janky/not-smooth scrolling.
              initialNumToRender={20}
              maxToRenderPerBatch={10}
              windowSize={7}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews
              onTouchStart={() => showAttachMenu && setShowAttachMenu(false)}
              onScroll={({ nativeEvent: { contentOffset } }) => {
                // In inverted list offset 0 = bottom; >200 means user scrolled up
                setShowScrollBtn(contentOffset.y > 200);

                // Inverted list: a GROWING offset.y means the user is
                // scrolling toward older messages (visually "up"); a
                // shrinking one means back toward the latest ("down").
                const dy = contentOffset.y - lastScrollY.current;
                lastScrollY.current = contentOffset.y;
                if (Math.abs(dy) < 2) return; // ignore jitter
                const goingToOlder = dy > 0;
                if (goingToOlder && contentOffset.y > 40 && !headerCollapsed) {
                  setHeaderCollapsed(true);
                  Animated.timing(headerAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
                } else if ((!goingToOlder || contentOffset.y <= 40) && headerCollapsed) {
                  setHeaderCollapsed(false);
                  Animated.timing(headerAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
                }
              }}
              scrollEventThrottle={100}
              onScrollToIndexFailed={({ index }) => {
                // Item not yet rendered — scroll to approximate offset then retry
                flatRef.current?.scrollToOffset({ offset: index * 80, animated: false });
                setTimeout(() => flatRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 200);
              }}
              ListEmptyComponent={
                channelLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                    <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                    <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 }}>
                      {searchQuery ? `No results for "${searchQuery}"` : 'No messages yet.\nSay hello! 👋'}
                    </Text>
                  </View>
                )
              }
              renderItem={({ item, index }) => {
                if (item.type === 'day') {
                  return (
                    <View style={[s.dayRow, { marginHorizontal: 20 }]}>
                      <View style={[s.dayLine, { backgroundColor: colors.border }]} />
                      <Text style={[s.dayLabel, { color: colors.textTertiary, backgroundColor: isDark ? colors.background : '#f5f7ff' }]}>{item.label}</Text>
                      <View style={[s.dayLine, { backgroundColor: colors.border }]} />
                    </View>
                  );
                }
                const msg    = item.msg;
                const isMe   = msg.senderId === activeMemberId;
                const sender = memberMap[msg.senderId];
                // In reversed (inverted) list: index+1 = older (visually above), index-1 = newer (visually below)
                const olderItem  = index < reversedItems.length - 1 ? reversedItems[index + 1] : null;
                const newerItem  = index > 0 ? reversedItems[index - 1] : null;
                const olderMsg   = olderItem?.type === 'msg' ? olderItem.msg : null;
                const newerMsg   = newerItem?.type === 'msg' ? newerItem.msg : null;
                // isGroupFirst = no older msg from same sender (top of visual group)
                const isGroupFirst = !olderMsg || olderMsg.senderId !== msg.senderId;
                // isGroupLast  = no newer msg from same sender (bottom of visual group — where avatar/tail goes)
                const isGroupLast  = !newerMsg || newerMsg.senderId !== msg.senderId;
                const canEdit      = isMe && (Date.now() - new Date(msg.timestamp).getTime()) < 60_000;
                return (
                  <MessageBubble
                    msg={msg} isMe={isMe}
                    isGroupFirst={isGroupFirst} isGroupLast={isGroupLast}
                    // A sender lookup miss here means the member row is
                    // genuinely gone (member-purge-sweep permanently
                    // removed a soft-deleted profile past its 7-day
                    // window) — chat_messages.sender_id is deliberately
                    // never nulled/deleted by that sweep, so old messages
                    // stay readable with an honest "Removed member" label
                    // instead of a misleading blank/generic name.
                    senderName={sender?.name?.split(' ')[0] ?? 'Removed member'}
                    senderEmoji={sender?.emoji ?? '👤'}
                    senderColor={accentColor(msg.senderId)}
                    // The quoted message's OWN sender's color, not the
                    // replying message's — the accent strip should identify
                    // whose message is being quoted, so replying to someone
                    // else's message previously (incorrectly) showed the
                    // REPLIER's color on the quote strip instead of theirs.
                    replyToColor={msg.replyTo ? accentColor(msg.replyTo.senderId) : undefined}
                    activeMemberId={activeMemberId ?? ''}
                    memberMap={memberMap}
                    searchQuery={searchQuery}
                    isParent={isParent}
                    colors={colors} isDark={isDark}
                    highlighted={highlightedMsgId === msg.id}
                    // Only my own messages in a GROUP channel show the reader
                    // avatar stack — a DM's single recipient is already implied
                    // by the double-tick, so the stack would just be clutter.
                    readers={isMe && !(allChannels.find(c => c.id === channelId) as any)?.isDM
                      ? (readReceipts[msg.id] ?? []).filter(id => id !== activeMemberId) : []}
                    onLongPress={() => setActionMsg(msg)}
                    onDoubleTap={() => setQuickEmojiFor(msg)}
                    onSwipeRight={() => { setReplyingTo(msg); inputRef.current?.focus(); }}
                    onQuoteTap={msg.replyTo ? () => scrollToQuotedMsg(msg.replyTo!.id) : undefined}
                    onOpenImage={setLightboxUri}
                    onOpenVideo={setVideoLightboxUri}
                    onOpenSharedCard={setSharedCardPayload}
                  />
                );
              }}
            />
            {/* Scroll-to-bottom — matches AskCubeChat's pill+"Latest" label
                treatment (components/AskCubeChat.tsx) instead of a bare
                circular chevron, so the two chat surfaces read as the same
                affordance rather than two different-looking buttons. */}
            {showScrollBtn && (
              <Pressable onPress={() => flatRef.current?.scrollToOffset({ offset: 0, animated: true })}
                style={{ position: 'absolute', bottom: 12, alignSelf: 'center',
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                  shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                <ChevronDown size={14} color="#fff" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Latest</Text>
              </Pressable>
            )}

            {/* ── Moderation warning ── */}
            {moderationWarning && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: colors.danger + '14', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.danger }}>
                <Text style={{ fontSize: 14 }}>🙏</Text>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.danger }}>Let's keep it kind — that message wasn't sent.</Text>
                <Pressable onPress={() => setModerationWarning(false)}><X size={16} color={colors.danger} /></Pressable>
              </View>
            )}

            {/* ── Reply banner ── */}
            {replyingTo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <CornerUpLeft size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Reply to {memberMap[replyingTo.senderId]?.name?.split(' ')[0]}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>{replyingTo.text}</Text>
                </View>
                <Pressable onPress={() => setReplyingTo(null)}><X size={18} color={colors.textTertiary} /></Pressable>
              </View>
            )}

            {/* ── Edit banner ── */}
            {editingMsg && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: colors.amberLight, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.amber }}>
                <Pencil size={16} color={colors.amber} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>Editing: {editingMsg.text}</Text>
                <Pressable onPress={() => { setEditingMsg(null); setText(''); }}><X size={18} color={colors.textTertiary} /></Pressable>
              </View>
            )}

            {/* ── Attachment preview ── */}
            {attachUri && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8,
                borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <View style={{ position: 'relative' }}>
                  <Image source={{ uri: attachUri }} style={{ width: 56, height: 56, borderRadius: 10 }} resizeMode="cover" />
                  {attachType === 'video' && (
                    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <Video size={16} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>{attachType === 'video' ? '🎥 Video clip (≤10s)' : '🖼️ Image'}</Text>
                </View>
                <Pressable onPress={() => setAttachUri(null)} style={{ padding: 6 }}>
                  <XCircle size={20} color={colors.textTertiary} />
                </Pressable>
              </View>
            )}

            {/* ── Active recording bar ── */}
            {recording && (
              <RecordingBar elapsed={recordingElapsed} isDark={isDark} onStop={doStopRecording} />
            )}

            {/* ── Voice review bar ── */}
            {reviewing && reviewUri && (
              <VoiceReviewBar uri={reviewUri} duration={reviewDur} isDark={isDark}
                onSend={sendVoiceNote} onDiscard={discardVoice} />
            )}

            {/* ── Mention picker — grows upward from just above input bar ── */}
            {mentionSuggestions.length > 0 && (
              <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
                shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -3 }, elevation: 10 }}>
                {mentionSuggestions.map((m, i) => (
                  <Pressable key={m.id} onPress={() => insertMention(m)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11,
                      borderBottomWidth: i < mentionSuggestions.length - 1 ? StyleSheet.hairlineWidth : 0,
                      borderBottomColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentColor(m.id) + '22',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18 }}>{m.emoji ?? '👤'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{m.name.split(' ')[0]}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize' }}>{m.role}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: accentColor(m.id), fontWeight: '600' }}>tap to mention</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* ── Attach menu popup ── */}
            {showAttachMenu && (
              <View style={[s.attachMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {([
                  { Icon: Camera,    label: 'Camera',   color: colors.accent,  onPress: () => { setShowAttachMenu(false); pickCamera(); } },
                  { Icon: ImageIcon, label: 'Photo',    color: colors.success, onPress: () => { setShowAttachMenu(false); pickImage(); } },
                  { Icon: Video,     label: 'Video',    color: colors.danger,  onPress: () => { setShowAttachMenu(false); recordVideo(); } },
                  { Icon: FileText,  label: 'Document', color: colors.warning, onPress: () => { setShowAttachMenu(false); sendDocument(); } },
                  { Icon: MapPin,    label: 'Location', color: colors.info,    onPress: () => { setShowAttachMenu(false); sendLocation(); } },
                ] as { Icon: LucideIcon; label: string; color: string; onPress: () => void }[]).map(item => (
                  <Pressable key={item.label} onPress={item.onPress} style={s.attachItem}>
                    <View style={[s.attachIcon, { backgroundColor: item.color + '22' }]}>
                      <item.Icon size={24} color={item.color} />
                    </View>
                    <Text style={[s.attachLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* ── Input bar ── */}
            {!reviewing && !recording && (
              <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                {/* Attach */}
                <Pressable onPress={handleAttach} style={s.bareIconBtn}>
                  <Paperclip size={20} color={colors.textSecondary} />
                </Pressable>

                {/* Text input */}
                <View style={[s.inputBubble, { backgroundColor: colors.surface,
                  borderColor: dictation.state === 'listening' ? colors.teal : colors.borderMed }]}>
                  <TextInput
                    ref={inputRef}
                    value={dictation.state === 'listening' ? (preDictationText.current + dictation.liveTranscript) : text}
                    onChangeText={handleTextChange}
                    placeholder={`Message ${channelLabel}…`}
                    placeholderTextColor={colors.placeholder}
                    multiline
                    maxLength={1000}
                    scrollEnabled
                    editable={dictation.state !== 'listening'}
                    style={[s.input, { color: colors.textPrimary }]}
                  />
                  {/* Dictation — transcribes into the text field itself, distinct
                      from the outer Mic (records a separate voice-note attachment).
                      Different icon + teal accent so the two are never confused. */}
                  <Pressable
                    onPress={async () => {
                      if (dictation.state === 'listening') {
                        const finalText = await dictation.stop();
                        handleTextChange(preDictationText.current + finalText);
                        return;
                      }
                      preDictationText.current = text ? text + ' ' : '';
                      await dictation.start();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}>
                    <AudioLines size={19} color={dictation.state === 'listening' ? colors.teal : colors.textTertiary} />
                  </Pressable>
                </View>

                {/* Mic → Send */}
                {canSend ? (
                  <Pressable onPress={handleSend}
                    style={[s.sendBtn, {
                      backgroundColor: colors.primary,
                      shadowColor: colors.primary,
                      shadowOpacity: 0.35, shadowRadius: 8,
                      shadowOffset: { width: 0, height: 3 }, elevation: 5,
                    }]}>
                    <Send size={17} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable onPress={startRecording} style={s.bareIconBtn}>
                    <Mic size={22} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>

      {/* ── Shared card detail (read-only — tapped a meal/event/quest card someone shared) ── */}
      <AskCubeRecipeSheet
        visible={!!sharedCardPayload}
        data={sharedCardPayload?.data ?? null}
        chefName={sharedCardPayload?.data?.chefId ? members.find((m: any) => m.id === sharedCardPayload.data.chefId)?.name : undefined}
        onClose={() => setSharedCardPayload(null)}
      />

      {/* ── Quick emoji (double-tap) ── */}
      <Modal visible={!!quickEmojiFor} transparent animationType="fade" onRequestClose={() => setQuickEmojiFor(null)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setQuickEmojiFor(null)}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: RADIUS.xl, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 }}>
            {QUICK_REACTIONS.map(e => (
              <Pressable key={e} onPress={() => {
                if (quickEmojiFor && activeMemberId) addReaction(channelId, quickEmojiFor.id, e, activeMemberId);
                setQuickEmojiFor(null);
              }} style={{ padding: 6 }}>
                <Text style={{ fontSize: 28 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Long-press action sheet ── */}
      <MessageActionSheet
        visible={!!actionMsg} msg={actionMsg}
        isMe={actionMsg?.senderId === activeMemberId}
        canEdit={!!actionMsg && (Date.now() - new Date(actionMsg.timestamp).getTime()) < 60_000}
        colors={colors} isDark={isDark}
        onClose={() => setActionMsg(null)}
        onReact={emoji => { if (actionMsg && activeMemberId) addReaction(channelId, actionMsg.id, emoji, activeMemberId); }}
        onReply={() => { if (actionMsg) { setReplyingTo(actionMsg); inputRef.current?.focus(); } }}
        onCopy={() => { if (actionMsg?.text) { Clipboard.setString(actionMsg.text); Alert.alert('Copied!'); } }}
        onEdit={() => { if (actionMsg) { setEditingMsg(actionMsg); setText(actionMsg.text); inputRef.current?.focus(); } }}
        onDelete={() => { if (actionMsg) deleteMessage(channelId, actionMsg.id); }}
        onAddGrocery={() => { if (actionMsg) setGroceryMsg(actionMsg); }}
      />

      {/* ── Grocery modal ── */}
      <GroceryModal
        visible={!!groceryMsg}
        initialName={groceryMsg?.text ?? ''}
        onClose={() => setGroceryMsg(null)}
        onAdd={item => {
          // Was passing the raw modal payload straight to addItem, whose
          // required familyId/addedBy keys never matched what the modal
          // sent (store/estimatedPrice/addedByMemberId) — item silently
          // saved with no family link and no attribution every time.
          if (!activeMember?.familyId) return;
          addGrocery({ ...item, familyId: activeMember.familyId, addedBy: activeMemberId ?? '' });
          Alert.alert('✅ Added!', `"${item.name}" added to the shopping list.`);
        }}
      />

      {/* ── Image lightbox ── */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setLightboxUri(null)}>
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          )}
          <Pressable onPress={() => setLightboxUri(null)}
            style={{ position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 }}>
            <X size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Video lightbox ── */}
      <Modal visible={!!videoLightboxUri} transparent animationType="fade"
        onRequestClose={() => setVideoLightboxUri(null)}>
        <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          <VideoView
            player={videoPlayer}
            style={{ width: '100%', height: '55%' }}
            contentFit="contain"
            nativeControls
          />
          <Pressable onPress={() => setVideoLightboxUri(null)}
            style={{ position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8 }}>
            <X size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
