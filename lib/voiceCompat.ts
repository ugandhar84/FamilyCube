import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/**
 * Drop-in replacement for @react-native-voice/voice's event-callback API
 * (Voice.start/stop/destroy, Voice.onSpeechResults/onSpeechPartialResults/
 * onSpeechEnd/onSpeechError), backed by expo-speech-recognition instead.
 *
 * Why this exists: @react-native-voice/voice ships only a legacy
 * ReactPackage (no TurboModule/codegen support — confirmed via its own
 * package.json and VoicePackage.java), and this app runs with
 * newArchEnabled: true. Under Bridgeless/the New Architecture,
 * NativeModules.Voice resolves to null — a real, live-reported crash
 * ("Cannot read property 'startSpeech' of null") that three separate
 * attempts at RN's own TurboModule-interop feature flag
 * (useTurboModuleInterop, ReactNativeFeatureFlags.override, forcing
 * releaseLevel=CANARY) did NOT fix, even once each attempt's own crash was
 * resolved — confirmed live on the emulator each time, not assumed.
 * expo-speech-recognition is a maintained, New-Architecture-native module
 * built for exactly this kind of Expo app, so replacing the library
 * (rather than continuing to chase the interop mechanism) is the fix here.
 *
 * Kept as ONE shared shim rather than rewriting all 4 call sites
 * (useVoiceDictation.ts, useVoiceAppointment.ts, useVoiceIntake.ts, plus
 * lib/units.ts's own reference) — each hook's restart-on-benign-error/
 * silence-detection/transcript-concatenation logic is real, tested product
 * behavior that has nothing to do with which native speech engine answers
 * it; the ONLY thing that needed to change is where the Voice.* calls
 * resolve to. Every one of those hooks already imports Voice as
 * `const mod = await import('@react-native-voice/voice'); Voice = mod.default ?? mod`
 * — swapping that import target to this module is a one-line change per
 * hook, and this file's exported shape below intentionally mirrors
 * @react-native-voice/voice's own default export exactly, callback-style
 * assignment included, so nothing else in those hooks needs to change.
 */
type SpeechResultEvent = { value: string[] };
type SpeechErrorEvent = { error: { message?: string; code?: string } };

class VoiceCompat {
  onSpeechResults: ((e: SpeechResultEvent) => void) | null = null;
  onSpeechPartialResults: ((e: SpeechResultEvent) => void) | null = null;
  onSpeechEnd: (() => void) | null = null;
  onSpeechError: ((e: SpeechErrorEvent) => void) | null = null;

  private listeners: { remove: () => void }[] = [];
  private started = false;

  private attachListeners() {
    this.detachListeners();
    this.listeners.push(
      ExpoSpeechRecognitionModule.addListener('result', (e: any) => {
        const value = (e.results ?? []).map((r: any) => r.transcript).filter(Boolean);
        const handler = e.isFinal ? this.onSpeechResults : this.onSpeechPartialResults;
        handler?.({ value });
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        this.started = false;
        this.onSpeechEnd?.();
      }),
      ExpoSpeechRecognitionModule.addListener('error', (e: any) => {
        this.started = false;
        // expo-speech-recognition's own "no speech"/timeout equivalent —
        // mirrors the benign-error codes useVoiceDictation/useVoiceAppointment/
        // useVoiceIntake already check for (message includes "No speech" /
        // "no_speech" / "recognition cancelled" / "7") so their existing
        // restart-on-benign-error logic keeps working unchanged.
        this.onSpeechError?.({ error: { message: e.message, code: e.error } });
      }),
    );
  }

  private detachListeners() {
    this.listeners.forEach((l) => l.remove());
    this.listeners = [];
  }

  async start(locale: string): Promise<void> {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Microphone permission denied. Please allow it in Settings.');
    }
    this.attachListeners();
    this.started = true;
    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: true,
      continuous: true,
    });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    ExpoSpeechRecognitionModule.stop();
  }

  async destroy(): Promise<void> {
    this.started = false;
    this.detachListeners();
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
  }
}

const Voice = new VoiceCompat();
export default Voice;
