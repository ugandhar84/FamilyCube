/**
 * gameVoice — spoken event announcements for the Uno table, on top of the
 * tone stings in gameAudio.
 *
 * Why a separate module from gameAudio: gameAudio owns *files* (bundled
 * mp3s played through expo-audio players it pools and reuses). This owns
 * the device's native TTS engine via expo-speech, which has no player, no
 * preloading, and a completely different failure surface. The one thing
 * they share is the mute preference, which stays owned by gameAudio —
 * this module only READS it via isMuted() so a muted player is silent
 * across both surfaces from a single toggle.
 *
 * ── Which events get a voice ──
 * Only the disruptive/exciting moments a real table actually shouts about:
 * UNO!, Skip, Reverse, and the draw penalties. Deliberately NOT plain
 * number cards — a voice line on every ordinary play would be unbearable
 * within one hand, and those already have their own quiet `unoPlay`
 * sting. Wild is included only at the moment a color is CHOSEN (the
 * table-changing beat), not when the wild leaves the hand.
 */
import * as Speech from 'expo-speech';
import { isMuted } from './gameAudio';

export type VoiceLine = 'uno' | 'skip' | 'reverse' | 'draw2' | 'draw4' | 'wild' | 'win' | 'lose';

const LINES: Record<VoiceLine, string> = {
  uno: 'UNO!',
  skip: 'Skipped!',
  reverse: 'Reverse!',
  draw2: 'Draw two!',
  draw4: 'Draw four!',
  wild: 'Wild!',
  win: 'You win!',
  lose: 'Game over!',
};

/**
 * Slightly faster and slightly higher than the platform default (1.0/1.0),
 * which reads as an energetic announcer rather than a flat screen-reader.
 * Kept modest on purpose — past ~1.25 rate the device voices start
 * clipping consonants and short exclamations like "UNO!" turn to mush.
 */
const SPEECH_OPTIONS: Speech.SpeechOptions = {
  rate: 1.08,
  pitch: 1.12,
  language: 'en-US',
};

/**
 * Announcements fired closer together than this are dropped rather than
 * queued. Without it, a stacked +2 chain or a Skip landing right as the
 * local player taps CALL UNO! would leave the TTS engine reciting a
 * backlog of lines several seconds after the moment they described has
 * passed — stale narration is worse than no narration.
 */
const MIN_GAP_MS = 650;
let lastSpokeAt = 0;

export function speakEvent(line: VoiceLine) {
  speakText(LINES[line]);
}

/**
 * Announces an arbitrary line — used for the multiplayer win moment,
 * where the message names the actual winner ("Alex wins!") rather than
 * the fixed "You win!"/"Game over!" LINES entries, which only make sense
 * from the local player's own perspective.
 */
export function speakText(text: string) {
  if (isMuted()) return;
  const now = Date.now();
  if (now - lastSpokeAt < MIN_GAP_MS) return;
  lastSpokeAt = now;
  try {
    // stop() first so a new event always interrupts a still-playing older
    // one: on iOS Speech.speak QUEUES by default, and for game callouts
    // the newest event is the relevant one.
    Speech.stop();
    Speech.speak(text, SPEECH_OPTIONS);
  } catch (e) {
    // Never let a TTS failure surface into gameplay — this is decoration.
    console.warn(`[gameVoice] speakText(${text}) failed:`, (e as Error)?.message);
  }
}

/** Silence any in-flight announcement (leaving the table, muting). */
export function stopVoice() {
  try {
    Speech.stop();
  } catch { /* no-op — engine may not be initialized */ }
}
