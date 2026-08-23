import { useState, useEffect, useCallback, useRef } from 'react';
import { resolveSpeechLocale } from '@/lib/units';

// Plain speech-to-text capture — no AI classification step, unlike
// useVoiceIntake (which always routes the transcript through family-ai's
// extract_responsibility). The transcript IS the message, reviewed/edited
// by the user before they send it — this hook never sends anything itself.
// Same on-device @react-native-voice/voice engine throughout.
export type DictationState = 'idle' | 'listening' | 'error';

const MAX_RECORDING_MS = 60_000;
// How long a pause has to be before we treat the user as "done talking" for
// UI purposes (e.g. enabling Send) — NOT a stop timer. Recognition keeps
// running the whole time the mic is on; a mid-sentence pause under a few
// seconds is completely normal and must not truncate the transcript.
// Deliberately generous — a native English speaker rarely needs it, but a
// non-native speaker, someone composing a longer thought, or anyone with a
// speech difference commonly pauses well past 2s mid-sentence. This value
// only enables the Send button (see silenceReady below); it never
// auto-sends anything itself.
const SILENCE_READY_MS = 2_000;

export function useVoiceDictation(onSilenceReady?: (transcript: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  // True once the user has paused for SILENCE_READY_MS while still
  // listening — lets the UI enable Send without stopping the mic, so the
  // user can still keep talking / append more if they want.
  const [silenceReady, setSilenceReady] = useState(false);
  const VoiceRef       = useRef<any>(null);
  const transcriptRef  = useRef('');
  // Text already finalized from PRIOR recognition sessions, before the
  // current session's own (independent, restarts-from-empty) results are
  // appended. See the onSpeechEnd/restart comment below for why this
  // exists — without it, restarting mid-utterance either lost everything
  // said before the restart or duplicated words spoken right at the
  // restart boundary, since each new session's onSpeechResults reports
  // only what IT heard, not a continuation of the whole utterance.
  const committedPrefixRef = useRef('');
  const autoStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSilenceReadyRef = useRef(onSilenceReady);
  useEffect(() => { onSilenceReadyRef.current = onSilenceReady; }, [onSilenceReady]);

  const getVoice = useCallback(async () => {
    if (VoiceRef.current) return VoiceRef.current;
    try {
      const mod = await import('@react-native-voice/voice');
      VoiceRef.current = mod.default ?? mod;
      return VoiceRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    return () => { getVoice().then(v => v?.destroy?.().catch(() => {})); };
  }, [getVoice]);

  const start = useCallback(async () => {
    setError(null);
    setSilenceReady(false);
    transcriptRef.current = '';
    committedPrefixRef.current = '';
    setLiveTranscript('');

    const Voice = await getVoice();
    if (!Voice) {
      setError('Speech recognition is not available on this device.');
      setState('error');
      return;
    }
    try { await Voice.destroy(); } catch {}

    const armSilenceTimer = () => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      setSilenceReady(false);
      silenceRef.current = setTimeout(() => {
        setSilenceReady(true);
        onSilenceReadyRef.current?.(transcriptRef.current);
      }, SILENCE_READY_MS);
    };

    // Each recognition session's own onSpeechResults reports only what THAT
    // session heard, starting from nothing — it has no memory of words
    // spoken before a restart. "Longest result wins" (the old logic) broke
    // as soon as a restart happened: the new session's growing-from-empty
    // result briefly lost to the old session's already-long final result,
    // and once it did grow past it, it replaced the WHOLE transcript with
    // only the post-restart words, or duplicated the last few words heard
    // right at the restart boundary. Concatenating this session's result
    // onto committedPrefixRef (fixed at the moment of each restart) instead
    // is what actually preserves a continuous transcript across restarts.
    const updateTranscript = (e: any) => {
      const sessionBest = (e.value ?? []).reduce(
        (acc: string, v: string) => (v.length > acc.length ? v : acc),
        ''
      );
      const combined = committedPrefixRef.current
        ? `${committedPrefixRef.current} ${sessionBest}`.trim()
        : sessionBest;
      transcriptRef.current = combined;
      setLiveTranscript(combined);
      armSilenceTimer();
    };
    Voice.onSpeechResults = updateTranscript;
    Voice.onSpeechPartialResults = updateTranscript;

    // Some platforms fire onSpeechEnd after a brief pause even though the
    // recognizer is still willing to keep listening — restart immediately
    // rather than dropping into 'idle' (which would silently stop capturing
    // words mid-sentence, the exact "cutting off" symptom). Whatever the
    // transcript is AT THE MOMENT of restart becomes the fixed prefix the
    // next session's own results get appended onto.
    const speechLocale = resolveSpeechLocale();

    const restart = () => {
      committedPrefixRef.current = transcriptRef.current;
      Voice.start(speechLocale).catch(() => {});
    };

    Voice.onSpeechEnd = () => {
      if (autoStopRef.current === null) return; // start() already tore this down via stop()
      restart();
    };
    Voice.onSpeechError = (e: any) => {
      const msg: string = e?.error?.message ?? e?.error?.code ?? '';
      const benign = msg.includes('No speech') || msg.includes('no_speech') || msg.includes('recognition cancelled') || msg.includes('7');
      if (benign) {
        // Restart on a benign timeout/no-speech error instead of stopping —
        // same reasoning as onSpeechEnd above.
        if (autoStopRef.current !== null) restart();
        return;
      }
      setError(msg || 'Speech recognition failed.');
      setState('error');
    };

    try {
      await Voice.start(speechLocale);
      setState('listening');
      autoStopRef.current = setTimeout(() => { Voice?.stop?.().catch(() => {}); autoStopRef.current = null; setState('idle'); }, MAX_RECORDING_MS);
      armSilenceTimer(); // also catches "never said anything at all"
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      setError(msg.includes('ermission') ? 'Microphone permission denied. Please allow it in Settings.' : (msg || 'Could not start microphone.'));
      setState('error');
    }
  }, [getVoice]);

  const stop = useCallback(async () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null; // signals onSpeechEnd/onSpeechError not to auto-restart
    if (silenceRef.current) clearTimeout(silenceRef.current);
    const Voice = await getVoice();
    try { await Voice?.stop(); } catch {}
    setState('idle');
    return transcriptRef.current;
  }, [getVoice]);

  const reset = useCallback(() => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    autoStopRef.current = null;
    if (silenceRef.current) clearTimeout(silenceRef.current);
    setState('idle');
    setError(null);
    setSilenceReady(false);
    transcriptRef.current = '';
    committedPrefixRef.current = '';
    setLiveTranscript('');
  }, []);

  return { state, error, liveTranscript, silenceReady, start, stop, reset };
}
