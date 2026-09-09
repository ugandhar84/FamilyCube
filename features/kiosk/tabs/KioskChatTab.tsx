/**
 * KioskChatTab — full channel/DM chat for kiosk mode, redesigned from the
 * original single-fixed-'all'-channel version (live-reported: "we missed
 * the tabs for the all chat channels and DM" + "it looks ugly... we dont
 * need such a wider screen"). Two panes instead of one full-width column:
 * a fixed-width channel/DM list on the left (mirrors the phone's own
 * channel strip — same buildGroupChannels/dmChannelId logic, same access
 * rules per role, just a vertical list instead of a horizontal scroll
 * strip, which suits a sidebar better than a phone-width chip row) and a
 * WIDTH-CAPPED message thread on the right, so a message never stretches
 * anywhere near kiosk's full landscape width the way the old single-column
 * layout did. This two-pane structure is unchanged from the prior redesign
 * — everything below builds on top of it.
 *
 * Full feature-parity pass (this pass): kiosk is NEVER allowed to be a
 * functionally-trimmed phone app — only the presentation adapts for a
 * bigger landscape screen. This wires in the real photo/video/document
 * attachments, voice notes w/ waveform playback, swipe-to-reply, emoji
 * reactions, and location sharing from features/chat/ChatScreen.tsx,
 * reusing the EXACT SAME components (MessageBubble, VoiceComponents,
 * MessageActionSheet) and the exact same useChatStore actions/upload
 * pipeline — none of that logic is reimplemented here, only re-rendered
 * at kiosk scale (bigger touch targets, wider input bar, no need to fit a
 * phone-width screen).
 *
 * ── Hub-OS migration ────────────────────────────────────────────────────
 * This tab's own CHROME — the channel/DM sidebar, the thread header, the
 * moderation/edit/reply/attachment banners, the attach menu, the input bar
 * and the reaction picker — is restyled onto the kiosk palette. The two-
 * pane structure and every chat behavior are unchanged.
 *
 * The MESSAGE BUBBLES deliberately stay on the app palette. MessageBubble,
 * MessageActionSheet and the voice components are shared phone components
 * that paint themselves from `colors`; restyling them would mean forking
 * three non-trivial components whose reuse is the whole point of this tab
 * (see the parity note above). So `colors` is still a prop, and
 * accentColor() stays app-palette too — see its own comment for why a
 * kiosk-tuned sender tint on an app-palette bubble would be worse than
 * consistent.
 *
 * Idle lock: the reaction picker is a native Modal, so it now also mounts
 * KioskModalHost — the existing useKioskLockSuspended holds the lock off,
 * but touches inside a Modal never reach KioskScreen's root onTouchStart,
 * so without the host each tap failed to restart the idle timer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet,
  Modal, Image, Alert, Clipboard, KeyboardAvoidingView, Platform, Keyboard,
  findNodeHandle, UIManager,
} from 'react-native';
import {
  Send, Lock, Paperclip, Mic, Camera, Image as ImageIcon, Video, FileText,
  MapPin, X, XCircle, CornerUpLeft, Pencil, Search, ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { TYPO, RADIUS } from '@/constants/theme';
import { fmtTime } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { checkProfanity } from '@/lib/contentModeration';
import { showToast } from '@/components/AppToast';
import { useChatStore, dmChannelId, type ChatMessage } from '@/store/chatStore';
import {
  buildGroupChannels, formatDay, QUICK_REACTIONS, REPLY_KIND_LABEL,
} from '@/features/chat/components/constants';
import { MessageBubble } from '@/features/chat/components/MessageBubble';
import { stripMentionBrackets } from '@/features/chat/components/MentionText';
import { MessageActionSheet } from '@/features/chat/components/MessageActionSheet';
import { RecordingBar, VoiceReviewBar } from '@/features/chat/components/VoiceComponents';
import { GroceryModal } from '@/features/chat/components/GroceryModal';
import AskCubeRecipeSheet from '@/components/AskCubeRecipeSheet';
import { useGroceryStore } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';
import { useKioskActivity, useKioskLockSuspended, KioskModalHost } from '../KioskActivityContext';
import { useKioskColors } from '../kioskPalette';
import { Chip } from '../components/KioskOS';
import { KioskAvatar } from '../components/KioskAvatar';
import { KIOSK_TYPO, KIOSK_HIT, KIOSK_SPACE, KIOSK_RADIUS, kioskElevation } from '../kioskTheme';

interface ChannelEntry {
  id: string;
  label: string;
  isDM: boolean;
  lock: boolean;
  otherMember?: FamilyMember;
}

type DayGroup = { type: 'day'; label: string } | { type: 'msg'; msg: ChatMessage };

export function KioskChatTab({ active, members, colors, isDark }: {
  active: FamilyMember; members: FamilyMember[]; colors: any; isDark: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  // Scrolled so a card's own quick-send input stays visible once the
  // keyboard opens over it [live-requested: "when keyboard open puh the
  // page to view the text input"] — the grid page had no keyboard
  // avoidance/scroll-into-view at all before this.
  const gridScrollRef = useRef<ScrollView>(null);
  const channels = useChatStore(s => s.channels);
  const unreadCounts = useChatStore(s => s.unreadCounts);
  const readReceipts = useChatStore(s => s.readReceipts);
  const loadChannel = useChatStore(s => s.loadChannel);
  const loadUnreadCounts = useChatStore(s => s.loadUnreadCounts);
  const loadReadReceipts = useChatStore(s => s.loadReadReceipts);
  const markChannelRead = useChatStore(s => s.markChannelRead);
  const markMessagesRead = useChatStore(s => s.markMessagesRead);
  const sendMessage = useChatStore(s => s.sendMessage);
  const addReaction = useChatStore(s => s.addReaction);
  const deleteMessage = useChatStore(s => s.deleteMessage);
  const retryMessage = useChatStore(s => s.retryMessage);
  const { addItem: addGrocery } = useGroceryStore();
  const setOpenChannelId = useChatStore(s => s.setOpenChannelId);

  const isParent = active.role === 'parent';
  const isSenior = active.role === 'senior';

  const memberMap = useMemo(
    () => Object.fromEntries(members.filter(m => !(m as any).deletedAt).map(m => [m.id, m])),
    [members],
  );
  // Stays on the APP palette rather than the kiosk one, deliberately: this
  // value is only ever passed to MessageBubble as senderColor/replyToColor,
  // and MessageBubble is a shared phone component that paints its bubbles
  // and quote rails from `colors`. Feeding it a kiosk-tuned accent while
  // everything around it inside the bubble is app-palette would make the
  // sender tint disagree with the bubble it tints. The kiosk palette owns
  // this tab's CHROME (sidebar, banners, input); the bubbles stay app.
  const accentColor = useCallback((memberId: string) => {
    const m = memberMap[memberId];
    if (!m) return colors.primary;
    return m.role === 'parent' ? (colors.parent ?? colors.primary) : (colors.kid ?? colors.accent);
  }, [memberMap, colors]);

  // Same access rules the phone's ChatScreen.tsx applies — reusing the
  // exact same buildGroupChannels() derivation (maternal/paternal/grand-
  // squad split) rather than re-deriving a second, possibly-drifting copy
  // of that logic here.
  const entries: ChannelEntry[] = useMemo(() => {
    const parents = members.filter(m => m.role === 'parent');
    const viewerGpSide: 'a' | 'b' | 'unlinked' | null = (() => {
      if (!isSenior) return null;
      if (!(active as any).linkedParentId) return 'unlinked';
      if ((active as any).linkedParentId === parents[0]?.id) return 'a';
      if ((active as any).linkedParentId === parents[1]?.id) return 'b';
      return 'unlinked';
    })();
    const groupChannels = buildGroupChannels(members)
      .filter(ch => ch.id !== 'all' || !isSenior)
      // Was `ch.id !== 'parents' || parentsCount > 2` — a fabricated
      // condition with no mobile counterpart (ChatScreen.tsx never filters
      // #parents-vault out of its channel list by parent count at all) and
      // no real security value: it happened to hide the channel from EVERY
      // viewer (including parents themselves) in any family with <=2
      // parents, while doing nothing to stop a KID from seeing it in a
      // family with 3+ parents — exactly backwards from what a lock gate
      // should do. Mobile's actual, only gate is role-based: `(ch as any)
      // .lock && !isParent` hides a locked channel from the sidebar
      // entirely for anyone who isn't a parent (ChatScreen.tsx:785), and a
      // parent who somehow still reaches it sees a full block screen
      // (ChatScreen.tsx:938, parentLocked). Match that exactly instead of
      // a parent-count heuristic.
      .filter(ch => !ch.lock || isParent)
      .filter(ch => !ch.seniorOnly || isSenior || isParent)
      .filter(ch => {
        if (!isSenior) return true;
        if (ch.id === 'seniors_a') return viewerGpSide === 'a' || viewerGpSide === 'unlinked';
        if (ch.id === 'seniors_b') return viewerGpSide === 'b';
        return true;
      })
      .map(ch => ({ id: ch.id, label: ch.label, isDM: false, lock: ch.lock }));

    const coParents = members.filter(m => m.role === 'parent' && m.id !== active.id);
    const kids = members.filter(m => (m.role === 'kid' || m.role === 'teen') && m.id !== active.id);
    const dmEntries: ChannelEntry[] = [...coParents, ...kids].map(m => ({
      id: dmChannelId(active.id, m.id),
      label: m.name.split(' ')[0],
      isDM: true,
      lock: false,
      otherMember: m,
    }));

    return [...groupChannels, ...dmEntries];
  }, [members, active, isParent, isSenior]);

  const [activeChannel, setActiveChannel] = useState<string>(entries[0]?.id ?? 'all');

  // ── @mention suggestions — real gap, kiosk had none at all
  // [confirmed via a full ChatScreen.tsx-vs-KioskChatTab.tsx feature diff:
  // "mentions" was flagged missing]. currentChannelMemberIds mirrors
  // ChatScreen.tsx's own derivation exactly (lines ~393-418) — scoped to
  // who's ACTUALLY in the open channel, same reasoning as that file's own
  // comment: mention-notify has no channel-membership check of its own,
  // so suggesting an out-of-channel member and sending would genuinely
  // notify someone with no access to the conversation. */
  const activeEntry = useMemo(() => entries.find(e => e.id === activeChannel), [entries, activeChannel]);
  const currentChannelMemberIds: string[] = useMemo(() => {
    if (activeEntry?.isDM) return [active.id, activeEntry.otherMember?.id].filter((id): id is string => !!id);
    if (activeChannel === 'parents') return members.filter(m => m.role === 'parent').map(m => m.id);
    if (activeChannel === 'seniors_all') return members.map(m => m.id);
    if (activeChannel === 'seniors_a' || activeChannel === 'seniors_b') {
      const parents = members.filter(m => m.role === 'parent');
      const sideForGp = (gp: any): 'a' | 'b' | 'unlinked' => {
        if (!gp.linkedParentId) return 'unlinked';
        if (gp.linkedParentId === parents[0]?.id) return 'a';
        if (gp.linkedParentId === parents[1]?.id) return 'b';
        return 'unlinked';
      };
      return members.filter(m => {
        if (m.role !== 'senior') return true;
        const side = sideForGp(m);
        const wantSide = activeChannel === 'seniors_a' ? 'a' : 'b';
        return side === wantSide || (side === 'unlinked' && wantSide === 'a');
      }).map(m => m.id);
    }
    return members.filter(m => m.role !== 'senior').map(m => m.id);
  }, [activeEntry, activeChannel, members, active.id]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const isGroupChannel = !activeEntry?.isDM;
  const everyoneEntry = { id: 'everyone', name: 'Everyone', emoji: '📣', role: 'group' };
  const mentionSuggestions = mentionQuery !== null
    ? [
        ...(isGroupChannel && 'everyone'.includes(mentionQuery.toLowerCase()) ? [everyoneEntry] : []),
        ...members.filter(m =>
          m.id !== active.id
          && currentChannelMemberIds.includes(m.id)
          && m.name.toLowerCase().includes(mentionQuery.toLowerCase())),
      ]
    : [];
  // token "@FirstName_idx" -> full "@[Name|id]" for send-time substitution.
  const pendingMentions = useRef<Record<string, string>>({});
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
  const insertMention = (member: { id: string; name: string }) => {
    const atIdx = text.lastIndexOf('@');
    const before = text.slice(0, atIdx);
    const firstName = member.name.split(' ')[0];
    const token = `@${firstName}`;
    pendingMentions.current[token] = `@[${member.name}|${member.id}]`;
    setText(before + token + ' ');
    setMentionQuery(null);
    inputRef.current?.focus();
  };
  // Tapping a card in the grid opens its conversation in a right-anchored
  // Modal drawer — the exact same shell KioskAskFamDrawer already uses
  // successfully, scrim included. Live-reported: earlier attempts either
  // kept the thread inline (deep in a non-Modal tree behind KioskHeader,
  // beside the nav rail, where Android's KeyboardAvoidingView participation
  // is unreliable) or sized the Modal's content to a measured, fixed-pixel
  // rect (which broke KeyboardAvoidingView's 'height' behavior — it shrinks
  // ITSELF to make room for the keyboard, and a fixed-height box has no
  // room to shrink into). Matching KioskAskFamDrawer's shape exactly — a
  // scrim, a fixed-width right-anchored panel at height:'100%' inside its
  // own KeyboardAvoidingView — sidesteps both problems at once, since
  // that's the one confirmed-working pattern in this codebase.
  const [threadOpen, setThreadOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');

  // Keyboard opening can leave the latest message behind it until the list
  // re-settles at its own end — same "scroll after layout, not during
  // render" pattern used elsewhere in this file.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvt, () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => show.remove();
  }, []);
  const [moderationWarning, setModerationWarning] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const [quickEmojiFor, setQuickEmojiFor] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  // ── Message search — real gap, kiosk had none at all [confirmed via a
  // full ChatScreen.tsx-vs-KioskChatTab.tsx feature diff: "search" was
  // flagged missing]. Same real filter/nav logic as ChatScreen.tsx's own
  // (lines ~93-96, ~328-330, ~913-947) — a case-insensitive text search
  // scoped to the OPEN channel, with a match counter and prev/next
  // navigation that scrolls + highlights, not a separate search screen.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  useEffect(() => { setSearchMatchIdx(0); }, [searchQuery]);
  useEffect(() => { if (!searchOpen) setSearchQuery(''); }, [searchOpen]);
  // Edit/grocery-convert/shared-card — ChatScreen.tsx's own editingMsg/
  // groceryMsg/sharedCardPayload state (lines 88, ~onAddGrocery/
  // onOpenSharedCard call sites), wired here instead of the no-op stubs
  // this tab previously shipped with (live audit finding: tapping "Edit,"
  // "Add to List," or a shared meal/event/quest card silently did nothing
  // on kiosk while working fully on mobile).
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [groceryMsg, setGroceryMsg] = useState<ChatMessage | null>(null);
  const [sharedCardPayload, setSharedCardPayload] = useState<any>(null);

  // ── Attachments ────────────────────────────────────────────────────────
  const [attachUri, setAttachUri] = useState<string | null>(null);
  const [attachType, setAttachType] = useState<'image' | 'video'>('image');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [videoLightboxUri, setVideoLightboxUri] = useState<string | null>(null);

  // ── Voice recording — same expo-audio flow as ChatScreen.tsx ─────────────
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [reviewUri, setReviewUri] = useState<string | null>(null);
  const [reviewDur, setReviewDur] = useState(0);
  const recordStartRef = useRef<number>(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_RECORD_SECS = 10;

  // Keep activeChannel valid if the entry list changes (role switch, etc.)
  useEffect(() => {
    if (!entries.some(e => e.id === activeChannel) && entries.length > 0) {
      setActiveChannel(entries[0].id);
    }
  }, [entries, activeChannel]);

  useEffect(() => {
    if (entries.length === 0) return;
    loadUnreadCounts(entries.map(e => e.id), active.id);
  }, [entries, active.id, loadUnreadCounts]);

  // Grid redesign: every card shows a real preview of its last few
  // messages, not just an unread count — so every entry's channel needs
  // loading up front rather than lazily on open (the store's usual
  // strategy, see chatStore.ts's own lastActivity comment). This does mean
  // one loadChannel() + one realtime subscription per visible channel/DM
  // the moment this tab mounts, which is more than the phone ever does at
  // once — accepted deliberately for kiosk's "glance at the grid" design,
  // since a family's channel/DM count is small enough (a handful) that
  // this is a one-time, one-screen cost, not a per-navigation one.
  useEffect(() => {
    entries.forEach(e => loadChannel(e.id));
    // Deliberately NOT re-run when `entries` identity changes on every
    // render (it's a useMemo, so this is really keyed on its own deps) —
    // only care about actual entry-list membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map(e => e.id).join(','), loadChannel]);

  useEffect(() => {
    if (!activeChannel) return;
    loadChannel(activeChannel);
    markChannelRead(activeChannel, active.id);
    setOpenChannelId(activeChannel);
    return () => setOpenChannelId(null);
  }, [activeChannel, active.id, loadChannel, markChannelRead, setOpenChannelId]);

  // Switching channels clears in-progress compose state — same reasoning as
  // ChatScreen.tsx's switchChannel: an in-flight reply/attachment/draft must
  // never leak into whichever channel is opened next.
  const switchChannel = (id: string) => {
    setActiveChannel(id);
    setThreadOpen(true);
    setReplyingTo(null);
    setAttachUri(null);
    setModerationWarning(false);
    setText('');
    setShowAttachMenu(false);
    setSearchOpen(false);
  };

  const rawMsgs = channels[activeChannel]?.messages ?? [];
  const currentEntry = entries.find(e => e.id === activeChannel);

  // Mark incoming messages read + load read receipts once rendered.
  useEffect(() => {
    if (!active.id || rawMsgs.length === 0) return;
    const unread = rawMsgs.filter(m => m.senderId !== active.id).map(m => m.id);
    if (unread.length > 0) markMessagesRead(activeChannel, unread, active.id);
    loadReadReceipts(activeChannel, rawMsgs.map(m => m.id));
  }, [activeChannel, rawMsgs.length, active.id]);

  // Same real filter ChatScreen.tsx's own msgs derivation uses — a search
  // query narrows what actually renders, not just what's highlighted.
  const msgs = searchQuery.trim()
    ? rawMsgs.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawMsgs;

  // Day-grouped, chronological (kiosk thread renders top-to-bottom, not
  // inverted like the phone's — same data, non-inverted list order).
  const dayItems = useMemo(() => {
    const items: DayGroup[] = [];
    let lastDay = '';
    for (const m of msgs) {
      const day = formatDay(m.timestamp);
      if (day !== lastDay) { items.push({ type: 'day', label: day }); lastDay = day; }
      items.push({ type: 'msg', msg: m });
    }
    return items;
  }, [msgs]);

  const scrollToQuotedMsg = (replyToId: string) => {
    const idx = dayItems.findIndex(it => it.type === 'msg' && it.msg.id === replyToId);
    if (idx < 0) return;
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightedMsgId(replyToId);
    setTimeout(() => setHighlightedMsgId(null), 2000);
  };

  // ── Send (text + optional attachment) — identical pipeline to
  // ChatScreen.handleSend: same moderation gate, same optimistic clear,
  // same post-send upload-then-patch-URL flow. ─────────────────────────────
  const send = async () => {
    const sourceText = text;
    if (!sourceText.trim() && !attachUri) return;

    if (sourceText.trim()) {
      const check = checkProfanity(sourceText);
      if (check.blocked) { setModerationWarning(true); return; }
    }
    setModerationWarning(false);

    // Same "edit" mechanism ChatScreen.tsx uses (ChatScreen.tsx:471) — there
    // is no true in-place edit anywhere in this data model; editing deletes
    // the original message and sends a new one with the updated text.
    if (editingMsg) { deleteMessage(activeChannel, editingMsg.id); setEditingMsg(null); }

    // Convert display tokens "@FirstName" back to storage format
    // "@[Name|id]" — same substitution ChatScreen.tsx's own handleSend
    // does (line ~484-489).
    let finalText = sourceText.trim();
    for (const [token, full] of Object.entries(pendingMentions.current)) {
      finalText = finalText.split(token).join(full);
    }
    pendingMentions.current = {};
    const localAttachUri = attachUri;
    const localAttachType = attachType;
    setText(''); setAttachUri(null); setReplyingTo(null); setMentionQuery(null);

    const sentMsgId = await sendMessage(activeChannel, active.id, finalText, localAttachUri ?? undefined, localAttachUri ? localAttachType : undefined, replyingTo ?? undefined);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    if (localAttachUri && sentMsgId) {
      try {
        const ext = localAttachType === 'video' ? 'mp4' : 'jpg';
        const fileName = `${localAttachType === 'video' ? 'videos' : 'images'}/${active.id}_${Date.now()}.${ext}`;
        const base64 = await FileSystem.readAsStringAsync(localAttachUri, { encoding: 'base64' as any });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        const CHUNK = 65536;
        for (let start = 0; start < binary.length; start += CHUNK) {
          const end = Math.min(start + CHUNK, binary.length);
          for (let i = start; i < end; i++) bytes[i] = binary.charCodeAt(i);
          if (end < binary.length) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const { error } = await supabase.storage.from('chat-media')
          .upload(fileName, bytes.buffer, { contentType: localAttachType === 'video' ? 'video/mp4' : 'image/jpeg' });
        if (!error) {
          const { data } = await supabase.storage.from('chat-media').createSignedUrl(fileName, 31_536_000);
          if (data?.signedUrl) {
            await supabase.from('chat_messages').update({ image_url: data.signedUrl }).eq('id', sentMsgId);
          }
        } else {
          console.warn('[KioskChatTab] image/video upload failed', error.message);
        }
      } catch (e) { console.warn('[KioskChatTab] image/video upload failed', e); }
    }
  };

  // ── Attachment pickers — identical to ChatScreen.tsx ──────────────────────
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
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const sentMsgId = await sendMessage(activeChannel, active.id, '', undefined, undefined, undefined, undefined, undefined, undefined, asset.uri, asset.name);
      if (!sentMsgId) return;
      try {
        const ext = asset.name?.includes('.') ? asset.name.split('.').pop() : undefined;
        const fileName = `documents/${active.id}_${Date.now()}${ext ? `.${ext}` : ''}`;
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' as any });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        const CHUNK = 65536;
        for (let start = 0; start < binary.length; start += CHUNK) {
          const end = Math.min(start + CHUNK, binary.length);
          for (let i = start; i < end; i++) bytes[i] = binary.charCodeAt(i);
          if (end < binary.length) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const { error } = await supabase.storage.from('chat-media')
          .upload(fileName, bytes.buffer, { contentType: asset.mimeType ?? 'application/octet-stream' });
        if (!error) {
          const { data } = await supabase.storage.from('chat-media').createSignedUrl(fileName, 31_536_000);
          if (data?.signedUrl) {
            await supabase.from('chat_messages').update({ document_url: data.signedUrl }).eq('id', sentMsgId);
          }
        }
      } catch (e) { console.warn('[KioskChatTab] document upload failed', e); }
    } catch {
      Alert.alert('Could not open document picker');
    }
  }, [activeChannel, active.id, sendMessage]);

  const sendLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Location permission required'); return; }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const address = geo
        ? [geo.name, geo.street, geo.city, geo.region].filter(Boolean).join(', ')
        : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      sendMessage(activeChannel, active.id, '', undefined, undefined, undefined, undefined, { address, lat, lng });
    } catch {
      Alert.alert('Could not get location', 'Please try again.');
    }
  }, [activeChannel, active.id, sendMessage]);

  // ── Voice recording — identical flow to ChatScreen.tsx ────────────────────
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

  const discardVoice = () => { setReviewing(false); setReviewUri(null); setReviewDur(0); };

  const sendVoiceNote = async () => {
    if (!reviewUri) return;
    const localUri = reviewUri; const dur = reviewDur;
    setReviewing(false); setReviewUri(null); setReviewDur(0);
    const sentMsgId = await sendMessage(activeChannel, active.id, '', undefined, undefined, undefined, dur, undefined, localUri);
    if (!sentMsgId) return;
    try {
      const fileName = `voice/${active.id}_${Date.now()}.mp4`;
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' as any });
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      const CHUNK = 65536;
      for (let start = 0; start < binary.length; start += CHUNK) {
        const end = Math.min(start + CHUNK, binary.length);
        for (let i = start; i < end; i++) bytes[i] = binary.charCodeAt(i);
        if (end < binary.length) await new Promise(resolve => setTimeout(resolve, 0));
      }
      const { error } = await supabase.storage.from('chat-media').upload(fileName, bytes.buffer, { contentType: 'audio/mp4' });
      if (!error) {
        const { data } = await supabase.storage.from('chat-media').createSignedUrl(fileName, 31_536_000);
        if (data?.signedUrl) {
          await supabase.from('chat_messages').update({ voice_url: data.signedUrl }).eq('id', sentMsgId);
        }
      }
    } catch (e) { console.warn('[KioskChatTab] voice upload failed', e); }
  };

  const canSend = text.trim().length > 0 || attachUri !== null;

  // Hold the idle lock while any chat modal is open, and while a voice
  // note is actually being recorded or reviewed. Recording is the sharpest
  // case: it involves no touches at all by definition, so a long note
  // could previously run straight into the idle timeout. Every one of
  // these renders into its own native Modal (or, for recording, involves
  // no touch), so none of them reach KioskScreen's root onTouchStart.
  // threadOpen joins this list now that the conversation itself is a
  // Modal too — reading a longer thread with few taps must not silently
  // count as inactivity and lock the kiosk mid-read.
  useKioskLockSuspended(
    threadOpen || !!quickEmojiFor || !!actionMsg || !!lightboxUri || !!videoLightboxUri ||
    !!groceryMsg || !!sharedCardPayload || recording || reviewing,
  );

  return (
    <View style={s.root}>
      {/* ── Channel/DM grid — replaces the old sidebar list. Each card is a
          preview: name, lock/unread badges, and up to 5 most recent
          messages (sender + truncated text), so a glance at the grid tells
          you what's being discussed without opening anything. Tapping a
          card opens the full conversation as an overlay sheet, same
          pattern as Ask Fam/Ask Cube. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
        <ScrollView
          ref={gridScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.grid}
          keyboardShouldPersistTaps="handled"
        >
          {/* One flowing grid, 2 cards per row throughout — reverted from
              a Channels/DM two-column split [live-requested: "dont
              separate anything just try to adjust grids with available
              previews"]. Radius/sizing still match Overview's own card
              convention (KIOSK_RADIUS.sm, 2-per-row). */}
          <Text style={[s.gridSectionLabel, { color: k.textFaint }]}>CHANNELS</Text>
          <View style={s.gridRow}>
            {entries.filter(e => !e.isDM).map(e => (
              <ChatPreviewCard
                key={e.id}
                entry={e}
                unread={unreadCounts[e.id] ?? 0}
                messages={channels[e.id]?.messages ?? []}
                memberMap={memberMap}
                selfId={active.id}
                k={k}
                onPress={() => switchChannel(e.id)}
                onQuickSend={(text) => sendMessage(e.id, active.id, text)}
                scrollRef={gridScrollRef}
              />
            ))}
          </View>

          {entries.some(e => e.isDM) && (
            <Text style={[s.gridSectionLabel, { color: k.textFaint, marginTop: KIOSK_SPACE.lg }]}>DIRECT MESSAGES</Text>
          )}
          <View style={s.gridRow}>
            {entries.filter(e => e.isDM).map(e => (
              <ChatPreviewCard
                key={e.id}
                entry={e}
                unread={unreadCounts[e.id] ?? 0}
                messages={channels[e.id]?.messages ?? []}
                memberMap={memberMap}
                selfId={active.id}
                k={k}
                onPress={() => switchChannel(e.id)}
                onQuickSend={(text) => sendMessage(e.id, active.id, text)}
                scrollRef={gridScrollRef}
              />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Message thread — opens as a narrow right-anchored Modal drawer,
          the exact same shell KioskAskFamDrawer already uses successfully:
          a dimming scrim over the grid, a fixed-width panel pinned to the
          right edge, full height. Tap a card in the grid, its conversation
          slides in from the right, same as tapping the header's Ask Fam
          button. This also carries over that drawer's Android keyboard fix
          for free — KeyboardAvoidingView's 'height' behavior can shrink the
          panel because it's height:'100% of the KeyboardAvoidingView', not
          a fixed pixel box computed from a pre-keyboard measurement (an
          earlier version tried sizing this drawer to the grid's own
          measured rect, which left no room for the panel to shrink into
          and broke the keyboard fix again). */}
      <Modal visible={threadOpen} transparent animationType="slide" onRequestClose={() => setThreadOpen(false)}>
        <KioskModalHost style={s.threadHost}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim }]}
            onPress={() => setThreadOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close chat"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={s.threadRight}
            pointerEvents="box-none"
          >
            <View style={s.threadShadowWrap}>
            <View style={[s.threadPanel, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
              <View style={s.threadHead}>
                <Pressable
                  onPress={() => setThreadOpen(false)}
                  hitSlop={12}
                  style={[s.threadCloseBtn, { backgroundColor: k.well }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close chat"
                >
                  <X size={20} color={k.textMuted} />
                </Pressable>
                <Text style={[s.title, { color: k.text, flex: 1 }]} numberOfLines={1}>
              {currentEntry?.label ?? 'Chat'}
            </Text>
            {currentEntry?.lock && (
              <Chip label="Private" accent={k.purple} isDark={kioskDark} k={k} />
            )}
            {/* Message search — real gap, kiosk had none at all
                [confirmed via a full ChatScreen.tsx-vs-KioskChatTab.tsx
                feature diff: "search" was flagged missing;
                live-requested: "chat sesrch is the one i need"]. Same
                real toggle/filter/match-nav ChatScreen.tsx's own search
                bar uses. */}
            <Pressable
              onPress={() => setSearchOpen(o => !o)}
              hitSlop={10}
              style={[s.threadSearchBtn, { backgroundColor: searchOpen ? k.primary + '18' : k.well, borderColor: searchOpen ? k.primary : k.cardBorder }]}
              accessibilityRole="button"
              accessibilityLabel={searchOpen ? 'Close search' : 'Search messages'}
            >
              {searchOpen ? <X size={16} color={k.primary} /> : <Search size={16} color={k.textMuted} />}
            </Pressable>
          </View>

          {searchOpen && (
            <View style={[s.threadSearchRow, { backgroundColor: k.well, borderColor: k.cardBorder }]}>
              <Search size={14} color={k.textFaint} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search messages…"
                placeholderTextColor={k.textFaint}
                style={[s.threadSearchInput, { color: k.text }]}
                autoFocus
              />
              {searchQuery.length > 0 && msgs.length > 0 && (
                <>
                  <Text style={[s.threadSearchCount, { color: k.textFaint }]}>
                    {searchMatchIdx + 1}/{msgs.length}
                  </Text>
                  <Pressable
                    onPress={() => {
                      const next = (searchMatchIdx - 1 + msgs.length) % msgs.length;
                      setSearchMatchIdx(next);
                      const idx = dayItems.findIndex(it => it.type === 'msg' && it.msg.id === msgs[next].id);
                      if (idx >= 0) {
                        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
                        setHighlightedMsgId(msgs[next].id);
                        setTimeout(() => setHighlightedMsgId(null), 2000);
                      }
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Previous match"
                  >
                    <ChevronLeft size={18} color={k.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const next = (searchMatchIdx + 1) % msgs.length;
                      setSearchMatchIdx(next);
                      const idx = dayItems.findIndex(it => it.type === 'msg' && it.msg.id === msgs[next].id);
                      if (idx >= 0) {
                        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
                        setHighlightedMsgId(msgs[next].id);
                        setTimeout(() => setHighlightedMsgId(null), 2000);
                      }
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Next match"
                  >
                    <ChevronRight size={18} color={k.primary} />
                  </Pressable>
                </>
              )}
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                  <XCircle size={16} color={k.textFaint} />
                </Pressable>
              )}
            </View>
          )}

          <View style={{ flex: 1 }}>
            <FlatList
              ref={listRef}
              data={dayItems}
              keyExtractor={(item, i) => item.type === 'day' ? `day-${i}` : item.msg.id}
              contentContainerStyle={s.list}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                listRef.current?.scrollToOffset({ offset: index * (averageItemLength || 80), animated: false });
                setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 200);
              }}
              renderItem={({ item, index }) => {
                if (item.type === 'day') {
                  return (
                    <View style={s.dayRow}>
                      <View style={[s.dayLine, { backgroundColor: k.cardBorder }]} />
                      <Text style={[s.dayLabel, { color: k.textFaint }]} numberOfLines={1}>{item.label}</Text>
                      <View style={[s.dayLine, { backgroundColor: k.cardBorder }]} />
                    </View>
                  );
                }
                const msg = item.msg;
                const isMe = msg.senderId === active.id;
                const sender = memberMap[msg.senderId];
                // Non-inverted, chronological list: older item is at index-1, newer at index+1.
                const olderItem = index > 0 ? dayItems[index - 1] : null;
                const newerItem = index < dayItems.length - 1 ? dayItems[index + 1] : null;
                const olderMsg = olderItem?.type === 'msg' ? olderItem.msg : null;
                const newerMsg = newerItem?.type === 'msg' ? newerItem.msg : null;
                const isGroupFirst = !olderMsg || olderMsg.senderId !== msg.senderId;
                const isGroupLast = !newerMsg || newerMsg.senderId !== msg.senderId;
                return (
                  <MessageBubble
                    msg={msg} isMe={isMe}
                    isGroupFirst={isGroupFirst} isGroupLast={isGroupLast}
                    senderName={sender?.name?.split(' ')[0] ?? 'Removed member'}
                    senderEmoji={sender?.emoji ?? '👤'}
                    senderColor={accentColor(msg.senderId)}
                    replyToColor={msg.replyTo ? accentColor(msg.replyTo.senderId) : undefined}
                    activeMemberId={active.id}
                    memberMap={memberMap}
                    searchQuery={searchQuery}
                    isParent={isParent}
                    colors={colors} isDark={isDark}
                    highlighted={highlightedMsgId === msg.id}
                    readers={isMe && !currentEntry?.isDM
                      ? (readReceipts[msg.id] ?? []).filter(id => id !== active.id) : []}
                    onLongPress={() => setActionMsg(msg)}
                    onDoubleTap={() => setQuickEmojiFor(msg)}
                    onSwipeRight={() => { setReplyingTo(msg); inputRef.current?.focus(); }}
                    onQuoteTap={msg.replyTo ? () => scrollToQuotedMsg(msg.replyTo!.id) : undefined}
                    onOpenImage={setLightboxUri}
                    onOpenVideo={setVideoLightboxUri}
                    onOpenSharedCard={setSharedCardPayload}
                    onRetry={() => retryMessage(activeChannel, msg.id)}
                  />
                );
              }}
              ListEmptyComponent={
                <Text style={[s.empty, { color: k.textFaint }]} numberOfLines={2}>
                  {searchQuery.trim() ? `No results for "${searchQuery}"` : 'No messages yet — say hi 👋'}
                </Text>
              }
            />
          </View>

          {/* ── Moderation warning ── */}
          {moderationWarning && (
            <View style={[s.banner, { backgroundColor: k.dangerSoft, borderTopColor: k.danger }]}>
              <Text style={{ fontSize: 16 }}>🙏</Text>
              <Text style={[s.bannerText, { color: k.danger }]} numberOfLines={2}>
                Let's keep it kind — that message wasn't sent.
              </Text>
              <Pressable onPress={() => setModerationWarning(false)} hitSlop={10}
                accessibilityRole="button" accessibilityLabel="Dismiss warning">
                <X size={18} color={k.danger} />
              </Pressable>
            </View>
          )}

          {/* ── Edit banner — same amber "Editing: ..." bar ChatScreen.tsx
              shows (ChatScreen.tsx:1146-1153) ── */}
          {editingMsg && (
            <View style={[s.banner, { backgroundColor: k.goldSoft, borderTopColor: k.gold }]}>
              <Pencil size={16} color={k.gold} />
              <Text style={[s.bannerText, { color: k.textMuted, fontWeight: '600' }]} numberOfLines={1}>
                Editing: {editingMsg.text}
              </Text>
              <Pressable onPress={() => { setEditingMsg(null); setText(''); }} hitSlop={10}
                accessibilityRole="button" accessibilityLabel="Cancel editing">
                <X size={18} color={k.textFaint} />
              </Pressable>
            </View>
          )}

          {/* ── Reply banner — quote preview above the input ── */}
          {replyingTo && (
            <View style={[s.banner, { backgroundColor: k.well, borderTopColor: k.cardBorder }]}>
              <CornerUpLeft size={18} color={k.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.bannerText, { color: k.primary }]} numberOfLines={1}>
                  Reply to {memberMap[replyingTo.senderId]?.name?.split(' ')[0]}
                </Text>
                <Text style={{ fontSize: TYPO.body, color: k.textMuted }} numberOfLines={1}>
                  {replyingTo.text ||
                    (replyingTo.voiceUri ? REPLY_KIND_LABEL.voice
                      : replyingTo.mediaType === 'video' ? REPLY_KIND_LABEL.video
                      : replyingTo.imageUri ? REPLY_KIND_LABEL.image
                      : replyingTo.documentUri ? REPLY_KIND_LABEL.document
                      : replyingTo.locationPin ? REPLY_KIND_LABEL.location
                      : '')}
                </Text>
              </View>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={10}
                accessibilityRole="button" accessibilityLabel="Cancel reply">
                <X size={20} color={k.textFaint} />
              </Pressable>
            </View>
          )}

          {/* ── Attachment preview ── */}
          {attachUri && (
            <View style={[s.banner, { backgroundColor: k.well, borderTopColor: k.cardBorder }]}>
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: attachUri }} style={{ width: 64, height: 64, borderRadius: 12 }} resizeMode="cover" />
                {attachType === 'video' && (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Video size={18} color="#fff" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: k.text }} numberOfLines={1}>
                  {attachType === 'video' ? '🎥 Video clip (≤10s)' : '🖼️ Image'}
                </Text>
              </View>
              <Pressable onPress={() => setAttachUri(null)} style={{ padding: 6 }} hitSlop={10}
                accessibilityRole="button" accessibilityLabel="Remove attachment">
                <XCircle size={22} color={k.textFaint} />
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

          {/* ── Attach menu popup ── */}
          {showAttachMenu && (
            <View style={[s.attachMenu, { backgroundColor: k.card, borderColor: k.cardBorderStrong }, kioskElevation(k.primary, kioskDark, 2)]}>
              {([
                { Icon: Camera, label: 'Camera', color: k.purple, onPress: () => { setShowAttachMenu(false); pickCamera(); } },
                { Icon: ImageIcon, label: 'Photo', color: k.sage, onPress: () => { setShowAttachMenu(false); pickImage(); } },
                { Icon: Video, label: 'Video', color: k.danger, onPress: () => { setShowAttachMenu(false); recordVideo(); } },
                { Icon: FileText, label: 'Document', color: k.gold, onPress: () => { setShowAttachMenu(false); sendDocument(); } },
                { Icon: MapPin, label: 'Location', color: k.blue, onPress: () => { setShowAttachMenu(false); sendLocation(); } },
              ] as { Icon: LucideIcon; label: string; color: string; onPress: () => void }[]).map(item => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [s.attachItem, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View style={[s.attachIcon, { backgroundColor: item.color + (kioskDark ? '24' : '1A') }]}>
                    <item.Icon size={24} color={item.color} />
                  </View>
                  <Text style={[s.attachLabel, { color: k.textMuted }]} numberOfLines={1}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Mention picker — grows upward from just above the input,
              same real ChatScreen.tsx feature/behavior at kiosk scale. */}
          {mentionSuggestions.length > 0 && (
            <View style={[s.mentionPicker, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
              {mentionSuggestions.map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => insertMention(m)}
                  style={({ pressed }) => [
                    s.mentionRow,
                    i < mentionSuggestions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: k.cardBorder },
                    pressed && { backgroundColor: k.cardHover },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Mention ${m.name}`}
                >
                  <KioskAvatar
                    name={m.name}
                    emoji={(m as any).emoji}
                    avatarUrl={(m as any).avatarUrl}
                    siblings={members.filter(x => x.id !== m.id).map(x => x.name)}
                    size={36}
                    bgColor={k.primary + '22'}
                    k={k}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.mentionName, { color: k.text }]} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                    <Text style={[s.mentionRole, { color: k.textMuted }]} numberOfLines={1}>{(m as any).role}</Text>
                  </View>
                  <Text style={[s.mentionHint, { color: k.primary }]}>tap to mention</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Input bar ── */}
          {!reviewing && !recording && (
            <View style={[s.inputRow, { backgroundColor: k.card, borderColor: k.cardBorder }]}>
              <Pressable onPress={() => setShowAttachMenu(v => !v)} style={s.iconBtn} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Attach a photo, video, document or location"
                accessibilityState={{ expanded: showAttachMenu }}>
                <Paperclip size={22} color={k.textMuted} />
              </Pressable>
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={handleTextChange}
                placeholder={currentEntry?.isDM ? `Message ${currentEntry.label}…` : 'Message the family…'}
                placeholderTextColor={k.textFaint}
                style={[s.input, { color: k.text }]}
                onFocus={registerActivity}
                onSubmitEditing={send}
                returnKeyType="send"
                multiline
                maxLength={1000}
              />
              {canSend ? (
                <Pressable
                  onPress={send}
                  style={({ pressed }) => [s.sendBtn, { backgroundColor: k.primary }, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button" accessibilityLabel="Send message">
                  <Send size={20} color={k.onPrimary} />
                </Pressable>
              ) : (
                <Pressable onPress={startRecording} style={s.iconBtn} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel="Record a voice note">
                  <Mic size={24} color={k.textMuted} />
                </Pressable>
              )}
            </View>
          )}
            </View>
            </View>
          </KeyboardAvoidingView>
        </KioskModalHost>
      </Modal>

      {/* ── Quick emoji (double-tap) ── */}
      <Modal visible={!!quickEmojiFor} transparent animationType="fade" onRequestClose={() => setQuickEmojiFor(null)}>
        {/* KioskModalHost, not just the useKioskLockSuspended above: a
            native Modal renders in its own window, so touches inside it
            never reach KioskScreen's root onTouchStart. The suspension
            holds the lock off; this makes each tap count as real activity
            so the idle timer restarts properly on dismiss. */}
        <KioskModalHost>
          <Pressable
            style={[s.modalOverlay, { backgroundColor: k.scrim }]}
            onPress={() => setQuickEmojiFor(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss reaction picker"
          >
            <View style={[s.emojiPicker, { backgroundColor: k.card, borderColor: k.cardBorderStrong }, kioskElevation(k.primary, kioskDark, 2)]}>
              {QUICK_REACTIONS.map(e => (
                <Pressable
                  key={e}
                  onPress={() => {
                    if (quickEmojiFor) addReaction(activeChannel, quickEmojiFor.id, e, active.id);
                    setQuickEmojiFor(null);
                  }}
                  style={({ pressed }) => [s.emojiBtn, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${e}`}
                >
                  <Text style={{ fontSize: 32 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </KioskModalHost>
      </Modal>

      {/* ── Long-press action sheet — reply / copy / edit / delete / react ── */}
      <MessageActionSheet
        visible={!!actionMsg} msg={actionMsg}
        isMe={actionMsg?.senderId === active.id}
        // Same 60s edit window ChatScreen.tsx applies (ChatScreen.tsx:1322)
        // — was hardcoded false, so no message could ever be edited on
        // kiosk regardless of age or sender. MessageActionSheet itself
        // already gates on `isMe && canEdit` internally, so this prop
        // correctly omits its own isMe check, matching mobile exactly.
        canEdit={!!actionMsg && (Date.now() - new Date(actionMsg.timestamp).getTime()) < 60_000}
        colors={colors} isDark={isDark}
        onClose={() => setActionMsg(null)}
        onReact={emoji => { if (actionMsg) addReaction(activeChannel, actionMsg.id, emoji, active.id); }}
        onReply={() => { if (actionMsg) { setReplyingTo(actionMsg); inputRef.current?.focus(); } }}
        onCopy={() => { if (actionMsg?.text) { Clipboard.setString(actionMsg.text); showToast('Copied!'); } }}
        onEdit={() => { if (actionMsg) { setEditingMsg(actionMsg); setText(actionMsg.text); inputRef.current?.focus(); } }}
        onDelete={() => { if (actionMsg) deleteMessage(activeChannel, actionMsg.id); }}
        onAddGrocery={() => { if (actionMsg) setGroceryMsg(actionMsg); }}
      />

      {/* ── Shared card detail (read-only) — ChatScreen.tsx:1295-1300 ── */}
      <AskCubeRecipeSheet
        visible={!!sharedCardPayload}
        data={sharedCardPayload?.data ?? null}
        chefName={sharedCardPayload?.data?.chefId ? members.find(m => m.id === sharedCardPayload.data.chefId)?.name : undefined}
        onClose={() => setSharedCardPayload(null)}
      />

      {/* ── Grocery modal — "Add to List" from a message, ChatScreen.tsx:1334-1347 ── */}
      <GroceryModal
        visible={!!groceryMsg}
        initialName={groceryMsg?.text ?? ''}
        onClose={() => setGroceryMsg(null)}
        onAdd={item => {
          if (!active.familyId) return;
          addGrocery({ ...item, familyId: active.familyId, addedBy: active.id });
          showToast(`"${item.name}" added to the shopping list.`);
        }}
      />

      {/* ── Image lightbox ── */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={s.lightbox} onPress={() => setLightboxUri(null)}>
          {lightboxUri && (
            <Image source={{ uri: lightboxUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          )}
          <Pressable onPress={() => setLightboxUri(null)} style={s.lightboxClose}
            accessibilityRole="button" accessibilityLabel="Close image">
            <X size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Video lightbox — kiosk has no dedicated video component of its
          own; reuses the same expo-video player inline since MessageBubble's
          thumbnail already depends on expo-video too. */}
      <VideoLightbox uri={videoLightboxUri} onClose={() => setVideoLightboxUri(null)} />
    </View>
  );
}

// Split into its own component so useVideoPlayer (a hook) is only ever
// called while a URI is actually set — same lifecycle ChatScreen.tsx's
// inline useVideoPlayer(videoLightboxUri, ...) gets away with because it's
// a top-level hook there; here it's scoped to its own small component so it
// doesn't need to sit at KioskChatTab's top level for a rarely-open modal.
function VideoLightbox({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const player = useVideoPlayer(uri, pl => { pl.loop = false; pl.play(); });
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.videoLightbox}>
        <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="contain" nativeControls />
        <Pressable onPress={onClose} style={s.lightboxClose}>
          <X size={24} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

// A card's preview line for one message — same non-text labels
// REPLY_KIND_LABEL already gives the reply-quote banner, so a photo/voice/
// document/location message previews consistently everywhere in this tab
// rather than showing raw empty text.
function messagePreviewText(msg: ChatMessage): string {
  if (msg.systemEvent) return '📎 Shared card';
  if (msg.imageUri) return REPLY_KIND_LABEL[msg.mediaType === 'video' ? 'video' : 'image'];
  if (msg.voiceUri) return REPLY_KIND_LABEL.voice;
  if (msg.documentUri) return REPLY_KIND_LABEL.document;
  if (msg.locationPin) return REPLY_KIND_LABEL.location;
  // Raw storage-format mention tokens ("@[Name|id]") were printing
  // literally in the preview [live-reported screenshot:
  // "@[Everyone|everyone]" shown verbatim] — same real stripMentionBrackets
  // helper MessageBubble/ChatScreen already use to display these.
  return stripMentionBrackets(msg.text || '');
}

// Bumped from 5 to 10 — the preview container's own minHeight was
// increased to match [live-requested: "in crease the height of preview
// container to fit 10 msgs"].
const PREVIEW_COUNT = 10;

function ChatPreviewCard({ entry, unread, messages, memberMap, selfId, k, onPress, onQuickSend, style, scrollRef }: {
  entry: ChannelEntry;
  unread: number;
  messages: ChatMessage[];
  memberMap: Record<string, FamilyMember>;
  selfId: string;
  k: any;
  onPress: () => void;
  /** Send a text-only message straight from the card, no full thread
   * needed — a small persistent input, not a second full-fledged chat
   * window [live-requested: "make sure we have the small quick chat text
   * not full fledged window just for sending quick chat" / "like gcaht on
   * the gamil"]. */
  onQuickSend: (text: string) => void;
  /** Overrides the card's own layout, if a caller ever needs to. */
  style?: any;
  /** The outer grid's own ScrollView ref — measured against on focus so
   * the card scrolls into view above the keyboard [live-requested: "when
   * keyboard open puh the page to view the text input"]. */
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  // Chronological, oldest-to-newest — latest message at the bottom, same
  // real-chat reading order every actual thread view uses
  // [live-requested: "hwo the order of message also proper like latest
  // to be bottom"]. Was reversed, putting the newest message at the TOP
  // of the preview list instead.
  const recent = useMemo(() => messages.slice(-PREVIEW_COUNT), [messages]);
  const [draft, setDraft] = useState('');
  const cardRef = useRef<View>(null);
  const quickInputRef = useRef<TextInput>(null);
  const scrollToCard = () => {
    const cardHandle = findNodeHandle(cardRef.current);
    const scrollHandle = findNodeHandle(scrollRef?.current ?? null);
    if (!cardHandle || !scrollHandle) return;
    UIManager.measureLayout(
      cardHandle, scrollHandle,
      () => {},
      (_x, y) => scrollRef?.current?.scrollTo({ y: Math.max(y - 40, 0), animated: true }),
    );
  };
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onQuickSend(text);
    setDraft('');
  };
  return (
    <Pressable
      ref={cardRef}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: pressed ? k.cardHover : k.card, borderColor: k.cardBorder },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${entry.isDM ? 'Direct message with ' : ''}${entry.label}${unread > 0 ? `, ${unread} unread` : ''}`}
    >
      <View style={s.cardHeadRow}>
        {entry.isDM
          ? (
            <KioskAvatar
              name={entry.otherMember?.name ?? entry.label}
              emoji={entry.otherMember?.emoji}
              avatarUrl={entry.otherMember?.avatarUrl}
              size={18}
              k={k}
            />
          )
          : entry.lock && <Lock size={15} color={k.textFaint} />}
        <Text style={[s.cardTitle, { color: k.text }]} numberOfLines={1}>{entry.label}</Text>
        {unread > 0 && (
          <View style={[s.unreadDot, { backgroundColor: k.danger }]}>
            <Text style={[s.unreadDotText, { color: k.onAccent }]}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </View>

      <View style={s.cardPreviewList}>
        {recent.length === 0 ? (
          <Text style={[s.cardEmpty, { color: k.textFaint }]}>No messages yet</Text>
        ) : (
          recent.map(msg => {
            const sender = memberMap[msg.senderId];
            const isSelf = msg.senderId === selfId;
            // Direction, not a repeated name label — a real chat's own
            // left/right split (self right-aligned, no "You:" prefix;
            // others get a small avatar instead of a text name)
            // [live-requested: "ive to show the direrection sides as
            // well like is me or oteher same like chat" / "we dont need
            // that you right" / "else show avarars which is better"].
            // Mirrors MessageBubble's own left/right + avatar convention.
            // Real mini bubbles now — a filled, padded, rounded shape per
            // message instead of bare floating text [live-reported: "no
            // paddings and no buble" against the plain-text version].
            // Self gets a tinted fill (k.primary wash), others a neutral
            // well fill, same self-vs-other distinction MessageBubble
            // itself makes, just simplified for preview scale.
            return (
              <View key={msg.id} style={[s.cardPreviewRow, isSelf && s.cardPreviewRowSelf]}>
                {!isSelf && (
                  <KioskAvatar
                    name={(sender as any)?.name ?? 'Family member'}
                    emoji={(sender as any)?.emoji}
                    avatarUrl={(sender as any)?.avatarUrl}
                    size={13}
                    k={k}
                  />
                )}
                <View
                  style={[
                    s.cardPreviewBubble,
                    isSelf
                      ? { backgroundColor: k.primary + '1A', borderTopRightRadius: 3 }
                      : { backgroundColor: k.well, borderTopLeftRadius: 3 },
                  ]}
                >
                  <Text style={[s.cardPreviewText, { color: k.text }]} numberOfLines={2}>
                    {messagePreviewText(msg)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Quick-send row — nested inside the card's own Pressable. RN's
          Pressable already claims/stops propagation of its own taps
          correctly (a press on the TextInput or the send button below
          resolves to THAT element, not the outer card's onPress) without
          needing a manual onStartShouldSetResponderCapture — that capture
          handler was actually the bug: claiming the touch at the parent
          during the CAPTURE phase before it ever reached the send button's
          own Pressable underneath it, so the button never registered a
          real press at all [live-reported: "send button on pevie is not
          sending message"]. Text only, no attachments/voice/reactions —
          those stay real actions inside the full thread this card still
          opens on its own tap elsewhere. */}
      <View style={[s.cardQuickSendRow, { borderTopColor: k.cardBorder }]}>
        <TextInput
          ref={quickInputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder="Quick message…"
          placeholderTextColor={k.textFaint}
          style={[s.cardQuickSendInput, { color: k.text, backgroundColor: k.well, borderColor: k.cardBorder }]}
          returnKeyType="send"
          onSubmitEditing={send}
          blurOnSubmit={false}
          onFocus={() => requestAnimationFrame(scrollToCard)}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim()}
          style={({ pressed }) => [
            s.cardQuickSendBtn,
            { backgroundColor: draft.trim() ? k.primary : k.well, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Send message to ${entry.label}`}
        >
          <Send size={15} color={draft.trim() ? k.onPrimary : k.textFaint} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  grid: { padding: KIOSK_SPACE.sm, gap: KIOSK_SPACE.sm },
  gridSectionLabel: { fontSize: KIOSK_TYPO.sectionLabel, fontWeight: '800', letterSpacing: 1.2, marginBottom: KIOSK_SPACE.xs, marginLeft: 4 },
  // 2 per row, always — a percentage flexBasis instead of the old fixed
  // 280px width, which let 3-4+ cards fit per row on a wide kiosk screen
  // [live-requested: "we can keep the 2 widgets for a row"].
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: KIOSK_SPACE.sm },
  // Cards are the primary navigation on this tab now — sized well above the
  // kiosk touch floor since each one carries a preview, not just a label.
  // Radius matches every other kiosk card (WidgetCard's own KIOSK_RADIUS.sm)
  // instead of the rounder .lg this tab used alone [live-requested:
  // "follwo the same radious of cards like other in over view"].
  // maxWidth caps this at the same share flexBasis targets — without it,
  // flexGrow let a lone card sitting alone in its own row (an odd count,
  // or just one channel/DM) stretch to fill the WHOLE row's width instead
  // of staying the same size as every other card [live-reported
  // screenshot: "#all-family" and a lone DM both full-width while
  // 2-per-row rows stayed correctly sized — "i still see faily channels
  // have full wodth and the lat chat also have full width" / "and keep
  // all of then in same size dont strech to full woddth"].
  // minHeight raised to comfortably fit 10 preview rows (up to 2 lines
  // each) instead of the old 5-message-sized card [live-requested: "in
  // crease the height of preview container to fit 10 msgs"].
  card: {
    flexBasis: '48%', flexGrow: 1, maxWidth: '48%', minWidth: 280, minHeight: 340,
    borderRadius: KIOSK_RADIUS.sm, borderWidth: 1,
    padding: KIOSK_SPACE.sm, gap: 6,
  },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  dmEmoji: { fontSize: 18 },
  unreadDot: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadDotText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  // flex:1 so this list fills the card's remaining space, pushing the
  // quick-send row down to sit flush against the card's own bottom edge
  // regardless of how many/few messages are showing [live-requested:
  // "quick message txt box should stick to footer of previre window"].
  cardPreviewList: { flex: 1, gap: 3 },
  // Wraps up to 2 lines now instead of truncating at 1 [live-requested:
  // "text should show wrapped if the message is lengthy in the
  // preview"] — flex-start (not center) so the avatar sits at the top of
  // a wrapped 2-line message instead of vertically centering oddly.
  cardPreviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  // Self rows drop the leading avatar and right-align the text instead —
  // no repeated "You:" label, matching MessageBubble's own self-on-the-
  // right convention at preview scale.
  cardPreviewRowSelf: { justifyContent: 'flex-end' },
  cardPreviewAvatar: { fontSize: 13, marginTop: 1 },
  // Real bubble shape — filled, padded, rounded, capped to 85% of the row
  // so every wrapped line aligns against the same edge rather than each
  // line shrinking to its own intrinsic width [live-reported: "no
  // paddings and no buble" / "fix the text foing on the other direction
  // is me whoever sends long text"].
  cardPreviewBubble: {
    maxWidth: '85%', borderRadius: KIOSK_RADIUS.sm,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 6,
  },
  cardPreviewText: { fontSize: KIOSK_TYPO.micro },
  // Quick-send row at the foot of each preview card.
  cardQuickSendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, paddingTop: KIOSK_SPACE.xs, borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardQuickSendInput: {
    flex: 1, fontSize: KIOSK_TYPO.caption, borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 6,
  },
  cardQuickSendBtn: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  cardEmpty: { fontSize: KIOSK_TYPO.micro, fontStyle: 'italic' },

  // The thread opens as a narrow right-anchored Modal drawer — the same
  // host/right/panel shape KioskFormDrawer's own drawer variant uses.
  threadHost: { flex: 1 },
  // Capped at 85% of the available height instead of the full screen,
  // floating clear of the very bottom edge (the iPad system bar / home
  // indicator strip) rather than running edge-to-edge [live-requested:
  // "i want to make this better to avoib going to system bar can we make
  // 85% height with professional design?" — after an earlier 80% pass was
  // reverted for risking real keyboard behavior]. maxHeight still gives
  // KeyboardAvoidingView a real box to shrink into for the keyboard —
  // that's what actually made height:'100%' work, not the specific
  // number, so 85% keeps the same mechanism intact. Floats vertically
  // centered (alignItems:'center' on `threadRight`) with a full border +
  // radius + soft shadow, since it no longer touches the screen's top/
  // bottom edges to justify a flush, radius-less panel.
  threadRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingVertical: KIOSK_SPACE.xl },
  // Shadow lives on this OUTER wrapper, not threadPanel itself — a view
  // with overflow:'hidden' (needed on threadPanel so its own content
  // clips to the rounded corners) also clips its own shadow on both iOS
  // and Android, so the two have to be separate layers.
  threadShadowWrap: {
    width: 480, maxWidth: '100%', maxHeight: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, shadowOpacity: 0.18,
    elevation: 12,
  },
  threadPanel: {
    flex: 1,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.lg, overflow: 'hidden',
    paddingHorizontal: 20, paddingTop: 20,
  },

  threadHead: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    marginBottom: KIOSK_SPACE.sm,
  },
  threadCloseBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: KIOSK_TYPO.title, fontWeight: '800', letterSpacing: -0.6, flexShrink: 1 },
  threadSearchBtn: {
    width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_RADIUS.full,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  threadSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.xs,
    borderWidth: 1, borderRadius: KIOSK_RADIUS.sm,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 8,
    marginBottom: KIOSK_SPACE.sm,
  },
  threadSearchInput: { flex: 1, fontSize: KIOSK_TYPO.body, paddingVertical: 2 },
  threadSearchCount: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
  list: { paddingBottom: 12, flexGrow: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, marginHorizontal: 20 },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dayLabel: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', paddingHorizontal: KIOSK_SPACE.xs },
  empty: { textAlign: 'center', marginTop: KIOSK_SPACE.xxl, fontSize: KIOSK_TYPO.subheading, fontWeight: '600' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  bannerText: { flex: 1, minWidth: 0, fontSize: TYPO.caption, fontWeight: '700' },

  attachMenu: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.lg, marginBottom: 4 },
  attachItem: { alignItems: 'center', gap: 8, flex: 1 },
  attachIcon: { width: 56, height: 56, borderRadius: KIOSK_RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  attachLabel: { fontSize: KIOSK_TYPO.label, fontWeight: '700' },
  // @mention picker.
  mentionPicker: { borderWidth: 1, borderRadius: KIOSK_RADIUS.sm, marginBottom: KIOSK_SPACE.xs, overflow: 'hidden' },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, paddingHorizontal: KIOSK_SPACE.md, paddingVertical: KIOSK_SPACE.sm },
  mentionAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  mentionName: { fontSize: KIOSK_TYPO.body, fontWeight: '700' },
  mentionRole: { fontSize: KIOSK_TYPO.caption, textTransform: 'capitalize' },
  mentionHint: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderWidth: 1.5, borderRadius: 24, paddingLeft: 14, paddingRight: 6, paddingVertical: 8, marginBottom: 20 },
  iconBtn: { width: KIOSK_HIT.min, height: KIOSK_HIT.min, borderRadius: KIOSK_HIT.min / 2, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: KIOSK_TYPO.body, fontWeight: '600', maxHeight: 160, paddingVertical: KIOSK_SPACE.sm },
  sendBtn: { width: KIOSK_HIT.control, height: KIOSK_HIT.control, borderRadius: KIOSK_HIT.control / 2, alignItems: 'center', justifyContent: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emojiPicker: { flexDirection: 'row', borderRadius: RADIUS.xl, padding: 16, gap: 12, borderWidth: 1 },
  // Was 8px of padding around a glyph — under the kiosk touch floor for
  // what is one of the most-tapped controls in chat.
  emojiBtn: {
    minWidth: KIOSK_HIT.min, minHeight: KIOSK_HIT.min,
    alignItems: 'center', justifyContent: 'center',
  },

  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  videoLightbox: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  lightboxClose: { position: 'absolute', top: 40, right: 32, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, padding: 10 },
});
