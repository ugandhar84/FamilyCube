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
  PanResponder, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import MapView, { Marker } from 'react-native-maps';
import { useAudioRecorder, AudioModule, RecordingPresets, createAudioPlayer } from 'expo-audio';
import {
  Play, Pause, Trash2, Send, Square, CheckCheck, Search, X, XCircle,
  ChevronDown, ChevronUp, CornerUpLeft, Copy, ShoppingCart, Pencil,
  MessageSquare, Paperclip, Mic, Lock, ShieldCheck, Video, Plus,
  Camera, Image as ImageIcon, MapPin, FileText,
  type LucideIcon,
} from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import AppHeader from '@/components/AppHeader';
import FamilyAvatar from '@/components/FamilyAvatar';
import { useChatStore, ChatMessage } from '@/store/chatStore';
import { useGroceryStore, GroceryCategory, GroceryStore } from '@/store/groceryStore';
import { supabase } from '@/lib/supabase';
import { RADIUS } from '@/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function formatDay(iso: string) {
  const d     = new Date(iso);
  const today = new Date();
  const yest  = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString())  return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/** Strip markdown bold/italic asterisks and render @mentions inline. */
function MentionText({ text, memberMap, myId, searchQuery, textStyle, numberOfLines, onTextLayout }: {
  text: string; memberMap: Record<string, any>; myId: string; searchQuery?: string; textStyle: any;
  numberOfLines?: number; onTextLayout?: (e: any) => void;
}) {
  // Split on mention tokens first, then strip * from plain segments
  const parts = text.split(/(@\[[^\]]+\|[^\]]+\])/g);
  return (
    <Text style={textStyle} numberOfLines={numberOfLines} onTextLayout={onTextLayout}>
      {parts.map((part, i) => {
        const m = part.match(/^@\[([^\]]+)\|([^\]]+)\]$/);
        if (m) {
          const [, , id] = m;
          const member = memberMap[id];
          const isMe   = id === myId;
          return (
            <Text key={i} style={{ fontWeight: '800', color: isMe ? '#fbbf24' : '#a78bfa' }}>
              @{member?.name?.split(' ')[0] ?? 'unknown'}
            </Text>
          );
        }
        // Strip markdown bold/italic markers (* and _)
        const clean = part.replace(/\*+([^*]+)\*+/g, '$1').replace(/_([^_]+)_/g, '$1');
        return searchQuery
          ? highlightSearch(clean, searchQuery, {})
          : <Text key={i}>{clean}</Text>;
      })}
    </Text>
  );
}

// ─── Voice note bubble ────────────────────────────────────────────────────────

// ─── Waveform helpers ─────────────────────────────────────────────────────────

const WF_BARS = 36;
const WF_H    = 36; // container height px

/** Deterministic "fingerprint" waveform from a seed string (uri / msgId). */
function seedWaveform(seed: string): number[] {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) & 0x7fffffff;
  return Array.from({ length: WF_BARS }, (_, i) => {
    const x   = i / WF_BARS;
    const ph  = ((h >>> (i % 20)) & 0xff) / 255;
    const raw = 0.08
      + 0.42 * Math.abs(Math.sin(x * Math.PI * 5  + ph * Math.PI * 2))
      + 0.28 * Math.abs(Math.sin(x * Math.PI * 9  + ph * Math.PI * 3.7))
      + 0.14 * Math.abs(Math.sin(x * Math.PI * 14 + ph * Math.PI * 1.3));
    return Math.min(1, raw);
  });
}

// ─── Live waveform (recording / playing) — sine-physics at ~30fps ────────────

function LiveWaveform({ active, color, trackColor, progress = 0 }: {
  active: boolean; color: string; trackColor: string; progress?: number;
}) {
  const frameRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: WF_BARS }, (_, i) => {
      const x = i / WF_BARS;
      return 0.08 + 0.18 * Math.abs(Math.sin(x * Math.PI * 4));
    })
  );

  useEffect(() => {
    if (!active) {
      timerRef.current && clearInterval(timerRef.current);
      // settle to quiet resting state
      setBars(Array.from({ length: WF_BARS }, (_, i) => {
        const x = i / WF_BARS;
        return 0.08 + 0.14 * Math.abs(Math.sin(x * Math.PI * 5 + 0.4));
      }));
      return;
    }
    timerRef.current = setInterval(() => {
      frameRef.current += 1;
      const t = frameRef.current * 0.10;
      setBars(Array.from({ length: WF_BARS }, (_, i) => {
        const x   = i / WF_BARS;
        const ph  = x * Math.PI * 2;
        // Three overlapping sines → organic, non-repetitive wave
        const raw = 0.10
          + 0.38 * Math.abs(Math.sin(t * 1.9 + ph))
          + 0.26 * Math.abs(Math.sin(t * 3.1 + ph * 1.6 + 0.9))
          + 0.18 * Math.abs(Math.sin(t * 4.7 + ph * 0.7 + 1.8));
        return Math.min(1, raw);
      }));
    }, 33); // ~30 fps
    return () => { timerRef.current && clearInterval(timerRef.current); };
  }, [active]);

  const filledBars = Math.round(progress * WF_BARS);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: WF_H, flex: 1 }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: Math.max(3, h * WF_H),
            borderRadius: 2,
            backgroundColor: i < filledBars ? color : trackColor,
          }}
        />
      ))}
    </View>
  );
}

// ─── Static fingerprint waveform (playback) ───────────────────────────────────

function FingerprintWaveform({ seed, progress, color, trackColor }: {
  seed: string; progress: number; color: string; trackColor: string;
}) {
  const wf          = useRef(seedWaveform(seed)).current;
  const filledBars  = Math.round(progress * WF_BARS);
  // The bar at the playhead pulses slightly
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (progress > 0 && progress < 1) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 280, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 280, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.stopAnimation(() => pulseAnim.setValue(1));
    }
  }, [progress > 0 && progress < 1]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: WF_H, flex: 1 }}>
      {wf.map((h, i) => {
        const isHead = i === filledBars;
        const barH   = Math.max(3, h * WF_H);
        if (isHead) {
          return (
            <Animated.View key={i} style={{ width: 3, height: barH, borderRadius: 2,
              backgroundColor: color, transform: [{ scaleY: pulseAnim }] }} />
          );
        }
        return (
          <View key={i} style={{ width: 3, height: barH, borderRadius: 2,
            backgroundColor: i < filledBars ? color : trackColor }} />
        );
      })}
    </View>
  );
}

// ─── Voice note bubble (in chat) ─────────────────────────────────────────────

function VoiceNoteBubble({ uri, msgId, duration, isMine, colors }: {
  uri: string; msgId: string; duration: number; isMine: boolean; colors: any;
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
    // Switch audio session to playback mode so it works after a recording session
    try { await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }); } catch {}
    playerRef.current?.remove();
    playerRef.current = createAudioPlayer({ uri });
    playerRef.current.play();
    setProgress(0);
    setPlaying(true);
    tickRef.current = setInterval(() => {
      const pos = playerRef.current?.currentTime ?? 0;
      const dur = duration > 0 ? duration : 1;
      setProgress(pos / dur);
      if (pos >= dur - 0.15) {
        if (tickRef.current) clearInterval(tickRef.current);
        setPlaying(false); setProgress(0);
      }
    }, 80);
  }, [playing, uri, duration]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    playerRef.current?.remove();
  }, []);

  const color      = isMine ? '#fff' : VOICE_COLOR;
  const trackColor = isMine ? 'rgba(255,255,255,0.28)' : VOICE_COLOR + '30';
  const elapsed    = playing ? progress * duration : duration;

  return (
    <Pressable onPress={toggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2, paddingVertical: 4, minWidth: 200 }}>
      {/* Play / pause button */}
      <View style={{ width: 36, height: 36, borderRadius: 18,
        backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : VOICE_COLOR + '22',
        alignItems: 'center', justifyContent: 'center' }}>
        {playing ? <Pause size={18} color={color} /> : <Play size={18} color={color} />}
      </View>
      {/* Waveform — live while playing, static fingerprint otherwise */}
      {playing
        ? <LiveWaveform active color={color} trackColor={trackColor} progress={progress} />
        : <FingerprintWaveform seed={msgId || uri} progress={progress} color={color} trackColor={trackColor} />
      }
      {/* Duration */}
      <Text style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,0.8)' : colors.textSecondary,
        minWidth: 34, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
        {formatDuration(elapsed)}
      </Text>
    </Pressable>
  );
}

// ─── Voice review bar (after recording, before sending) ───────────────────────

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
    }, 80);
  }, [playing, uri, duration]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    playerRef.current?.remove();
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: bg, borderTopWidth: 1, borderTopColor: border, gap: 10 }}>
      {/* Discard */}
      <Pressable onPress={onDiscard} style={{ width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center' }}>
        <Trash2 size={19} color="#EF4444" />
      </Pressable>
      {/* Play/pause */}
      <Pressable onPress={toggle} style={{ width: 36, height: 36, borderRadius: 18,
        backgroundColor: VOICE_COLOR + '22', alignItems: 'center', justifyContent: 'center' }}>
        {playing ? <Pause size={18} color={VOICE_COLOR} /> : <Play size={18} color={VOICE_COLOR} />}
      </Pressable>
      {/* Waveform */}
      {playing
        ? <LiveWaveform active color={VOICE_COLOR} trackColor={isDark ? '#4C1D9055' : '#DDD6FE'} progress={progress} />
        : <FingerprintWaveform seed={uri} progress={progress} color={VOICE_COLOR} trackColor={isDark ? '#4C1D9055' : '#DDD6FE'} />
      }
      {/* Time */}
      <Text style={{ fontSize: 12, fontWeight: '600', color: VOICE_COLOR, minWidth: 34, fontVariant: ['tabular-nums'] }}>
        {formatDuration(playing ? progress * duration : duration)}
      </Text>
      {/* Send */}
      <Pressable onPress={onSend} style={{ width: 40, height: 40, borderRadius: 20,
        backgroundColor: VOICE_COLOR, alignItems: 'center', justifyContent: 'center',
        shadowColor: VOICE_COLOR, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}>
        <Send size={16} color="#fff" />
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
  const MAX    = 10;
  // Blink the red dot
  const blinkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blinkAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
      Animated.timing(blinkAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const remaining = MAX - elapsed;
  const showCountdown = remaining <= 3;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: bg, borderTopWidth: 1, borderTopColor: border, gap: 10 }}>
      {/* Blinking REC dot */}
      <Animated.View style={{ width: 10, height: 10, borderRadius: 5,
        backgroundColor: '#EF4444', opacity: blinkAnim }} />
      {/* Elapsed */}
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#EF4444', minWidth: 38, fontVariant: ['tabular-nums'] }}>
        {formatDuration(elapsed)}
      </Text>
      {/* Live sine waveform — red */}
      <LiveWaveform active color='#EF4444' trackColor={isDark ? '#7f1d1d55' : '#fca5a555'} />
      {/* Countdown warning */}
      {showCountdown && (
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#b91c1c', minWidth: 24 }}>
          -{Math.ceil(remaining)}s
        </Text>
      )}
      {/* Stop button */}
      <Pressable onPress={onStop}
        style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#EF4444',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#EF4444', shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 }}>
        <Square size={16} color="#fff" fill="#fff" />
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
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

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

// ─── Collapsible text (10-line cap with Show more / Show less) ───────────────

const COLLAPSE_LINES = 10;

function CollapsibleText({ text, memberMap, myId, searchQuery, isMe, bubbleMeTxt, bubbleOtherTxt }: {
  text: string; memberMap: Record<string, any>; myId: string; searchQuery?: string;
  isMe: boolean; bubbleMeTxt: string; bubbleOtherTxt: string;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const txtColor = isMe ? bubbleMeTxt : bubbleOtherTxt;
  const txtStyle = { fontSize: 15, lineHeight: 22, letterSpacing: 0.1, fontWeight: '400' as const, color: txtColor };

  return (
    <View>
      <MentionText
        text={text}
        memberMap={memberMap}
        myId={myId}
        searchQuery={searchQuery}
        textStyle={txtStyle}
        numberOfLines={needsCollapse && collapsed ? COLLAPSE_LINES : undefined}
        onTextLayout={(e: any) => {
          if (!needsCollapse && e.nativeEvent.lines.length > COLLAPSE_LINES) setNeedsCollapse(true);
        }}
      />
      {needsCollapse && (
        <Pressable onPress={() => setCollapsed(v => !v)} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 4,
            color: isMe ? 'rgba(255,255,255,0.75)' : '#818cf8' }}>
            {collapsed ? 'Show more ▾' : 'Show less ▴'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Message bubble (WhatsApp style — rounded rect with tail) ────────────────

const BUBBLE_R  = 18; // standard corners
const BUBBLE_SM = 4;  // tail corner (last in group)

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
  const bubbleMe       = colors.primary;
  const bubbleMeTxt    = '#FFFFFF';
  const bubbleOther    = isDark ? '#131927' : '#FFFFFF';
  const bubbleOtherTxt = isDark ? '#E2E8F0' : '#0F172A';
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

  // Flat corner on the chat-side tip (last bubble in group)
  const btlr = isMe ? BUBBLE_R : (isGroupFirst ? BUBBLE_SM : BUBBLE_R);
  const btrr = isMe ? (isGroupFirst ? BUBBLE_SM : BUBBLE_R) : BUBBLE_R;
  const bblr = BUBBLE_R;
  const bbrr = BUBBLE_R;

  // Timestamp + tick — inline at bottom-right of bubble (WhatsApp style)
  const metaRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
      alignSelf: 'flex-end', marginTop: 4, marginBottom: -2 }}>
      {msg.edited && <Text style={{ fontSize: 9, color: tsColor }}>edited · </Text>}
      <Text style={{ fontSize: 10, color: tsColor }}>{formatTime(msg.timestamp)}</Text>
      {isMe && <CheckCheck size={13} color={isDark ? '#53BDEB' : '#34B7F1'} />}
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
        marginBottom: isGroupLast ? 14 : 3, marginTop: isGroupFirst ? 8 : 0 }}>

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

        <Animated.View style={{ maxWidth: '78%', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2,
          borderRadius: BUBBLE_R, borderWidth: highlightWidth, borderColor: highlightBorder }}>
          {/* Sender name — above bubble, outside */}
          {!isMe && isGroupFirst && (
            <Text style={{ fontSize: 11, fontWeight: '800', color: senderColor, marginLeft: 4, marginBottom: 1 }}>
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
              borderWidth: isMe ? 0 : 1,
              borderColor: isDark ? '#1E293B' : '#E2E8F0',
              overflow: 'hidden',
              padding: isVoice ? 8 : 11,
              minWidth: msg.replyTo ? 220 : undefined,
              shadowColor: '#000',
              shadowOpacity: isMe ? 0.18 : (isDark ? 0.25 : 0.06),
              shadowRadius: isMe ? 6 : 3,
              shadowOffset: { width: 0, height: isMe ? 2 : 1 },
              elevation: isMe ? 3 : 1,
            }}
          >
            {/* Reply quote — WhatsApp inset card */}
            {msg.replyTo && (
              <Pressable onPress={onQuoteTap}
                style={{
                  flexDirection: 'row',
                  borderRadius: 10,
                  overflow: 'hidden',
                  marginBottom: 8,
                  // Outgoing: dark navy card so it pops against purple
                  // Incoming: very light tinted card against white/dark card
                  backgroundColor: isMe
                    ? (isDark ? '#1E1B4B' : '#2D1F6E')
                    : (isDark ? '#0F172A' : '#EDE9FE'),
                }}>
                {/* Accent strip — sender colour */}
                <View style={{ width: 3, backgroundColor: senderColor }} />
                <View style={{ flex: 1, paddingHorizontal: 9, paddingVertical: 7 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', marginBottom: 2,
                    color: senderColor }}>
                    {memberMap[msg.replyTo.senderId]?.name?.split(' ')[0] ?? 'Family'}
                  </Text>
                  <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16,
                    color: isMe ? '#C4B5FD' : (isDark ? '#94A3B8' : '#6D28D9') }}>
                    {msg.replyTo.text || '🎙️ Voice note'}
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Sender name — shown outside/above bubble on first in group */}
            {!isMe && isGroupFirst && false && null}

            {/* Voice note */}
            {isVoice && msg.voiceUri ? (
              <VoiceNoteBubble uri={msg.voiceUri} msgId={msg.id} duration={msg.voiceDuration ?? 0} isMine={isMe} colors={colors} />
            ) : isVoice ? (
              <Text style={{ fontSize: 14, color: isMe ? bubbleMeTxt : bubbleOtherTxt }}>
                🎙️ Voice note ({Math.round(msg.voiceDuration ?? 0)}s)
              </Text>
            ) : (
              <>
                {/* Location pin */}
                {msg.locationPin && (
                  <Pressable
                    onPress={() => {
                      const { lat, lng, address } = msg.locationPin!;
                      const label = encodeURIComponent(address);
                      const appleUrl  = `maps:0,0?q=${label}&ll=${lat},${lng}`;
                      const googleUrl = `comgooglemaps://?q=${label}&center=${lat},${lng}`;
                      const webUrl    = `https://maps.google.com/?q=${lat},${lng}`;
                      Linking.canOpenURL(googleUrl)
                        .then(can => Linking.openURL(can ? googleUrl : appleUrl))
                        .catch(() => Linking.openURL(webUrl));
                    }}
                    style={{ borderRadius: 12, overflow: 'hidden', width: 230, marginHorizontal: -2 }}>
                    {/* Map snapshot — non-interactive, tap handled by outer Pressable */}
                    <MapView
                      style={{ width: 230, height: 140 }}
                      initialRegion={{ latitude: msg.locationPin.lat, longitude: msg.locationPin.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }}
                      scrollEnabled={false} zoomEnabled={false}
                      pitchEnabled={false} rotateEnabled={false}
                      pointerEvents="none"
                      legalLabelInsets={{ bottom: -999, right: -999 }}
                    >
                      <Marker coordinate={{ latitude: msg.locationPin.lat, longitude: msg.locationPin.lng }} />
                    </MapView>
                    {/* Address footer */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 10, paddingVertical: 8,
                      backgroundColor: isMe ? 'rgba(0,0,0,0.28)' : (isDark ? '#1e293b' : '#f1f5f9') }}>
                      <MapPin size={13} color={isMe ? '#C4B5FD' : colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700',
                          color: isMe ? '#fff' : colors.textPrimary }} numberOfLines={1}>
                          {msg.locationPin.address}
                        </Text>
                        <Text style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.55)' : colors.textTertiary }}>
                          Tap to open in Maps
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                )}
                {/* Document attachment */}
                {msg.documentUri && (
                  <Pressable onPress={() => Linking.openURL(msg.documentUri!)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : (isDark ? '#1e293b' : '#f1f5f9'),
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, maxWidth: 220 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#F59E0B22',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={20} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isMe ? '#fff' : colors.textPrimary }} numberOfLines={2}>
                        {msg.documentName ?? 'Document'}
                      </Text>
                      <Text style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : colors.textTertiary }}>
                        Tap to open
                      </Text>
                    </View>
                  </Pressable>
                )}
                {/* Image / video */}
                {msg.imageUri && (
                  <Pressable
                    onPress={() => msg.mediaType === 'video' ? setVideoLightboxUri(msg.imageUri!) : setLightboxUri(msg.imageUri!)}
                    style={{ marginBottom: msg.text ? 6 : 0, borderRadius: 12, overflow: 'hidden' }}>
                    <Image source={{ uri: msg.imageUri }} style={{ width: 210, height: 158 }} resizeMode="cover" />
                    {msg.mediaType === 'video' && (
                      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 24, padding: 10 }}>
                          <Play size={22} color="#fff" fill="#fff" />
                        </View>
                      </View>
                    )}
                  </Pressable>
                )}
                {/* Text — collapse after 10 lines */}
                {!!msg.text && (
                  <CollapsibleText
                    text={msg.text}
                    memberMap={memberMap}
                    myId={activeMemberId}
                    searchQuery={searchQuery}
                    isMe={isMe}
                    bubbleMeTxt={bubbleMeTxt}
                    bubbleOtherTxt={bubbleOtherTxt}
                  />
                )}
              </>
            )}
            {/* Time + tick — inside bubble, bottom-right (WhatsApp style) */}
            {metaRow}
          </Pressable>

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

  type Action = { Icon: LucideIcon; label: string; color: string; onPress: () => void };
  const actions: Action[] = [
    { Icon: CornerUpLeft,  label: 'Reply',        color: colors.primary,       onPress: onReply },
    { Icon: Copy,          label: 'Copy Text',    color: colors.textSecondary, onPress: onCopy },
    { Icon: ShoppingCart,  label: 'Add to List',  color: '#10b981',            onPress: onAddGrocery },
    ...(isMe && canEdit ? [
      { Icon: Pencil,      label: 'Edit',         color: '#f59e0b',            onPress: onEdit },
    ] : []),
    ...(isMe ? [
      { Icon: Trash2,      label: 'Delete',       color: '#ef4444',            onPress: onDelete },
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
                <a.Icon size={18} color={a.color} />
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
              <ShoppingCart size={20} color="#10b981" />
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>Add to Shopping List</Text>
            </View>
            <Pressable onPress={onClose}><X size={20} color={colors.textSecondary} /></Pressable>
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
              <Plus size={16} color="#fff" />
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
        <Pressable onPress={onClose} style={{ padding: 4 }}><X size={18} color="#818cf8" /></Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 14 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#818cf8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Channels</Text>
        {GROUP_CHANNELS.map(ch => {
          if (ch.lock && !isParent) return null;
          const isAct = channelId === ch.id;
          return (
            <Pressable key={ch.id} onPress={() => { setChannelId(ch.id); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, marginBottom: 2, backgroundColor: isAct ? active : 'transparent' }}>
              <MessageSquare size={14} color={isAct ? '#fff' : '#818cf8'} />
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
        <ShieldCheck size={16} color="#10b981" />
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
  const [tipVisible, setTipVisible]       = useState(true);
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

  const handleSend = () => {
    if ((!text.trim() && !attachUri) || !activeMemberId) return;
    if (editingMsg) { deleteMessage(channelId, editingMsg.id); setEditingMsg(null); }
    // Convert display tokens "@FirstName" back to storage format "@[Name|id]"
    let finalText = text.trim();
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    {(ch as any).isDM && (
                      <View style={{ width: 7, height: 7, borderRadius: 4,
                        backgroundColor: '#22c55e',
                        borderWidth: 1.5, borderColor: act ? colors.primary : colors.surface }} />
                    )}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: act ? ((ch as any).isDM ? '#fff' : colors.textPrimary) : colors.textTertiary }}>
                      {ch.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── Channel sub-header: label + member avatars ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, gap: 8, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <ShieldCheck size={12} color="#10b981" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }} numberOfLines={1}>{channelLabel}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>· {members.length} members</Text>
        </View>

        {/* Avatar cluster — solid separator border so no ring bleed */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {members.slice(0, 5).map((m: any, i: number) => {
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
          {members.length > 5 && (
            <View style={{
              marginLeft: -10, zIndex: 0,
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: colors.surface,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: colors.card,
            }}>
              <Text style={{ fontSize: 8, fontWeight: '900', color: colors.textSecondary }}>
                +{members.length - 5}
              </Text>
            </View>
          )}
        </View>

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
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#fef3c7', borderWidth: 2, borderColor: '#fbbf24', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={30} color="#b45309" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' }}>🔒 Parents Vault</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>Restricted to parents. Switch profile to access.</Text>
          </View>
        ) : (
          <>
            {/* ── Family coaching tip banner ── */}
            {isParent && tipVisible && (
              <View style={{
                marginHorizontal: 12, marginTop: 6, marginBottom: 2,
                borderRadius: 14, padding: 10,
                backgroundColor: isDark ? '#1A1040' : '#F3F0FF',
                borderWidth: 1, borderColor: isDark ? '#4B38B360' : '#6C5CE730',
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              }}>
                <Text style={{ fontSize: 16, lineHeight: 20 }}>📌</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: colors.primary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
                    Family Goal Insights
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
                    Break larger weekend chores into smaller 10-min steps to help kids build streaks without feeling overwhelmed!
                  </Text>
                </View>
                <Pressable onPress={() => setTipVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.textTertiary, fontWeight: '700' }}>✕</Text>
                </Pressable>
              </View>
            )}

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
              onTouchStart={() => showAttachMenu && setShowAttachMenu(false)}
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
              <Pressable onPress={() => flatRef.current?.scrollToOffset({ offset: 0, animated: true })}
                style={{ position: 'absolute', bottom: 12, right: 16,
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
                <ChevronDown size={22} color="#fff" />
              </Pressable>
            )}

            {/* ── Reply banner ── */}
            {replyingTo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
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
                backgroundColor: isDark ? '#1e293b' : '#fef9c3', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#fbbf24' }}>
                <Pencil size={16} color="#f59e0b" />
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
                  { Icon: Camera,    label: 'Camera',   color: '#6C5CE7', onPress: () => { setShowAttachMenu(false); pickCamera(); } },
                  { Icon: ImageIcon, label: 'Photo',    color: '#10B981', onPress: () => { setShowAttachMenu(false); pickImage(); } },
                  { Icon: Video,     label: 'Video',    color: '#EF4444', onPress: () => { setShowAttachMenu(false); recordVideo(); } },
                  { Icon: FileText,  label: 'Document', color: '#F59E0B', onPress: () => { setShowAttachMenu(false); sendDocument(); } },
                  { Icon: MapPin,    label: 'Location', color: '#3B82F6', onPress: () => { setShowAttachMenu(false); sendLocation(); } },
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
  sendBtn:    { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  bareIconBtn:{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  attachMenu: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingVertical: 12, borderTopWidth: 1 },
  attachItem: { alignItems: 'center', gap: 6, flex: 1 },
  attachIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  attachLabel:{ fontSize: 11, fontWeight: '700' },
});
