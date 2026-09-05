/**
 * gameAudio — sound-effect + background-music manager for the Family
 * Games arcade. Built on `expo-audio` (already a project dependency, used
 * elsewhere for chat voice notes) via its plain module-level
 * `createAudioPlayer` — NOT the `useAudioPlayer` hook — so this can be a
 * singleton callable from anywhere (game logic callbacks, not just
 * component render), matching how the rest of gameStore/game logic is
 * structured as plain functions.
 *
 * Placeholder tones ship under assets/sounds/games/ today (short
 * synthesized beeps distinct enough to verify each SFX cue fires at the
 * right moment) — swap the files in that folder for real sound design
 * later; every call site here stays the same.
 *
 * Mute is a per-device preference (AsyncStorage, not per-family) — see
 * loadMutePreference/setMuted.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MUTE_STORAGE_KEY = 'familycube.games.muted';

const SFX_SOURCES = {
  cardFlip: require('../../../assets/sounds/games/card-flip.mp3'),
  cardDeal: require('../../../assets/sounds/games/card-deal.mp3'),
  moveTick: require('../../../assets/sounds/games/move-tick.mp3'),
  win: require('../../../assets/sounds/games/win.mp3'),
  lose: require('../../../assets/sounds/games/lose.mp3'),
  unoCall: require('../../../assets/sounds/games/uno-call.mp3'),
  snakeEat: require('../../../assets/sounds/games/snake-eat.mp3'),
  snakeCrash: require('../../../assets/sounds/games/snake-crash.mp3'),
  // Uno-specific event stings — distinct from the generic cardFlip/cardDeal
  // reused by the other 3 games, so each Uno moment (a plain play, a
  // disruptive Skip/Reverse, a stacked Draw penalty, choosing a wild's
  // color) has its own identifiable sound instead of everything sounding
  // like the same "card touched" click.
  unoPlay: require('../../../assets/sounds/games/uno-play.mp3'),
  unoSkip: require('../../../assets/sounds/games/uno-skip.mp3'),
  unoReverse: require('../../../assets/sounds/games/uno-reverse.mp3'),
  unoDrawPenalty: require('../../../assets/sounds/games/uno-draw-penalty.mp3'),
  unoWildColor: require('../../../assets/sounds/games/uno-wild-color.mp3'),
} as const;

const MUSIC_SOURCES = {
  arcadeLoop: require('../../../assets/sounds/games/arcade-loop.mp3'),
  // Softer, lower-volume, longer loop than the generic arcade bed — meant
  // to sit behind a slower-paced, more social game (Uno hands can run
  // several minutes) without the beepy arcade loop grating over time.
  unoLoop: require('../../../assets/sounds/games/uno-loop.mp3'),
} as const;

export type SfxName = keyof typeof SFX_SOURCES;
export type MusicName = keyof typeof MUSIC_SOURCES;

let muted = false;
let audioModeReady = false;
let musicPlayer: AudioPlayer | null = null;
let currentMusicName: MusicName | null = null;
const sfxPlayers = new Map<SfxName, AudioPlayer>();

async function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  try {
    // Respect the iOS silent switch (games are a "fun sound" surface, not
    // a call/alarm) — playsInSilentMode:false would be the alternative,
    // but true matches how most casual mobile games behave and is less
    // surprising than a game going silent in Do Not Disturb.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  } catch (e) {
    console.warn('[gameAudio] setAudioModeAsync failed:', (e as Error)?.message);
  }
}

export async function loadMutePreference() {
  try {
    const stored = await AsyncStorage.getItem(MUTE_STORAGE_KEY);
    muted = stored === 'true';
  } catch {
    muted = false;
  }
  return muted;
}

export function isMuted() {
  return muted;
}

export async function setMuted(next: boolean) {
  muted = next;
  if (musicPlayer) musicPlayer.muted = next;
  sfxPlayers.forEach(p => { p.muted = next; });
  try {
    await AsyncStorage.setItem(MUTE_STORAGE_KEY, String(next));
  } catch (e) {
    console.warn('[gameAudio] failed to persist mute preference:', (e as Error)?.message);
  }
}

export async function playSfx(name: SfxName) {
  await ensureAudioMode();
  try {
    let player = sfxPlayers.get(name);
    if (!player) {
      player = createAudioPlayer(SFX_SOURCES[name]);
      sfxPlayers.set(name, player);
    }
    player.muted = muted;
    player.seekTo(0);
    player.play();
  } catch (e) {
    console.warn(`[gameAudio] playSfx(${name}) failed:`, (e as Error)?.message);
  }
}

export async function playMusic(name: MusicName) {
  await ensureAudioMode();
  // NOTE: this early-return used to also require `musicPlayer` truthy, but
  // that made it possible to get stuck permanently silent — stopMusic()
  // pauses the player and clears currentMusicName to null, but a caller
  // that mounts/unmounts/remounts in quick succession (e.g. React 18
  // StrictMode's dev-only double-invoke of effects, or this screen's own
  // conditional ArcadeScreen instances swapping while a session loads)
  // could hit: play -> [effect cleanup fires immediately] stop -> [effect
  // re-runs] play again with the SAME name, at which point the guard here
  // must still resume playback even though currentMusicName never
  // actually changed. Always re-assert loop/mute/play on the existing
  // player when the track hasn't changed, instead of assuming "already
  // playing" from the name alone.
  if (currentMusicName === name && musicPlayer) {
    musicPlayer.loop = true;
    musicPlayer.muted = muted;
    musicPlayer.play();
    return;
  }
  try {
    musicPlayer?.remove();
    musicPlayer = createAudioPlayer(MUSIC_SOURCES[name]);
    musicPlayer.loop = true;
    musicPlayer.muted = muted;
    musicPlayer.play();
    currentMusicName = name;
  } catch (e) {
    console.warn(`[gameAudio] playMusic(${name}) failed:`, (e as Error)?.message);
  }
}

export function stopMusic() {
  try {
    musicPlayer?.pause();
  } catch { /* no-op — player may already be torn down */ }
  // currentMusicName is intentionally NOT cleared here — this only pauses
  // playback (e.g. leaving a game screen); the player instance and its
  // identity stay valid so a subsequent playMusic() call for the SAME
  // track resumes the existing player via the branch above instead of
  // rebuilding it from scratch, and — critically — so this pause can never
  // be mistaken for "no track was ever started" the way clearing this to
  // null previously allowed.
}
