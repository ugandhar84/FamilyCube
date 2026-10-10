import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { AudioModule, createAudioPlayer } from 'expo-audio';
import { Play, Pause, Trash2, Send, Square } from 'lucide-react-native';
import { VOICE_COLOR, WF_BARS, WF_H, formatDuration, seedWaveform } from './constants';
import { withAndroidShadowFix } from '@/lib/androidShadowFix';
import { GEMINI } from '@/constants/geminiRhythm';

// ─── Live waveform (recording / playing) — sine-physics at ~30fps ────────────

export function LiveWaveform({ active, color, trackColor, progress = 0 }: {
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

export function FingerprintWaveform({ seed, progress, color, trackColor }: {
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

export function VoiceNoteBubble({ uri, msgId, duration, isMine, colors }: {
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

export function VoiceReviewProgress({ uri, duration, isDark, onSend, onDiscard }: {
  uri: string; duration: number; isDark: boolean; onSend: () => void; onDiscard: () => void;
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
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
      <Pressable onPress={onSend} style={withAndroidShadowFix({ width: 40, height: 40, borderRadius: 20,
        backgroundColor: VOICE_COLOR, alignItems: 'center', justifyContent: 'center',
        shadowColor: VOICE_COLOR, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 })}>
        <Send size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

// Standalone card/border wrapper around VoiceReviewProgress — for callers
// (kiosk) that don't have their own attach-sheet container to render into.
export function VoiceReviewBar({ uri, duration, isDark, onSend, onDiscard }: {
  uri: string; duration: number; isDark: boolean; onSend: () => void; onDiscard: () => void;
}) {
  const bg     = isDark ? '#1D1A24' : GEMINI.cardBg;
  const border = isDark ? 'rgba(238,128,88,0.15)' : GEMINI.border;
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: bg, borderTopWidth: 1, borderTopColor: border }}>
      <VoiceReviewProgress uri={uri} duration={duration} isDark={isDark} onSend={onSend} onDiscard={onDiscard} />
    </View>
  );
}

// ─── Active recording progress ────────────────────────────────────────────────
// Content-only — no outer card/border of its own. Rendered INSIDE the same
// s.attachMenu sheet container the Camera/Photo/Video/Document/Location
// options use, swapped in for that row when recording is active, so
// tapping Mic reuses the exact same sheet instead of popping a separate bar
// [live-requested: "when i open the attach it is opening the options
// sheet.. if the user click the mic it should use for the mic recording
// progress animations/components"].

export function RecordingProgress({ elapsed, isDark, onStop }: {
  elapsed: number; isDark: boolean; onStop: () => void;
}) {
  const MAX = 10;
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
      {/* Pastel recording chip — same 52x52/radius-16 shape as attachIcon */}
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#EF444422',
        alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ width: 12, height: 12, borderRadius: 6,
          backgroundColor: '#EF4444', opacity: blinkAnim }} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#EF4444', minWidth: 38, fontVariant: ['tabular-nums'] }}>
            {formatDuration(elapsed)}
          </Text>
          {showCountdown && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#b91c1c' }}>
              -{Math.ceil(remaining)}s
            </Text>
          )}
        </View>
        {/* Live sine waveform — red */}
        <LiveWaveform active color='#EF4444' trackColor={isDark ? '#3a3440' : '#F0EDE6'} />
      </View>
      {/* Stop button */}
      <Pressable onPress={onStop}
        style={withAndroidShadowFix({ width: 44, height: 44, borderRadius: 22, backgroundColor: '#EF4444',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#EF4444', shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 })}>
        <Square size={17} color="#fff" fill="#fff" />
      </Pressable>
    </View>
  );
}

// Standalone card/border wrapper around RecordingProgress — for callers
// (kiosk) that don't have their own attach-sheet container to render into.
export function RecordingBar({ elapsed, isDark, onStop }: {
  elapsed: number; isDark: boolean; onStop: () => void;
}) {
  const bg     = isDark ? '#1D1A24' : GEMINI.cardBg;
  const border = isDark ? 'rgba(238,128,88,0.15)' : GEMINI.border;
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12,
      backgroundColor: bg, borderTopWidth: 1, borderTopColor: border }}>
      <RecordingProgress elapsed={elapsed} isDark={isDark} onStop={onStop} />
    </View>
  );
}
