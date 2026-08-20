import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { resolveSpeechLocale } from '@/lib/units';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'done' | 'error';

export interface ParsedAppointment {
  title?: string;
  type?: string;
  scheduled_at?: string;
  vet_name?: string | null;
  clinic_name?: string | null;
  clinic_address?: string | null;
  notes?: string | null;
}

const PARSE_TIMEOUT_MS = 15_000;
const MIN_RECORDING_MS = 5_000;   // Minimum 5 seconds
const MAX_RECORDING_MS = 15_000;  // Maximum 15 seconds

export function useVoiceAppointment(onParsed: (fields: ParsedAppointment) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const VoiceRef    = useRef<any>(null);
  const onParsedRef = useRef(onParsed);
  const transcriptRef = useRef('');    // accumulates across partial results
  const endFiredRef   = useRef(false); // guard against double-fire on some devices
  const startTimeRef  = useRef(0);     // tracks when recording started
  const autoStopRef   = useRef<ReturnType<typeof setTimeout> | null>(null); // auto-stop timer

  // Keep onParsed ref current so parseTranscript always calls the latest version
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

  const parseTranscript = useCallback(async (transcript: string) => {
    const duration = Date.now() - startTimeRef.current;

    if (!transcript.trim()) {
      setError('Nothing was heard. Please try again.');
      setState('error');
      return;
    }

    // Check minimum recording duration
    if (duration < MIN_RECORDING_MS) {
      setError('Recording too short. Please record at least 5 seconds.');
      setState('error');
      return;
    }

    // Check maximum recording duration
    if (duration > MAX_RECORDING_MS) {
      setError('Recording too long. Please keep it to 15 seconds or less.');
      setState('error');
      return;
    }

    setState('processing');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('parse-appointment-voice', {
        body: { transcript, today: format(new Date(), 'yyyy-MM-dd') },
      });
      clearTimeout(timer);
      if (fnErr || !data?.appointment) throw new Error(fnErr?.message ?? 'AI could not parse the appointment.');
      onParsedRef.current(data.appointment as ParsedAppointment);
      setState('done');
    } catch (e: any) {
      clearTimeout(timer);
      let userMessage = 'Could not understand the appointment details.';

      if (e?.name === 'AbortError') {
        userMessage = 'Request timed out. Please try again.';
      } else if (e?.message) {
        // Filter out technical HTTP errors and show friendly messages instead
        const msg = e.message.toLowerCase();
        if (msg.includes('401') || msg.includes('unauthorized')) {
          userMessage = 'Permission denied. Please sign in again.';
        } else if (msg.includes('429') || msg.includes('too many')) {
          userMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (msg.includes('500') || msg.includes('internal')) {
          userMessage = 'Server error. Please try again later.';
        } else if (msg.includes('503') || msg.includes('unavailable')) {
          userMessage = 'Service temporarily unavailable. Please try again later.';
        } else if (!msg.includes('could not') && !msg.includes('ai') && msg.length > 100) {
          // If it's a long technical message, replace with friendly default
          userMessage = 'Could not parse the appointment details. Please try again.';
        } else {
          userMessage = e.message;
        }
      }

      setError(userMessage);
      setState('error');
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    transcriptRef.current = '';
    endFiredRef.current   = false;
    startTimeRef.current  = Date.now(); // Record when we started

    const Voice = await getVoice();
    if (!Voice) {
      setError('Speech recognition is not available on this device.');
      setState('error');
      return;
    }

    // Always destroy before re-starting to clear any stale listeners
    try { await Voice.destroy(); } catch {}

    // Accumulate partial results — take the longest/most complete one
    Voice.onSpeechResults = (e: any) => {
      const best = (e.value ?? []).reduce(
        (acc: string, v: string) => (v.length > acc.length ? v : acc),
        transcriptRef.current
      );
      transcriptRef.current = best;
    };

    Voice.onSpeechPartialResults = (e: any) => {
      // Keep updating so we have something even if onSpeechEnd fires early
      const best = (e.value ?? []).reduce(
        (acc: string, v: string) => (v.length > acc.length ? v : acc),
        transcriptRef.current
      );
      transcriptRef.current = best;
    };

    Voice.onSpeechEnd = () => {
      if (endFiredRef.current) return;
      endFiredRef.current = true;
      // Small delay to let final onSpeechResults fire before we parse
      setTimeout(() => parseTranscript(transcriptRef.current), 300);
    };

    Voice.onSpeechError = (e: any) => {
      const msg: string = e?.error?.message ?? e?.error?.code ?? 'Speech recognition failed.';
      // These are normal "user didn't speak" or "user cancelled" — not worth an error banner
      if (
        msg.includes('No speech') ||
        msg.includes('no_speech') ||
        msg.includes('recognition cancelled') ||
        msg.includes('7')  // Android error code 7 = no match / no speech
      ) {
        if (!endFiredRef.current && transcriptRef.current.trim()) {
          // Android sometimes fires error before end — if we have text, still parse
          endFiredRef.current = true;
          parseTranscript(transcriptRef.current);
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
      // Auto-stop after 5 seconds
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

  const stop = useCallback(async () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    const Voice = await getVoice();
    try { await Voice?.stop(); } catch {}
    // If onSpeechEnd doesn't fire (some Android versions), trigger manually after 600ms
    setTimeout(() => {
      if (!endFiredRef.current && transcriptRef.current.trim()) {
        endFiredRef.current = true;
        parseTranscript(transcriptRef.current);
      }
    }, 600);
  }, [getVoice, parseTranscript]);

  const cancel = useCallback(async () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    endFiredRef.current = true; // prevent any pending onSpeechEnd from firing
    const Voice = await getVoice();
    try { await Voice?.cancel(); } catch {}
    try { await Voice?.destroy(); } catch {}
    transcriptRef.current = '';
    startTimeRef.current  = 0;
    setState('idle');
    setError(null);
  }, [getVoice]);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    transcriptRef.current = '';
    endFiredRef.current   = false;
    startTimeRef.current  = 0;
  }, []);

  return { state, error, start, stop, cancel, reset };
}
