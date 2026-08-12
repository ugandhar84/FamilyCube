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
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, Modal, Alert, Image, Animated, Clipboard,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAudioRecorder, AudioModule, RecordingPresets, createAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import AppHeader from '@/components/AppHeader';
import { useChatStore, ChatMessage } from '@/store/chatStore';
import { useGroceryStore, GroceryCategory, GroceryStore } from '@/store/groceryStore';
import { supabase } from '@/lib/supabase';
import { RADIUS } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function formatDay(iso: string) {
  const d     = new Date(iso);
  const today = new Date();
  const yest  = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString())  return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const VOICE_COLOR     = '#7C3AED';
const QUICK_REACTIONS = ['❤️', '👍', '😋', '🙌', '🌟', '😂'];
const GROUP_CHANNELS  = [
  { id: 'all',     label: '#all-family',       isDM: false, lock: false },
  { id: 'parents', label: '🔒 #parents-vault', isDM: false, lock: true },
  { id: 'seniors', label: '👵 #seniors',       isDM: false, lock: false },
];
const GROCERY_CATS: GroceryCategory[]  = ['Produce','Dairy & Eggs','Bakery','Pantry','Frozen','Household','Snacks','Pharmacy','Pet Store','Other'];
const GROCERY_STORES: GroceryStore[]   = ['Costco','Supermarket',"Trader Joe's",'Target','Pharmacy','Pet Store','Other'];

// ─── Mention text renderer ────────────────────────────────────────────────────

function highlightSearch(raw: string, query: string, baseStyle: any): React.ReactNode {
  if (!query.trim()) return <Text style={baseStyle}>{raw}</Text>;
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx: number;
  const lo = raw.toLowerCase();
  while ((idx = lo.indexOf(q, cursor)) !== -1) {
    if (idx > cursor) parts.push(<Text key={cursor}>{raw.slice(cursor, idx)}</Text>);
    parts.push(<Text key={idx} style={{ backgroundColor: '#fbbf24', color: '#1e1b4b', fontWeight: '700' }}>{raw.slice(idx, idx + q.length)}</Text>);
    cursor = idx + q.length;
  }
  if (cursor < raw.length) parts.push(<Text key={cursor}>{raw.slice(cursor)}</Text>);
  return <Text style={baseStyle}>{parts}</Text>;
}

function MentionText({ text, memberMap, myId, searchQuery, textStyle }: {
  text: string; memberMap: Record<string, any>; myId: string; searchQuery?: string; textStyle: any;
}) {
  const parts = text.split(/(@\[[^\]]+\|[^\]]+\])/g);
  return (
    <Text style={textStyle}>
      {parts.map((part, i) => {
        const m = part.match(/^@\[([^\]]+)\|([^\]]+)\]$/);
        if (!m) return searchQuery ? highlightSearch(part, searchQuery, {}) : <Text key={i}>{part}</Text>;
        const [, , id] = m;
        const member = memberMap[id];
        const isMe   = id === myId;
        return (
          <Text key={i} style={{ fontWeight: '800', color: isMe ? '#fbbf24' : '#a78bfa' }}>
            @{member?.name?.split(' ')[0] ?? 'unknown'}
          </Text>
        );
      })}
    </Text>
  );
}

// ─── Voice note bubble ────────────────────────────────────────────────────────

// ─── Waveform bars (static mock — animates while playing/recording) ───────────

const BAR_COUNT = 24;
function WaveformBars({ progress, active, color, trackColor }: {
  progress: number; active: boolean; color: string; trackColor: string;
}) {
  const anims = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))).current;
  const loopRef = useRef<ReturnType<typeof Animated.loop> | null>(null);

  useEffect(() => {
    if (active) {
      const waves = anims.map((a, i) =>
        Animated.loop(Animated.sequence([
          Animated.timing(a, { toValue: 0.3 + Math.random() * 0.7, duration: 200 + i * 20, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.15 + Math.random() * 0.4, duration: 200 + i * 20, useNativeDriver: true }),
        ]))
      );
      loopRef.current = Animated.loop(Animated.stagger(30, waves));
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      anims.forEach((a, i) => a.setValue(0.15 + (i / BAR_COUNT) * 0.7));
    }
    return () => loopRef.current?.stop();
  }, [active]);

  const filledBars = Math.round(progress * BAR_COUNT);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, flex: 1 }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3, borderRadius: 2,
            backgroundColor: i < filledBars ? color : trackColor,
            transform: [{ scaleY: anim }],
          }}
        />
      ))}
    </View>
  );
}

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
    // Always create fresh player so replay works
    playerRef.current?.remove();
    playerRef.current = createAudioPlayer({ uri });
    playerRef.current.play();
    setProgress(0);
    setPlaying(true);
    tickRef.current = setInterval(() => {
      const pos = playerRef.current?.currentTime ?? 0;
      setProgress(pos / (duration || 1));
      if (pos >= duration - 0.1) {
        if (tickRef.current) clearInterval(tickRef.current);
        setPlaying(false); setProgress(0);
      }
    }, 100);
  }, [playing, uri, duration]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    playerRef.current?.remove();
  }, []);

  const color      = isMine ? '#fff' : VOICE_COLOR;
  const trackColor = isMine ? 'rgba(255,255,255,0.3)' : VOICE_COLOR + '33';

  return (
    <Pressable onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 2, minWidth: 180 }}>
      <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={28} color={color} />
      <WaveformBars progress={progress} active={playing} color={color} trackColor={trackColor} />
      <Text style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,0.85)' : colors.textSecondary, minWidth: 32, textAlign: 'right' }}>
        {formatDuration(playing ? progress * duration : duration)}
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
    playerRef.current?.remove();
    playerRef.current = createAudioPlayer({ uri });
    playerRef.current.play();
    setProgress(0);
    setPlaying(true);
    tickRef.current = setInterval(() => {
      const pos = playerRef.current?.currentTime ?? 0;
      setProgress(pos / (duration || 1));
      if (pos >= duration - 0.1) {
        if (tickRef.current) clearInterval(tickRef.current);
        setPlaying(false); setProgress(0);
      }
    }, 100);
  }, [playing, uri, duration]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    playerRef.current?.remove();
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: bg, borderTopWidth: 1, borderTopColor: border, gap: 10 }}>
      <Pressable onPress={onDiscard} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EF444422', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </Pressable>
      <Pressable onPress={toggle} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: VOICE_COLOR + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={VOICE_COLOR} />
      </Pressable>
      <WaveformBars progress={progress} active={playing} color={VOICE_COLOR} trackColor={isDark ? '#4C1D95' : '#DDD6FE'} />
      <Text style={{ fontSize: 11, color: VOICE_COLOR, minWidth: 32 }}>{formatDuration(playing ? progress * duration : duration)}</Text>
      <Pressable onPress={onSend} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: VOICE_COLOR, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="send" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

// ─── Active recording bar ─────────────────────────────────────────────────────

function RecordingBar({ elapsed, isDark, onStop }: {
  elapsed: number; isDark: boolean; onStop: () => void;
}) {
  const bg     = isDark ? '#0f0a1e' : '#fff0f0';
  const border = isDark ? '#7f1d1d' : '#fecaca';
  const barAnims = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.2))).current;
  const loopRef  = useRef<ReturnType<typeof Animated.loop> | null>(null);

  useEffect(() => {
    const waves = barAnims.map((a, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(a, { toValue: 0.25 + Math.random() * 0.75, duration: 150 + i * 15, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.1  + Math.random() * 0.4,  duration: 150 + i * 15, useNativeDriver: true }),
      ]))
    );
    loopRef.current = Animated.loop(Animated.stagger(20, waves));
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, []);

  const MAX = 10;
  const pct  = elapsed / MAX;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
      backgroundColor: bg, borderTopWidth: 1, borderTopColor: border, gap: 10 }}>
      {/* Pulsing red dot */}
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', opacity: elapsed % 1 < 0.5 ? 1 : 0.4 }} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444', minWidth: 36 }}>{formatDuration(elapsed)}</Text>
      {/* Waveform */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, flex: 1 }}>
        {barAnims.map((anim, i) => (
          <Animated.View key={i} style={{ width: 3, borderRadius: 2,
            backgroundColor: i / BAR_COUNT < pct ? '#EF4444' : (isDark ? '#7f1d1d' : '#fca5a5'),
            transform: [{ scaleY: anim }] }} />
        ))}
      </View>
      <Text style={{ fontSize: 11, color: isDark ? '#fca5a5' : '#b91c1c' }}>
        {MAX - elapsed < 3 ? `${Math.ceil(MAX - elapsed)}s` : ''}
      </Text>
      {/* Stop button */}
      <Pressable onPress={onStop} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="stop" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

// ─── Swipeable message bubble ─────────────────────────────────────────────────
// Right swipe → reply (snappy: fires at 56px, snaps back instantly)
// Left swipe  → reveal timestamp (capped at -52px, snaps back on release)

const SWIPE_REPLY_THRESHOLD = 56;
const SWIPE_MAX_RIGHT       = 72;
const SWIPE_MAX_LEFT        = -52;

function SwipeableBubble({ children, onSwipeRight, timeNode }: {
  children: React.ReactNode; onSwipeRight: () => void; timeNode: React.ReactNode;
}) {
  const translateX  = useRef(new Animated.Value(0)).current;
  const firedRef    = useRef(false);
  const activeRef   = useRef(false);

  const snapBack = () =>
    Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }).start();

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,

    onPanResponderGrant: () => {
      firedRef.current  = false;
      activeRef.current = true;
      translateX.stopAnimation();
    },

    onPanResponderMove: (_, g) => {
      if (!activeRef.current) return;
      if (g.dx > 0) {
        // Right swipe — apply sqrt damping so it feels resistive past threshold
        const capped = Math.min(g.dx, SWIPE_MAX_RIGHT);
        const damped = capped < SWIPE_REPLY_THRESHOLD
          ? capped
          : SWIPE_REPLY_THRESHOLD + Math.sqrt(capped - SWIPE_REPLY_THRESHOLD) * 3;
        translateX.setValue(Math.min(damped, SWIPE_MAX_RIGHT));

        // Fire reply the instant threshold is crossed (haptic feel)
        if (g.dx >= SWIPE_REPLY_THRESHOLD && !firedRef.current) {
          firedRef.current = true;
          onSwipeRight();
        }
      } else {
        // Left swipe — reveal timestamp, hard cap
        translateX.setValue(Math.max(g.dx, SWIPE_MAX_LEFT));
      }
    },

    onPanResponderRelease: () => {
      activeRef.current = false;
      snapBack();
    },
    onPanResponderTerminate: () => {
      activeRef.current = false;
      snapBack();
    },
  })).current;

  // time pill opacity/slide driven by left-swipe (negative translateX)
  const timeOpacity = translateX.interpolate({ inputRange: [SWIPE_MAX_LEFT, -12, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' });
  const timeSlide   = translateX.interpolate({ inputRange: [SWIPE_MAX_LEFT, 0], outputRange: [0, 14], extrapolate: 'clamp' });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Animated.View style={{ transform: [{ translateX }], flex: 1 }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
      {/* Timestamp revealed on left-swipe */}
      <Animated.View style={{ position: 'absolute', right: 4, opacity: timeOpacity, transform: [{ translateX: timeSlide }], pointerEvents: 'none' }}>
        {timeNode}
      </Animated.View>
    </View>
  );
}

// ─── Message bubble (WhatsApp style — rounded rect with tail) ────────────────

const BUBBLE_R  = 16; // standard corners
const BUBBLE_SM = 4;  // tail corner (first msg in group)

function MessageBubble({ msg, isMe, isGroupFirst, isGroupLast, senderName, senderEmoji,
  senderColor, activeMemberId, memberMap, searchQuery, colors, isDark, highlighted,
  onLongPress, onDoubleTap, onSwipeRight, onQuoteTap }: {
  msg: ChatMessage; isMe: boolean; isGroupFirst: boolean; isGroupLast: boolean;
  senderName: string; senderEmoji: string; senderColor: string;
  activeMemberId: string; memberMap: Record<string, any>;
  highlighted?: boolean;
  onQuoteTap?: () => void;
  searchQuery: string; colors: any; isDark: boolean;
  onLongPress: () => void; onDoubleTap: () => void; onSwipeRight: () => void;
}) {
  // iMessage-style: solid blue for mine, white/dark-card for others
  const bubbleMe       = '#5B8DEF';
  const bubbleMeTxt    = '#FFFFFF';
  const bubbleOther    = isDark ? '#2C2C3E' : '#FFFFFF';
  const bubbleOtherTxt = isDark ? '#E2E8F0' : '#1A1A2E';
  const tsColor        = isMe ? 'rgba(255,255,255,0.65)' : (isDark ? 'rgba(226,232,240,0.5)' : 'rgba(26,26,46,0.38)');

  const totalRx = Object.values(msg.reactions ?? {}).flat().length;
  const isVoice = !!msg.voiceUri && !msg.text;

  const lastTap = useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) onDoubleTap();
    lastTap.current = now;
  };

  // Amber highlight animation when tapping a quoted message
  const highlightAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (highlighted) {
      highlightAnim.setValue(1);
      Animated.timing(highlightAnim, { toValue: 0, duration: 1800, useNativeDriver: false }).start();
    }
  }, [highlighted]);
  const highlightBorder = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', '#F5A623'] });
  const highlightWidth  = highlightAnim.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 2, 2] });

  // WhatsApp style — tail on the last bubble of each group (sender side, bottom corner)
  const btlr = BUBBLE_R;
  const btrr = BUBBLE_R;
  const bblr = isMe ? BUBBLE_R : (isGroupLast ? BUBBLE_SM : BUBBLE_R);
  const bbrr = isMe ? (isGroupLast ? BUBBLE_SM : BUBBLE_R) : BUBBLE_R;

  // Timestamp + tick row — rendered BELOW the bubble
  const metaRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
      alignSelf: isMe ? 'flex-end' : 'flex-start', marginTop: 2, marginHorizontal: 4 }}>
      {msg.edited && <Text style={{ fontSize: 9, color: tsColor }}>edited · </Text>}
      <Text style={{ fontSize: 10, color: tsColor }}>{formatTime(msg.timestamp)}</Text>
      {isMe && <Ionicons name="checkmark-done" size={13} color={isDark ? '#53BDEB' : '#34B7F1'} />}
    </View>
  );

  const swipeTimeNode = (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
      paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>{formatTime(msg.timestamp)}</Text>
    </View>
  );

  return (
    <SwipeableBubble onSwipeRight={onSwipeRight} timeNode={swipeTimeNode}>
      <View style={{ flexDirection: isMe ? 'row-reverse' : 'row',
        alignItems: 'flex-end', gap: 6, paddingHorizontal: 10,
        marginBottom: isGroupLast ? 6 : 1, marginTop: isGroupFirst ? 4 : 0 }}>

        {/* Avatar — shown only on last bubble of group for others */}
        {!isMe && (
          isGroupLast
            ? <View style={[mb.avatar, { backgroundColor: senderColor }]}>
                <Text style={{ fontSize: senderEmoji && senderEmoji !== '👤' ? 16 : 13,
                  color: '#fff', fontWeight: '700' }}>
                  {senderEmoji && senderEmoji !== '👤' ? senderEmoji : senderName[0]?.toUpperCase()}
                </Text>
              </View>
            : <View style={{ width: 34 }} />
        )}

        <Animated.View style={{ maxWidth: '78%', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 1,
          borderRadius: BUBBLE_R, borderWidth: highlightWidth, borderColor: highlightBorder }}>
          {/* Sender name — others, first bubble only */}
          {!isMe && isGroupFirst && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: senderColor, marginLeft: 2, marginBottom: 1 }}>
              {senderName}
            </Text>
          )}

          {/* Bubble */}
          <Pressable
            onPress={handlePress}
            onLongPress={onLongPress}
            delayLongPress={350}
            style={{
              backgroundColor: isMe ? bubbleMe : bubbleOther,
              borderTopLeftRadius: btlr,
              borderTopRightRadius: btrr,
              borderBottomLeftRadius: bblr,
              borderBottomRightRadius: bbrr,
              overflow: 'hidden',
              padding: isVoice ? 8 : 10,
              paddingTop: msg.replyTo ? 0 : (isVoice ? 8 : 10),
              shadowColor: '#000',
              shadowOpacity: isMe ? 0 : (isDark ? 0.22 : 0.07),
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: isMe ? 0 : 2,
            }}
          >
            {/* Reply quote — inside bubble, WhatsApp style */}
            {msg.replyTo && (
              <Pressable onPress={onQuoteTap}
                style={{ flexDirection: 'row', marginBottom: 6,
                  marginLeft: -(isVoice ? 8 : 10), marginRight: -(isVoice ? 8 : 10),
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: isMe ? 'rgba(255,255,255,0.2)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                }}>
                {/* Accent strip */}
                <View style={{ width: 4, backgroundColor: isMe ? 'rgba(255,255,255,0.7)' : senderColor }} />
                <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 7,
                  backgroundColor: isMe ? 'rgba(0,0,0,0.15)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 2,
                    color: isMe ? 'rgba(255,255,255,0.9)' : senderColor }}>
                    {memberMap[msg.replyTo.senderId]?.name?.split(' ')[0] ?? 'Family'}
                  </Text>
                  <Text numberOfLines={1}
                    style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.7)' : (isDark ? 'rgba(226,232,240,0.6)' : 'rgba(26,26,46,0.5)') }}>
                    {msg.replyTo.text || '🎙️ Voice note'}
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Voice note */}
            {isVoice && msg.voiceUri ? (
              <VoiceNoteBubble uri={msg.voiceUri} duration={msg.voiceDuration ?? 0} isMine={isMe} colors={colors} />
            ) : isVoice ? (
              <Text style={{ fontSize: 14, color: isMe ? bubbleMeTxt : bubbleOtherTxt }}>
                🎙️ Voice note ({Math.round(msg.voiceDuration ?? 0)}s)
              </Text>
            ) : (
              <>
                {/* Image / video */}
                {msg.imageUri && (
                  <View style={{ marginBottom: msg.text ? 6 : 0, borderRadius: 12, overflow: 'hidden' }}>
                    <Image source={{ uri: msg.imageUri }} style={{ width: 210, height: 158 }} resizeMode="cover" />
                    {msg.mediaType === 'video' && (
                      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 24, padding: 10 }}>
                          <Ionicons name="play" size={22} color="#fff" />
                        </View>
                      </View>
                    )}
                  </View>
                )}
                {/* Text */}
                {!!msg.text && (
                  <MentionText text={msg.text} memberMap={memberMap} myId={activeMemberId}
                    searchQuery={searchQuery}
                    textStyle={{ fontSize: 14.5, lineHeight: 21,
                      color: isMe ? bubbleMeTxt : bubbleOtherTxt }} />
                )}
              </>
            )}
          </Pressable>

          {/* Time + tick — below bubble */}
          {metaRow}

          {/* Reaction chips */}
          {totalRx > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
              {Object.entries(msg.reactions ?? {}).map(([emoji, ids]) =>
                ids.length > 0 ? (
                  <View key={emoji} style={[mb.rxChip, {
                    backgroundColor: ids.includes(activeMemberId)
                      ? (isDark ? '#005C4B' : '#DCF8C6')
                      : (isDark ? '#202C33' : '#f0f2f5'),
                    borderColor: ids.includes(activeMemberId) ? '#25D366' : 'transparent',
                  }]}>
                    <Text style={{ fontSize: 13 }}>{emoji}</Text>
                    {ids.length > 1 && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700' }}>{ids.length}</Text>
                    )}
                  </View>
                ) : null
              )}
            </View>
          )}
        </Animated.View>
      </View>
    </SwipeableBubble>
  );
}

const mb = StyleSheet.create({
  avatar:  { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rxChip:  { flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
});

// ─── Long-press action sheet ──────────────────────────────────────────────────

function MessageActionSheet({ visible, msg, isMe, canEdit, colors, isDark, onClose,
  onReact, onReply, onCopy, onEdit, onDelete, onAddGrocery }: {
  visible: boolean; msg: ChatMessage | null; isMe: boolean; canEdit: boolean; colors: any; isDark: boolean;
  onClose: () => void; onReact: (e: string) => void; onReply: () => void;
  onCopy: () => void; onEdit: () => void; onDelete: () => void; onAddGrocery: () => void;
}) {
  if (!msg) return null;

  type Action = { icon: string; label: string; color: string; onPress: () => void };
  const actions: Action[] = [
    { icon: 'arrow-undo-outline', label: 'Reply',        color: colors.primary,       onPress: onReply },
    { icon: 'copy-outline',       label: 'Copy Text',    color: colors.textSecondary, onPress: onCopy },
    { icon: 'cart-outline',       label: 'Add to List',  color: '#10b981',            onPress: onAddGrocery },
    ...(isMe && canEdit ? [
      { icon: 'pencil-outline',   label: 'Edit',         color: '#f59e0b',            onPress: onEdit },
    ] : []),
    ...(isMe ? [
      { icon: 'trash-outline',    label: 'Delete',       color: '#ef4444',            onPress: onDelete },
    ] : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}>

          {/* Quick emoji reactions */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 18 }}>
            {QUICK_REACTIONS.map(e => (
              <Pressable key={e} onPress={() => { onReact(e); onClose(); }}
                style={{ width: 46, height: 46, borderRadius: 23,
                  backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                  borderWidth: 1, borderColor: colors.border,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 12 }} />

          {/* Action rows */}
          {actions.map((a, i) => (
            <Pressable key={i} onPress={() => { a.onPress(); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 8, borderRadius: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: a.color+'22',
                alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={a.icon as any} size={18} color={a.color} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: a.color }}>{a.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Grocery modal ────────────────────────────────────────────────────────────

function GroceryModal({ visible, initialName, addedByMemberId, onClose, onAdd }: {
  visible: boolean; initialName: string; addedByMemberId: string;
  onClose: () => void; onAdd: (item: any) => void;
}) {
  const { colors } = useTheme();
  const [name,  setName]  = useState(initialName);
  const [qty,   setQty]   = useState('1');
  const [cat,   setCat]   = useState<GroceryCategory>('Household');
  const [store, setStore] = useState<GroceryStore>('Costco');
  const [price, setPrice] = useState('5.99');
  useEffect(() => { if (visible) setName(initialName); }, [visible, initialName]);
  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), quantity: qty, category: cat, store, estimatedPrice: parseFloat(price)||5, addedByMemberId });
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cart" size={20} color="#10b981" />
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>Add to Shopping List</Text>
            </View>
            <Pressable onPress={onClose}><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <View>
            <Text style={gm.label(colors)}>Item Name</Text>
            <TextInput style={gm.input(colors)} value={name} onChangeText={setName} autoFocus />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={gm.label(colors)}>Quantity</Text>
              <TextInput style={gm.input(colors)} value={qty} onChangeText={setQty} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={gm.label(colors)}>Est. Price ($)</Text>
              <TextInput style={gm.input(colors)} value={price} onChangeText={setPrice} keyboardType="numeric" />
            </View>
          </View>
          <View>
            <Text style={gm.label(colors)}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {GROCERY_CATS.map(c => (
                <Pressable key={c} onPress={() => setCat(c)}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5,
                    backgroundColor: cat===c ? '#10b98120' : colors.surface, borderColor: cat===c ? '#10b981' : colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: cat===c ? '#10b981' : colors.textSecondary }}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View>
            <Text style={gm.label(colors)}>Store</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {GROCERY_STORES.map(s => (
                <Pressable key={s} onPress={() => setStore(s)}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5,
                    backgroundColor: store===s ? colors.primaryLight : colors.surface, borderColor: store===s ? colors.primary : colors.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: store===s ? colors.primary : colors.textSecondary }}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surface }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#10b981', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800' }}>Save to List</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const gm = {
  label: (c: any) => ({ fontSize: 11, fontWeight: '700' as const, color: c.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 6 }),
  input: (c: any) => ({ backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 10, fontSize: 14, color: c.textPrimary }),
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ colors, isDark, channelId, setChannelId, members, currentMemberId, isParent, onClose }: {
  colors: any; isDark: boolean; channelId: string; setChannelId: (id: string) => void;
  members: any[]; currentMemberId: string; isParent: boolean; onClose: () => void;
}) {
  const bg       = isDark ? '#0f172a' : '#1e1b4b';
  const headerBg = isDark ? '#1e293b' : '#312e81';
  const active   = isDark ? '#4f46e5' : '#4338ca';
  return (
    <View style={{ width: 220, backgroundColor: bg, position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 50 }}>
      <View style={{ backgroundColor: headerBg, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#e2e8f0' }}>💬 Family Chat</Text>
        <Pressable onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={18} color="#818cf8" /></Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 14 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#818cf8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Channels</Text>
        {GROUP_CHANNELS.map(ch => {
          if (ch.lock && !isParent) return null;
          const isAct = channelId === ch.id;
          return (
            <Pressable key={ch.id} onPress={() => { setChannelId(ch.id); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, marginBottom: 2, backgroundColor: isAct ? active : 'transparent' }}>
              <Ionicons name="chatbubbles-outline" size={14} color={isAct ? '#fff' : '#818cf8'} />
              <Text style={{ fontSize: 13, fontWeight: isAct ? '700' : '500', color: isAct ? '#fff' : '#e2e8f0' }}>{ch.label}</Text>
            </Pressable>
          );
        })}
        <View style={{ height: 1, backgroundColor: '#1e3a8a', marginVertical: 14 }} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#818cf8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Direct Messages</Text>
        {members.filter(m => m.id !== currentMemberId).map(m => {
          const isAct = channelId === m.id;
          return (
            <Pressable key={m.id} onPress={() => { setChannelId(m.id); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, marginBottom: 2, backgroundColor: isAct ? '#4f46e5' : 'transparent' }}>
              <Text style={{ fontSize: 18 }}>{m.emoji ?? '👤'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: isAct ? '#fff' : '#e2e8f0' }} numberOfLines={1}>{m.name.split(' ')[0]}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' }} />
                  <Text style={{ fontSize: 9, color: '#818cf8' }}>Online</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ margin: 10, padding: 10, backgroundColor: isDark ? '#1e293b' : '#312e81', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="shield-checkmark" size={16} color="#10b981" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>E2E Encrypted</Text>
          <Text style={{ fontSize: 10, color: '#818cf8' }}>AES-256-GCM · passcode-wrapped key</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId, loaded, loadFromStorage } = useFamilyStore();
  const { channels, loadChannel, sendMessage, addReaction, deleteMessage } = useChatStore();
  const { addItem: addGrocery } = useGroceryStore();

  const [channelId, setChannelId]         = useState('all');
  const [text, setText]                   = useState('');
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
  useEffect(() => { loadChannel(channelId); }, [channelId]);
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

  const memberMap    = Object.fromEntries(members.map(m => [m.id, m]));
  const activeMember = members.find(m => m.id === activeMemberId);
  const isParent     = activeMember?.role === 'parent';
  const kids         = members.filter(m => m.role !== 'parent');

  const allChannels = [
    ...GROUP_CHANNELS,
    ...kids.map(k => ({ id: k.id, label: `💬 ${k.name.split(' ')[0]}`, isDM: true, lock: false })),
  ];
  const FULL_LABELS: Record<string, string> = {
    all: '#all-family', parents: '🔒 #parents-vault', seniors: '👵 #seniors',
  };
  const channelLabel = FULL_LABELS[channelId] ?? `💬 ${memberMap[channelId]?.name?.split(' ')[0] ?? ''}`;

  const rawMsgs = channels[channelId]?.messages ?? [];
  const msgs    = searchQuery.trim()
    ? rawMsgs.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawMsgs;

  type DayGroup = { type: 'day'; label: string } | { type: 'msg'; msg: ChatMessage };
  const items: DayGroup[] = [];
  let lastDay = '';
  for (const m of msgs) {
    const day = formatDay(m.timestamp);
    if (day !== lastDay) { items.push({ type: 'day', label: day }); lastDay = day; }
    items.push({ type: 'msg', msg: m });
  }
  // Inverted FlatList renders index-0 at the visual bottom — newest first
  const reversedItems = [...items].reverse();

  // ── @mention suggestions ───────────────────────────────────────────────────

  const mentionSuggestions = mentionQuery !== null
    ? members.filter(m => m.id !== activeMemberId && m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  const handleTextChange = (val: string) => {
    setText(val);
    const atIdx = val.lastIndexOf('@');
    if (atIdx !== -1) {
      const after = val.slice(atIdx + 1);
      if (!after.includes(' ') && !after.includes(']')) { setMentionQuery(after); return; }
    }
    setMentionQuery(null);
  };

  const insertMention = (member: any) => {
    const atIdx  = text.lastIndexOf('@');
    const before = text.slice(0, atIdx);
    setText(before + `@[${member.name}|${member.id}] `);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = () => {
    if ((!text.trim() && !attachUri) || !activeMemberId) return;
    if (editingMsg) { deleteMessage(channelId, editingMsg.id); setEditingMsg(null); }
    sendMessage(channelId, activeMemberId, text.trim(), attachUri ?? undefined, attachUri ? attachType : undefined);
    setText(''); setAttachUri(null); setReplyingTo(null); setMentionQuery(null);
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

  const handleAttach = () => Alert.alert('Send Attachment', 'Choose an option', [
    { text: '📷 Camera',           onPress: pickCamera },
    { text: '🖼️ Photo Library',    onPress: pickImage },
    { text: '🎥 Record Video',      onPress: recordVideo },
    { text: '📄 File / Document',   onPress: () => Alert.alert('Coming Soon', 'File upload coming soon.') },
    { text: 'Cancel', style: 'cancel' },
  ]);

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
  const canSend      = text.trim().length > 0 || attachUri !== null;
  const parentLocked = channelId === 'parents' && !isParent;

  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <AppHeader
        memberName={activeMember?.name?.split(' ')[0] ?? 'Member'}
        memberRole={activeMember?.role ?? 'parent'}
        notifCount={0}
        onPersonaPress={() => setSwitcherOpen(true)}
      />

      {/* ── Channel strip ── */}
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
        <View style={[s.strip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingHorizontal: 2 }}>
            {allChannels.map(ch => {
              if ((ch as any).lock && !isParent) return null;
              const act = channelId === ch.id;
              return (
                <Pressable key={ch.id} onPress={() => setChannelId(ch.id)}
                  style={[s.channelBtn, { backgroundColor: act ? ((ch as any).isDM ? colors.primary : colors.card) : 'transparent' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: act ? ((ch as any).isDM ? '#fff' : colors.textPrimary) : colors.textTertiary }}>
                    {ch.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── Channel header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 6, gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="shield-checkmark" size={12} color="#10b981" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }} numberOfLines={1}>{channelLabel}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>· {members.length} members</Text>
        </View>
        <Pressable onPress={() => setSearchOpen(v => !v)}
          style={[s.iconBtn, { backgroundColor: searchOpen ? colors.primaryLight : colors.surface, borderColor: searchOpen ? colors.primary : colors.border }]}>
          <Ionicons name={searchOpen ? 'close' : 'search'} size={15} color={searchOpen ? colors.primary : colors.textSecondary} />
        </Pressable>
      </View>

      {/* ── Search bar ── */}
      <Animated.View style={{ height: searchHeight, overflow: 'hidden', paddingHorizontal: 14 }}>
        <View style={[s.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={14} color={colors.textTertiary} />
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
              }}><Ionicons name="chevron-up" size={18} color={colors.primary} /></Pressable>
              <Pressable onPress={() => {
                const next = (searchMatchIdx + 1) % msgs.length;
                setSearchMatchIdx(next);
                const idx = reversedItems.findIndex(it => it.type === 'msg' && it.msg.id === msgs[next].id);
                if (idx >= 0) flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
              }}><Ionicons name="chevron-down" size={18} color={colors.primary} /></Pressable>
              <Pressable onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={16} color={colors.textTertiary} /></Pressable>
            </>
          )}
        </View>
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {parentLocked ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#fef3c7', borderWidth: 2, borderColor: '#fbbf24', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="lock-closed" size={30} color="#b45309" />
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
              style={{ backgroundColor: isDark ? '#13131F' : '#EEF2FF' }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScroll={({ nativeEvent: { contentOffset } }) => {
                // In inverted list offset 0 = bottom; >200 means user scrolled up
                setShowScrollBtn(contentOffset.y > 200);
              }}
              scrollEventThrottle={100}
              onScrollToIndexFailed={({ index }) => {
                // Item not yet rendered — scroll to approximate offset then retry
                flatRef.current?.scrollToOffset({ offset: index * 80, animated: false });
                setTimeout(() => flatRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 200);
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                  <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                  <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 }}>
                    {searchQuery ? `No results for "${searchQuery}"` : 'No messages yet.\nSay hello! 👋'}
                  </Text>
                </View>
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
                    senderName={sender?.name?.split(' ')[0] ?? 'Family'}
                    senderEmoji={sender?.emoji ?? '👤'}
                    senderColor={accentColor(msg.senderId)}
                    activeMemberId={activeMemberId ?? ''}
                    memberMap={memberMap}
                    searchQuery={searchQuery}
                    colors={colors} isDark={isDark}
                    highlighted={highlightedMsgId === msg.id}
                    onLongPress={() => setActionMsg(msg)}
                    onDoubleTap={() => setQuickEmojiFor(msg)}
                    onSwipeRight={() => { setReplyingTo(msg); inputRef.current?.focus(); }}
                    onQuoteTap={msg.replyTo ? () => scrollToQuotedMsg(msg.replyTo!.id) : undefined}
                  />
                );
              }}
            />
            {/* Scroll-to-bottom */}
            {showScrollBtn && (
              <Pressable onPress={() => flatRef.current?.scrollToEnd({ animated: true })}
                style={{ position: 'absolute', bottom: 12, right: 16,
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: isDark ? 'rgba(99,102,241,0.75)' : 'rgba(99,102,241,0.6)',
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 }}>
                <Ionicons name="chevron-down" size={20} color="#fff" />
              </Pressable>
            )}

            {/* ── Mention dropdown ── */}
            {mentionSuggestions.length > 0 && (
              <View style={[s.mentionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {mentionSuggestions.map(m => (
                  <Pressable key={m.id} onPress={() => insertMention(m)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10,
                      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: accentColor(m.id)+'22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{m.emoji ?? '👤'}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{m.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{m.role}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {/* ── Reply banner ── */}
            {replyingTo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <Ionicons name="arrow-undo" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Reply to {memberMap[replyingTo.senderId]?.name?.split(' ')[0]}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>{replyingTo.text}</Text>
                </View>
                <Pressable onPress={() => setReplyingTo(null)}><Ionicons name="close" size={18} color={colors.textTertiary} /></Pressable>
              </View>
            )}

            {/* ── Edit banner ── */}
            {editingMsg && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: isDark ? '#1e293b' : '#fef9c3', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#fbbf24' }}>
                <Ionicons name="pencil" size={16} color="#f59e0b" />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>Editing: {editingMsg.text}</Text>
                <Pressable onPress={() => { setEditingMsg(null); setText(''); }}><Ionicons name="close" size={18} color={colors.textTertiary} /></Pressable>
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
                      <Ionicons name="videocam" size={16} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>{attachType === 'video' ? '🎥 Video clip (≤10s)' : '🖼️ Image'}</Text>
                </View>
                <Pressable onPress={() => setAttachUri(null)} style={{ padding: 6 }}>
                  <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
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

            {/* ── Input bar ── */}
            {!reviewing && !recording && (
              <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                {/* Attach */}
                <Pressable onPress={handleAttach}
                  style={[s.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="attach" size={18} color={colors.textSecondary} />
                </Pressable>

                {/* Text input */}
                <View style={[s.inputBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={handleTextChange}
                    placeholder={`Message ${channelLabel}…`}
                    placeholderTextColor={colors.placeholder}
                    multiline
                    maxLength={1000}
                    scrollEnabled
                    style={[s.input, { color: colors.textPrimary }]}
                  />
                </View>

                {/* Mic (hold to record) → Send (when text/attach ready) */}
                {canSend ? (
                  <Pressable onPress={handleSend}
                    style={[s.actionBtn, {
                      backgroundColor: colors.primary,
                      shadowColor: colors.primary,
                      shadowOpacity: 0.4, shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 }, elevation: 4,
                    }]}>
                    <Ionicons name="send" size={18} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={startRecording}
                    style={[s.actionBtn, {
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }]}>
                    <Ionicons name="mic-outline" size={20} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>

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
        addedByMemberId={activeMemberId ?? ''}
        onClose={() => setGroceryMsg(null)}
        onAdd={item => { addGrocery(item); Alert.alert('✅ Added!', `"${item.name}" added to the shopping list.`); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  strip:      { borderRadius: 14, borderWidth: 1, padding: 4 },
  channelBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10 },
  iconBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 42, marginBottom: 6 },
  dayRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  dayLine:    { flex: 1, height: StyleSheet.hairlineWidth },
  dayLabel:   { fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },
  mentionBox: { position: 'absolute', bottom: 70, left: 12, right: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 50, zIndex: 100 },
  inputBar:   { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10, gap: 7, borderTopWidth: StyleSheet.hairlineWidth },
  inputBubble:{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, borderWidth: 1,
    paddingHorizontal: 13, paddingVertical: 5 },
  // single line (minHeight ~36) → grows to 5 lines (~21px lineHeight × 5 = 105) then scrolls
  input:      { flex: 1, fontSize: 14.5, lineHeight: 21, minHeight: 36, maxHeight: 111,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4, textAlignVertical: 'top' },
  actionBtn:  { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
});
