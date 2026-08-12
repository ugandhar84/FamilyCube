import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, Modal, Animated, Alert, Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useChatStore } from '@/store/chatStore';
import type { ChatMessage } from '@/store/chatStore';
import { useGroceryStore } from '@/store/groceryStore';
import type { GroceryCategory, GroceryStore } from '@/store/groceryStore';
import { TYPO, RADIUS } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
} from 'expo-audio';

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEW_COLOR   = '#7C3AED';

const CHANNELS = [
  { id: 'family',  label: '#all-family', short: '#all' },
  { id: 'parents', label: '🔒 #parents', short: '🔒 Parents' },
  { id: 'seniors', label: '👵 #seniors', short: '👵 Seniors' },
] as const;

type ChannelId = typeof CHANNELS[number]['id'] | string; // string for DMs like 'dm_Leo'
const QUICK_REACTIONS = ['❤️', '😂', '👍', '🎉', '🔥', '😍'];

const GROCERY_CATEGORIES: GroceryCategory[] = [
  'Produce', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen',
  'Household', 'Snacks', 'Pharmacy', 'Pet Store', 'Other',
];
const GROCERY_STORES: GroceryStore[] = [
  'Costco', 'Supermarket', "Trader Joe's", 'Target', 'Pharmacy', 'Pet Store', 'Other',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Voice note bubble ────────────────────────────────────────────────────────

function VoiceNoteBubble({ uri, duration, isMine, colors }: {
  uri: string; duration: number; isMine: boolean; colors: any;
}) {
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggle = useCallback(async () => {
    if (playing) {
      playerRef.current?.pause();
      if (tickRef.current) clearInterval(tickRef.current);
      setPlaying(false);
      return;
    }
    if (!playerRef.current) {
      const p = createAudioPlayer({ uri });
      playerRef.current = p;
    }
    playerRef.current.play();
    setPlaying(true);
    tickRef.current = setInterval(() => {
      const pos = playerRef.current?.currentTime ?? 0;
      setProgress(pos / (duration || 1));
      if (pos >= (duration - 0.1)) {
        if (tickRef.current) clearInterval(tickRef.current);
        setPlaying(false);
        setProgress(0);
      }
    }, 100);
  }, [playing, uri, duration]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    playerRef.current?.remove();
  }, []);

  const bg    = isMine ? 'rgba(255,255,255,0.15)' : colors.surface;
  const track = isMine ? 'rgba(255,255,255,0.4)'  : colors.border;
  const fill  = isMine ? '#fff' : REVIEW_COLOR;

  return (
    <Pressable onPress={toggle} style={[styles.voiceBubble, { backgroundColor: bg }]}>
      <Ionicons name={playing ? 'pause' : 'play'} size={18} color={isMine ? '#fff' : REVIEW_COLOR} />
      <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: track, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: fill, borderRadius: 2 }} />
      </View>
      <Text style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,0.85)' : colors.textSecondary, minWidth: 30, textAlign: 'right' }}>
        {formatDuration(duration)}
      </Text>
    </Pressable>
  );
}

// ─── Voice review bar ─────────────────────────────────────────────────────────

function VoiceReviewBar({ uri, duration, isDark, onSend, onDiscard }: {
  uri: string; duration: number; isDark: boolean; onSend: () => void; onDiscard: () => void;
}) {
  const bg     = isDark ? '#0f0a1e' : '#f5f3ff';
  const border = isDark ? '#4C1D95' : '#DDD6FE';
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggle = useCallback(async () => {
    if (playing) {
      playerRef.current?.pause();
      if (tickRef.current) clearInterval(tickRef.current);
      setPlaying(false);
      return;
    }
    if (!playerRef.current) {
      const p = createAudioPlayer({ uri });
      playerRef.current = p;
    }
    playerRef.current.play();
    setPlaying(true);
    tickRef.current = setInterval(() => {
      const pos = playerRef.current?.currentTime ?? 0;
      setProgress(pos / (duration || 1));
      if (pos >= (duration - 0.1)) {
        if (tickRef.current) clearInterval(tickRef.current);
        setPlaying(false);
        setProgress(0);
      }
    }, 100);
  }, [playing, uri, duration]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    playerRef.current?.remove();
  }, []);

  return (
    <View style={[styles.reviewBar, { backgroundColor: bg, borderColor: border }]}>
      <Pressable onPress={onDiscard} style={styles.reviewDiscard}>
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </Pressable>

      <Pressable onPress={toggle} style={[styles.reviewPlay, { backgroundColor: REVIEW_COLOR + '22' }]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={REVIEW_COLOR} />
      </Pressable>

      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: border, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: REVIEW_COLOR }} />
        </View>
        <Text style={{ fontSize: 11, color: REVIEW_COLOR, marginTop: 4 }}>{formatDuration(duration)}</Text>
      </View>

      <Pressable onPress={onSend} style={[styles.reviewSend, { backgroundColor: REVIEW_COLOR }]}>
        <Ionicons name="send" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, isMine, sender, onLongPress, onReact, activeMemberId, colors }: {
  message: ChatMessage; isMine: boolean; sender?: { emoji?: string; name: string };
  onLongPress: () => void; onReact: (emoji: string) => void; activeMemberId: string; colors: any;
}) {
  const totalReactions = Object.values(message.reactions ?? {}).flat().length;
  const isVoice = !!message.voiceUri && !message.text;

  return (
    <View style={[styles.bubbleWrapper, { flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }]}>
      <View style={[styles.bubbleAvatar, { backgroundColor: colors.surface }]}>
        <Text style={{ fontSize: 20 }}>{sender?.emoji ?? '👤'}</Text>
      </View>

      <View style={{ maxWidth: '72%', gap: 2 }}>
        {!isMine && (
          <Text style={[styles.bubbleSender, { color: colors.textTertiary, textAlign: 'left' }]}>
            {sender?.name.split(' ')[0]}
          </Text>
        )}

        <Pressable onLongPress={onLongPress}
          style={[styles.bubble, {
            backgroundColor: isMine ? colors.primary : colors.card,
            borderColor: isMine ? 'transparent' : colors.border,
            alignSelf: isMine ? 'flex-end' : 'flex-start',
            borderBottomRightRadius: isMine ? 4 : RADIUS.xl,
            borderBottomLeftRadius:  isMine ? RADIUS.xl : 4,
            padding: isVoice ? 8 : 10,
          }]}>
          {isVoice && message.voiceUri ? (
            <VoiceNoteBubble
              uri={message.voiceUri}
              duration={message.voiceDuration ?? 0}
              isMine={isMine}
              colors={colors}
            />
          ) : message.imageUri ? (
            <View>
              <Image source={{ uri: message.imageUri }} style={{ width: 200, height: 140, borderRadius: RADIUS.md }} resizeMode="cover" />
              {!!message.text && (
                <Text style={[styles.bubbleText, { color: isMine ? '#fff' : colors.textPrimary, marginTop: 6 }]}>
                  {message.text}
                </Text>
              )}
            </View>
          ) : (
            <Text style={[styles.bubbleText, { color: isMine ? '#fff' : colors.textPrimary }]}>
              {message.text}
            </Text>
          )}
        </Pressable>

        {totalReactions > 0 && (
          <View style={[styles.reactions, { alignSelf: isMine ? 'flex-end' : 'flex-start' }]}>
            {Object.entries(message.reactions ?? {}).map(([emoji, ids]) =>
              ids.length > 0 ? (
                <Pressable key={emoji} onPress={() => onReact(emoji)}
                  style={[styles.reactionChip, {
                    backgroundColor: ids.includes(activeMemberId) ? colors.primaryLight : colors.surface,
                    borderColor: ids.includes(activeMemberId) ? colors.primary : colors.border,
                  }]}>
                  <Text style={{ fontSize: 12 }}>{emoji}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{ids.length}</Text>
                </Pressable>
              ) : null
            )}
          </View>
        )}

        <Text style={[styles.bubbleTime, { color: colors.textTertiary, textAlign: isMine ? 'right' : 'left' }]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

// ─── Reaction picker ──────────────────────────────────────────────────────────

function ReactionPicker({ visible, onPick, onClose, colors }: {
  visible: boolean; onPick: (emoji: string) => void; onClose: () => void; colors: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.reactionOverlay} onPress={onClose}>
        <View style={[styles.reactionPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {QUICK_REACTIONS.map(e => (
            <Pressable key={e} onPress={() => { onPick(e); onClose(); }} style={styles.reactionOption}>
              <Text style={{ fontSize: 28 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Grocery quick-add modal ──────────────────────────────────────────────────

function GroceryModal({ visible, onClose, activeMemberId, colors, isDark }: {
  visible: boolean; onClose: () => void; activeMemberId: string; colors: any; isDark: boolean;
}) {
  const { addItem } = useGroceryStore();
  const [name, setName]           = useState('');
  const [category, setCategory]   = useState<GroceryCategory>('Other');
  const [store, setStore]         = useState<GroceryStore>('Supermarket');
  const [quantity, setQuantity]   = useState('1');
  const [saving, setSaving]       = useState(false);

  const reset = () => { setName(''); setCategory('Other'); setStore('Supermarket'); setQuantity('1'); };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addItem({
        name: name.trim(),
        category,
        storePreference: store,
        quantity: quantity || '1',
        addedBy: activeMemberId,
        familyId: 'family-1',
      });
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const chipStyle = (active: boolean) => ({
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5,
    borderColor: active ? colors.primary : colors.border,
    backgroundColor: active ? colors.primaryLight : colors.surface,
    marginRight: 6, marginBottom: 6,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.grocerySheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Add to Grocery List</Text>

          <TextInput
            value={name} onChangeText={setName}
            placeholder="Item name…" placeholderTextColor={colors.placeholder}
            style={[styles.groceryInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            autoFocus
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <TextInput
              value={quantity} onChangeText={setQuantity}
              placeholder="Qty" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad"
              style={[styles.groceryInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, width: 70 }]}
            />
          </View>

          <Text style={[styles.sheetLabel, { color: colors.textSecondary }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'nowrap' }}>
              {GROCERY_CATEGORIES.map(c => (
                <Pressable key={c} onPress={() => setCategory(c)} style={chipStyle(c === category)}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: c === category ? colors.primary : colors.textSecondary }}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.sheetLabel, { color: colors.textSecondary }]}>Store</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'nowrap' }}>
              {GROCERY_STORES.map(s => (
                <Pressable key={s} onPress={() => setStore(s)} style={chipStyle(s === store)}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: s === store ? colors.primary : colors.textSecondary }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={handleAdd}
            disabled={!name.trim() || saving}
            style={[styles.groceryAddBtn, { backgroundColor: name.trim() ? colors.primary : colors.border }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: TYPO.body }}>Add Item</Text>
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Chat screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const [activeChannel, setActiveChannel] = useState<ChannelId>('family');
  const channelData = useChatStore(s => s.channels[activeChannel]);
  const messages    = channelData?.messages ?? [];
  const { loadChannel, sendMessage, addReaction, deleteMessage } = useChatStore();

  const [text, setText]         = useState('');
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [groceryOpen, setGroceryOpen] = useState(false);

  // Voice recording state
  const recorder          = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording]   = useState(false);
  const [reviewing, setReviewing]   = useState(false);
  const [reviewUri, setReviewUri]   = useState<string | null>(null);
  const [reviewDur, setReviewDur]   = useState(0);
  const recordStartRef    = useRef<number>(0);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { if (!loaded) loadFromStorage(); }, [loaded]);
  useEffect(() => { loadChannel(activeChannel); }, [activeChannel]);
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  }, [messages.length]);

  const activeMember = members.find(m => m.id === activeMemberId);
  const memberMap    = Object.fromEntries(members.map(m => [m.id, m]));

  // ── Text send ──

  const handleSend = () => {
    if (!text.trim() || !activeMemberId) return;
    sendMessage(activeChannel, activeMemberId, text.trim());
    setText('');
  };

  // ── Voice recording ──

  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone permission required');
      return;
    }
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordStartRef.current = Date.now();
    setRecording(true);
  };

  const stopAndReview = async () => {
    if (!recording) return;
    await recorder.stop();
    const uri = recorder.uri;
    const dur = (Date.now() - recordStartRef.current) / 1000;
    setRecording(false);
    if (!uri || dur < 0.5) return;
    setReviewUri(uri);
    setReviewDur(dur);
    setReviewing(true);
  };

  const discardVoice = () => {
    setReviewing(false);
    setReviewUri(null);
    setReviewDur(0);
  };

  const sendVoiceNoteWithDuration = async () => {
    if (!reviewUri || !activeMemberId) return;
    const localUri = reviewUri;
    const dur      = reviewDur;
    setReviewing(false);
    setReviewUri(null);
    setReviewDur(0);

    // Optimistic send with local URI, no text
    await sendMessage(activeChannel, activeMemberId, '', undefined, undefined, undefined, dur, undefined, localUri);

    // Background upload to Supabase Storage and patch voice_url
    try {
      const ext      = 'mp4';
      const fileName = `voice/${activeMemberId}_${Date.now()}.${ext}`;
      const response = await fetch(localUri);
      const blob     = await response.blob();
      const { error: upErr } = await supabase.storage
        .from('chat-media')
        .upload(fileName, blob, { contentType: 'audio/mp4', upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(fileName);
      // The store's realtime handler will update the message once voice_url is set in DB
      // We update via a direct DB call keyed on sender+channel+approximate timestamp
      const since = new Date(Date.now() - 8000).toISOString();
      await supabase
        .from('chat_messages')
        .update({ voice_url: urlData.publicUrl })
        .eq('channel_id', activeChannel)
        .eq('sender_id', activeMemberId)
        .gte('created_at', since)
        .is('voice_url', null);
    } catch (e) {
      console.warn('[ChatScreen] voice upload failed', e);
    }
  };

  // ── Group by day ──

  const grouped: { label: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const label = formatDay(msg.timestamp);
    const last  = grouped[grouped.length - 1];
    if (last?.label === label) last.msgs.push(msg);
    else grouped.push({ label, msgs: [msg] });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.groupIcon, { backgroundColor: colors.primaryLight ?? colors.primary + '20' }]}>
            <Text style={{ fontSize: 22 }}>🏠</Text>
          </View>
          <View>
            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Family Chat</Text>
            <Text style={[styles.screenSub, { color: colors.textSecondary }]}>
              {members.map(m => m.emoji).join(' ')} {members.length} members
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={() => setGroceryOpen(true)}>
            <Text style={{ fontSize: 20 }}>🛒</Text>
          </Pressable>
          <Ionicons name="call-outline" size={22} color={colors.textSecondary} />
        </View>
      </View>

      {/* Channel tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: isDark ? colors.card : '#fff',
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 6, gap: 6 }}
      >
        {[
          ...CHANNELS,
          ...members.filter(m => m.role === 'kid').map(m => ({
            id: `dm_${m.name.split(' ')[0]}`,
            label: `💬 ${m.name.split(' ')[0]}`,
            short: `💬 ${m.name.split(' ')[0]}`,
          })),
        ].map(ch => {
          const active = activeChannel === ch.id;
          return (
            <Pressable
              key={ch.id}
              onPress={() => setActiveChannel(ch.id)}
              style={{
                borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6,
                backgroundColor: active ? colors.primary : (isDark ? colors.surface : '#F3F4F8'),
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700',
                color: active ? '#fff' : colors.textSecondary }}>
                {ch.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map(({ label, msgs }) => (
            <View key={label} style={{ gap: 12 }}>
              <View style={styles.dayDivider}>
                <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dayLabel, { color: colors.textTertiary, backgroundColor: colors.background }]}>{label}</Text>
                <View style={[styles.dayLine, { backgroundColor: colors.border }]} />
              </View>
              {msgs.map(msg => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isMine={msg.senderId === activeMemberId}
                  sender={memberMap[msg.senderId]}
                  activeMemberId={activeMemberId ?? ''}
                  colors={colors}
                  onLongPress={() => setPickerFor(msg.id)}
                  onReact={(emoji) => addReaction(activeChannel, msg.id, emoji, activeMemberId ?? '')}
                />
              ))}
            </View>
          ))}
        </ScrollView>

        {/* Voice review bar */}
        {reviewing && reviewUri ? (
          <VoiceReviewBar
            uri={reviewUri}
            duration={reviewDur}
            isDark={isDark}
            onSend={sendVoiceNoteWithDuration}
            onDiscard={discardVoice}
          />
        ) : (
          /* Input bar */
          <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <View style={[styles.inputBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable onPress={() => setGroceryOpen(true)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 18 }}>🛒</Text>
              </Pressable>
              <TextInput
                value={text} onChangeText={setText}
                placeholder="Message…"
                placeholderTextColor={colors.placeholder}
                multiline maxLength={500}
                style={[styles.input, { color: colors.textPrimary }]}
                returnKeyType="default"
              />
              {!text.trim() && (
                <Pressable
                  onPressIn={startRecording}
                  onPressOut={stopAndReview}
                  style={{ padding: 4 }}
                >
                  <Ionicons
                    name={recording ? 'mic' : 'mic-outline'}
                    size={22}
                    color={recording ? '#EF4444' : colors.textTertiary}
                  />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={handleSend}
              disabled={!text.trim()}
              style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.primary : colors.surface }]}
            >
              <Ionicons name="send" size={18} color={text.trim() ? '#fff' : colors.textTertiary} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      <ReactionPicker
        visible={!!pickerFor}
        colors={colors}
        onPick={(emoji) => { if (pickerFor && activeMemberId) addReaction(activeChannel, pickerFor, emoji, activeMemberId); }}
        onClose={() => setPickerFor(null)}
      />

      <GroceryModal
        visible={groceryOpen}
        onClose={() => setGroceryOpen(false)}
        activeMemberId={activeMemberId ?? ''}
        colors={colors}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  screenTitle:  { fontSize: TYPO.body, fontWeight: '800' },
  screenSub:    { fontSize: 12, marginTop: 1 },
  groupIcon:    { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  dayDivider:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLine:      { flex: 1, height: 1 },
  dayLabel:     { fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },

  bubbleWrapper: { marginBottom: 4 },
  bubbleAvatar:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bubbleSender:  { fontSize: 11, fontWeight: '600', marginBottom: 2, marginHorizontal: 4 },
  bubble:        { padding: 10, borderRadius: RADIUS.xl, borderWidth: 1, maxWidth: '100%' },
  bubbleText:    { fontSize: TYPO.body, lineHeight: 20 },
  bubbleTime:    { fontSize: 11, marginTop: 2, marginHorizontal: 4 },

  voiceBubble:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 2, minWidth: 160 },

  reactions:     { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionChip:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },

  reactionOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  reactionPicker:  { flexDirection: 'row', padding: 12, borderRadius: RADIUS.xl, borderWidth: 1, gap: 8 },
  reactionOption:  { padding: 4 },

  inputBar:    { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10, borderTopWidth: 1 },
  inputBubble: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  input:       { flex: 1, fontSize: TYPO.body, maxHeight: 100, paddingVertical: 4 },
  sendBtn:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  reviewBar:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 12, padding: 12, borderRadius: 20, borderWidth: 1.5 },
  reviewDiscard: { padding: 6, marginRight: 4 },
  reviewPlay:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reviewSend:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  grocerySheet:  { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 40 },
  sheetHandle:   { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:    { fontSize: TYPO.subheading, fontWeight: '800', marginBottom: 16 },
  sheetLabel:    { fontSize: TYPO.label, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  groceryInput:  { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: TYPO.body, marginBottom: 12 },
  groceryAddBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
