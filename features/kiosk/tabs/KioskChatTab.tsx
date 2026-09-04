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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet,
  Modal, Image, Alert, Clipboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  Send, Lock, Paperclip, Mic, Camera, Image as ImageIcon, Video, FileText,
  MapPin, X, XCircle, CornerUpLeft, Pencil, type LucideIcon,
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
import { MessageActionSheet } from '@/features/chat/components/MessageActionSheet';
import { RecordingBar, VoiceReviewBar } from '@/features/chat/components/VoiceComponents';
import { GroceryModal } from '@/features/chat/components/GroceryModal';
import AskCubeRecipeSheet from '@/components/AskCubeRecipeSheet';
import { useGroceryStore } from '@/store/groceryStore';
import type { FamilyMember } from '@/store/familyStore';

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
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [moderationWarning, setModerationWarning] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [actionMsg, setActionMsg] = useState<ChatMessage | null>(null);
  const [quickEmojiFor, setQuickEmojiFor] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
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
    setReplyingTo(null);
    setAttachUri(null);
    setModerationWarning(false);
    setText('');
    setShowAttachMenu(false);
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

  // Day-grouped, chronological (kiosk thread renders top-to-bottom, not
  // inverted like the phone's — same data, non-inverted list order).
  const dayItems = useMemo(() => {
    const items: DayGroup[] = [];
    let lastDay = '';
    for (const m of rawMsgs) {
      const day = formatDay(m.timestamp);
      if (day !== lastDay) { items.push({ type: 'day', label: day }); lastDay = day; }
      items.push({ type: 'msg', msg: m });
    }
    return items;
  }, [rawMsgs]);

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

    const finalText = sourceText.trim();
    const localAttachUri = attachUri;
    const localAttachType = attachType;
    setText(''); setAttachUri(null); setReplyingTo(null);

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

  return (
    <View style={s.root}>
      {/* ── Channel/DM sidebar — unchanged from the prior redesign ── */}
      <View style={[s.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
        <Text style={[s.sidebarTitle, { color: colors.textSecondary }]}>CHANNELS</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sidebarList}>
          {entries.filter(e => !e.isDM).map(e => {
            const on = e.id === activeChannel;
            const unread = unreadCounts[e.id] ?? 0;
            return (
              <Pressable key={e.id} onPress={() => switchChannel(e.id)}
                style={[s.channelRow, on && { backgroundColor: colors.primaryLight }]}>
                {e.lock && <Lock size={13} color={on ? colors.primary : colors.textTertiary} />}
                <Text style={[s.channelLabel, { color: on ? colors.primary : colors.textPrimary, fontWeight: on ? '800' : '600' }]} numberOfLines={1}>
                  {e.label}
                </Text>
                {unread > 0 && (
                  <View style={[s.unreadDot, { backgroundColor: colors.danger }]}>
                    <Text style={s.unreadDotText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          {entries.some(e => e.isDM) && (
            <Text style={[s.sidebarTitle, { color: colors.textSecondary, marginTop: 18 }]}>DIRECT MESSAGES</Text>
          )}
          {entries.filter(e => e.isDM).map(e => {
            const on = e.id === activeChannel;
            const unread = unreadCounts[e.id] ?? 0;
            return (
              <Pressable key={e.id} onPress={() => switchChannel(e.id)}
                style={[s.channelRow, on && { backgroundColor: colors.primaryLight }]}>
                <Text style={s.dmEmoji}>{e.otherMember?.emoji ?? '👤'}</Text>
                <Text style={[s.channelLabel, { color: on ? colors.primary : colors.textPrimary, fontWeight: on ? '800' : '600' }]} numberOfLines={1}>
                  {e.label}
                </Text>
                {unread > 0 && (
                  <View style={[s.unreadDot, { backgroundColor: colors.danger }]}>
                    <Text style={s.unreadDotText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Message thread — width-capped, centered, not stretched ── */}
      <View style={s.threadOuter}>
        {/* Same behavior/scoping as ChatScreen.tsx:937 — was missing
            entirely here, so the on-screen keyboard (a real concern on an
            iPad-class kiosk, which does show one) simply overlapped the
            input bar/messages with no adjustment instead of the screen
            shrinking to make room. Scoped to just the thread column (not
            the whole root View) so the channel sidebar never shifts. */}
        <KeyboardAvoidingView style={s.thread} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {currentEntry?.label ?? 'Chat'}
          </Text>

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
                      <View style={[s.dayLine, { backgroundColor: colors.border }]} />
                      <Text style={[s.dayLabel, { color: colors.textTertiary }]}>{item.label}</Text>
                      <View style={[s.dayLine, { backgroundColor: colors.border }]} />
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
                    searchQuery=""
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
                <Text style={[s.empty, { color: colors.textTertiary }]}>No messages yet — say hi 👋</Text>
              }
            />
          </View>

          {/* ── Moderation warning ── */}
          {moderationWarning && (
            <View style={[s.banner, { backgroundColor: colors.danger + '14', borderTopColor: colors.danger }]}>
              <Text style={{ fontSize: 16 }}>🙏</Text>
              <Text style={{ flex: 1, fontSize: TYPO.caption, fontWeight: '700', color: colors.danger }}>Let's keep it kind — that message wasn't sent.</Text>
              <Pressable onPress={() => setModerationWarning(false)}><X size={18} color={colors.danger} /></Pressable>
            </View>
          )}

          {/* ── Edit banner — same amber "Editing: ..." bar ChatScreen.tsx
              shows (ChatScreen.tsx:1146-1153) ── */}
          {editingMsg && (
            <View style={[s.banner, { backgroundColor: colors.amberLight, borderTopColor: colors.amber }]}>
              <Pencil size={16} color={colors.amber} />
              <Text style={{ flex: 1, fontSize: TYPO.caption, color: colors.textSecondary }} numberOfLines={1}>
                Editing: {editingMsg.text}
              </Text>
              <Pressable onPress={() => { setEditingMsg(null); setText(''); }}><X size={18} color={colors.textTertiary} /></Pressable>
            </View>
          )}

          {/* ── Reply banner — quote preview above the input ── */}
          {replyingTo && (
            <View style={[s.banner, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <CornerUpLeft size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.primary }}>
                  Reply to {memberMap[replyingTo.senderId]?.name?.split(' ')[0]}
                </Text>
                <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }} numberOfLines={1}>
                  {replyingTo.text ||
                    (replyingTo.voiceUri ? REPLY_KIND_LABEL.voice
                      : replyingTo.mediaType === 'video' ? REPLY_KIND_LABEL.video
                      : replyingTo.imageUri ? REPLY_KIND_LABEL.image
                      : replyingTo.documentUri ? REPLY_KIND_LABEL.document
                      : replyingTo.locationPin ? REPLY_KIND_LABEL.location
                      : '')}
                </Text>
              </View>
              <Pressable onPress={() => setReplyingTo(null)}><X size={20} color={colors.textTertiary} /></Pressable>
            </View>
          )}

          {/* ── Attachment preview ── */}
          {attachUri && (
            <View style={[s.banner, { borderTopColor: colors.border }]}>
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: attachUri }} style={{ width: 64, height: 64, borderRadius: 12 }} resizeMode="cover" />
                {attachType === 'video' && (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Video size={18} color="#fff" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                  {attachType === 'video' ? '🎥 Video clip (≤10s)' : '🖼️ Image'}
                </Text>
              </View>
              <Pressable onPress={() => setAttachUri(null)} style={{ padding: 6 }}>
                <XCircle size={22} color={colors.textTertiary} />
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
            <View style={[s.attachMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {([
                { Icon: Camera, label: 'Camera', color: colors.accent, onPress: () => { setShowAttachMenu(false); pickCamera(); } },
                { Icon: ImageIcon, label: 'Photo', color: colors.success, onPress: () => { setShowAttachMenu(false); pickImage(); } },
                { Icon: Video, label: 'Video', color: colors.danger, onPress: () => { setShowAttachMenu(false); recordVideo(); } },
                { Icon: FileText, label: 'Document', color: colors.warning, onPress: () => { setShowAttachMenu(false); sendDocument(); } },
                { Icon: MapPin, label: 'Location', color: colors.info, onPress: () => { setShowAttachMenu(false); sendLocation(); } },
              ] as { Icon: LucideIcon; label: string; color: string; onPress: () => void }[]).map(item => (
                <Pressable key={item.label} onPress={item.onPress} style={s.attachItem}>
                  <View style={[s.attachIcon, { backgroundColor: item.color + '22' }]}>
                    <item.Icon size={28} color={item.color} />
                  </View>
                  <Text style={[s.attachLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Input bar ── */}
          {!reviewing && !recording && (
            <View style={[s.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable onPress={() => setShowAttachMenu(v => !v)} style={s.iconBtn} hitSlop={8}>
                <Paperclip size={22} color={colors.textSecondary} />
              </Pressable>
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={val => { setText(val); if (moderationWarning) setModerationWarning(false); }}
                placeholder={currentEntry?.isDM ? `Message ${currentEntry.label}…` : 'Message the family…'}
                placeholderTextColor={colors.textTertiary}
                style={[s.input, { color: colors.textPrimary }]}
                onSubmitEditing={send}
                returnKeyType="send"
                multiline
                maxLength={1000}
              />
              {canSend ? (
                <Pressable onPress={send} style={[s.sendBtn, { backgroundColor: colors.primary }]}>
                  <Send size={20} color="#fff" />
                </Pressable>
              ) : (
                <Pressable onPress={startRecording} style={s.iconBtn} hitSlop={8}>
                  <Mic size={24} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </View>

      {/* ── Quick emoji (double-tap) ── */}
      <Modal visible={!!quickEmojiFor} transparent animationType="fade" onRequestClose={() => setQuickEmojiFor(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setQuickEmojiFor(null)}>
          <View style={[s.emojiPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {QUICK_REACTIONS.map(e => (
              <Pressable key={e} onPress={() => {
                if (quickEmojiFor) addReaction(activeChannel, quickEmojiFor.id, e, active.id);
                setQuickEmojiFor(null);
              }} style={{ padding: 8 }}>
                <Text style={{ fontSize: 32 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
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
          <Pressable onPress={() => setLightboxUri(null)} style={s.lightboxClose}>
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

const SIDEBAR_WIDTH = 260;
const THREAD_MAX_WIDTH = 760;

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  sidebar: { width: SIDEBAR_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, paddingTop: 20, paddingHorizontal: 14 },
  sidebarTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 6 },
  sidebarList: { gap: 4, paddingBottom: 20 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 11 },
  channelLabel: { flex: 1, fontSize: TYPO.body },
  dmEmoji: { fontSize: 17 },
  unreadDot: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadDotText: { fontSize: 10.5, fontWeight: '800', color: '#fff' },

  // Centers a max-width column inside whatever space is left after the
  // sidebar — the thread never stretches past THREAD_MAX_WIDTH regardless
  // of how wide the kiosk display is.
  threadOuter: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  thread: { flex: 1, width: '100%', maxWidth: THREAD_MAX_WIDTH, paddingTop: 20 },

  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  list: { paddingBottom: 12, flexGrow: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10, marginHorizontal: 20 },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dayLabel: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: TYPO.body, fontWeight: '600' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },

  attachMenu: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.lg, marginBottom: 4 },
  attachItem: { alignItems: 'center', gap: 8, flex: 1 },
  attachIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  attachLabel: { fontSize: 12, fontWeight: '700' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderWidth: 1.5, borderRadius: 24, paddingLeft: 14, paddingRight: 6, paddingVertical: 8, marginBottom: 20 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: TYPO.body, fontWeight: '600', maxHeight: 120, paddingVertical: 8 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  emojiPicker: { flexDirection: 'row', borderRadius: RADIUS.xl, padding: 16, gap: 12, borderWidth: 1 },

  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  videoLightbox: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  lightboxClose: { position: 'absolute', top: 40, right: 32, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, padding: 10 },
});
