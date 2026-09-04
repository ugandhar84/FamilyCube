import { useState, useEffect, useCallback, useRef } from 'react';
import { familyAi, ExtractResponsibilityResult } from '@/lib/familyAiService';
import { resolveSpeechLocale } from '@/lib/units';

// Same speech-capture shape as useVoiceAppointment.ts (health/appointments'
// voice intake) — this hook is the equivalent entry point for the shared
// event/quest/errand classifier (family-ai's extract_responsibility action),
// so the app has one voice-capture pattern, not a divergent one per feature.
export type VoiceState = 'idle' | 'listening' | 'processing' | 'done' | 'error';

const PARSE_TIMEOUT_MS = 15_000;
const MIN_RECORDING_MS = 3_000;   // shorter minimum than appointments — a
                                   // ride/quest request is often a single
                                   // short sentence ("pick up Maya at 5").
const MAX_RECORDING_MS = 20_000;

export function useVoiceIntake(onParsed: (result: ExtractResponsibilityResult) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  // Live partial transcript, mirrored from transcriptRef so the UI can show
  // words appearing as the user speaks — @react-native-voice/voice's
  // on-device recognition already produces this (onSpeechPartialResults
  // below), it just wasn't exposed as state before, only used internally.
  // No AI/network round-trip involved in the transcription itself; the LLM
  // only sees the text after the user stops speaking.
  const [liveTranscript, setLiveTranscript] = useState('');
  const VoiceRef       = useRef<any>(null);
  const onParsedRef    = useRef(onParsed);
  const transcriptRef  = useRef('');
  const endFiredRef    = useRef(false);
  const startTimeRef   = useRef(0);
  const autoStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onParsedRef.current = onParsed; }, [onParsed]);

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
    return () => {
      getVoice().then(v => v?.destroy?.().catch(() => {}));
    };
  }, [getVoice]);

  const parseTranscript = useCallback(async (transcript: string, existingMembers?: { id: string; name: string }[]) => {
    const duration = Date.now() - startTimeRef.current;

    if (!transcript.trim()) {
      setError('Nothing was heard. Please try again.');
      setState('error');
      return;
    }
    if (duration < MIN_RECORDING_MS) {
      setError('Recording too short. Please try again.');
      setState('error');
      return;
    }
    if (duration > MAX_RECORDING_MS) {
      setError('Recording too long. Please keep it brief.');
      setState('error');
      return;
    }

    setState('processing');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    try {
      const result = await familyAi.extractResponsibility(transcript, existingMembers);
      clearTimeout(timer);
      if (!result || (!result.task && !result.errand)) {
        throw new Error("Could not figure out an event, chore, or errand from that — try again with more detail.");
      }
      onParsedRef.current(result);
      setState('done');
    } catch (e: any) {
      clearTimeout(timer);
      let userMessage = 'Could not understand the request.';
      if (e?.name === 'AbortError') {
        userMessage = 'Request timed out. Please try again.';
      } else if (e?.message) {
        const msg = e.message.toLowerCase();
        if (msg.includes('401') || msg.includes('unauthorized')) {
          userMessage = 'Permission denied. Please sign in again.';
        } else if (msg.includes('429') || msg.includes('too many')) {
          userMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (msg.includes('500') || msg.includes('internal')) {
          userMessage = 'Server error. Please try again later.';
        } else if (msg.includes('503') || msg.includes('unavailable')) {
          userMessage = 'Service temporarily unavailable. Please try again later.';
        } else if (e.message.length < 150) {
          userMessage = e.message;
        }
      }
      setError(userMessage);
      setState('error');
    }
  }, []);

  const start = useCallback(async (existingMembers?: { id: string; name: string }[]) => {
    setError(null);
    transcriptRef.current = '';
    setLiveTranscript('');
    endFiredRef.current   = false;
    startTimeRef.current  = Date.now();

    const Voice = await getVoice();
    if (!Voice) {
      setError('Speech recognition is not available on this device.');
      setState('error');
      return;
    }

    try { await Voice.destroy(); } catch {}

    Voice.onSpeechResults = (e: any) => {
      const best = (e.value ?? []).reduce(
        (acc: string, v: string) => (v.length > acc.length ? v : acc),
        transcriptRef.current
      );
      transcriptRef.current = best;
      setLiveTranscript(best);
    };

    Voice.onSpeechPartialResults = (e: any) => {
      const best = (e.value ?? []).reduce(
        (acc: string, v: string) => (v.length > acc.length ? v : acc),
        transcriptRef.current
      );
      transcriptRef.current = best;
      setLiveTranscript(best);
    };

    Voice.onSpeechEnd = () => {
      if (endFiredRef.current) return;
      endFiredRef.current = true;
      setTimeout(() => parseTranscript(transcriptRef.current, existingMembers), 300);
    };

    Voice.onSpeechError = (e: any) => {
      const msg: string = e?.error?.message ?? e?.error?.code ?? 'Speech recognition failed.';
      if (
        msg.includes('No speech') ||
        msg.includes('no_speech') ||
        msg.includes('recognition cancelled') ||
        msg.includes('7')
      ) {
        if (!endFiredRef.current && transcriptRef.current.trim()) {
          endFiredRef.current = true;
          parseTranscript(transcriptRef.current, existingMembers);
        } else if (!endFiredRef.current) {
          setState('idle');
        }
      } else {
        setError(msg);
        setState('error');
      }
    };

    try {
      await Voice.start(resolveSpeechLocale());
      setState('listening');
      autoStopRef.current = setTimeout(() => {
        Voice?.stop?.().catch(() => {});
      }, MAX_RECORDING_MS);
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('permission') || msg.includes('Permission')) {
        setError('Microphone permission denied. Please allow it in Settings.');
      } else {
        setError(msg || 'Could not start microphone.');
      }
      setState('error');
    }
  }, [getVoice, parseTranscript]);

  const stop = useCallback(async (existingMembers?: { id: string; name: string }[]) => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    const Voice = await getVoice();
    try { await Voice?.stop(); } catch {}
    setTimeout(() => {
      if (!endFiredRef.current && transcriptRef.current.trim()) {
        endFiredRef.current = true;
        parseTranscript(transcriptRef.current, existingMembers);
      }
    }, 600);
  }, [getVoice, parseTranscript]);

  const cancel = useCallback(async () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    endFiredRef.current = true;
    const Voice = await getVoice();
    try { await Voice?.cancel(); } catch {}
    try { await Voice?.destroy(); } catch {}
    transcriptRef.current = '';
    startTimeRef.current  = 0;
    setState('idle');
    setError(null);
    setLiveTranscript('');
  }, [getVoice]);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    transcriptRef.current = '';
    endFiredRef.current   = false;
    startTimeRef.current  = 0;
    setLiveTranscript('');
  }, []);

  return { state, error, start, stop, cancel, reset, liveTranscript };
}
