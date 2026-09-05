/**
 * ArcadeScreen — shared full-screen shell for every game screen under
 * app/hub/games/**: the bgTop→bgBottom gradient background + the 56pt
 * header (back chevron + centered Baloo2 title). Identical across all 4
 * games by design — this one element does most of the "same arcade"
 * cohesion work; only the body content (passed as children) varies.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_TYPO } from '../theme/gameTheme';
import { loadMutePreference, setMuted as setAudioMuted, playMusic, stopMusic, type MusicName } from '../theme/gameAudio';

// Loaded lazily here — scoped to the games feature, not the app's global
// startup path (app/_layout.tsx is already dense with critical startup
// logic; the Baloo 2 face is only ever needed once someone actually opens
// a game screen). Every game screen renders through this one component,
// so the font loads exactly once regardless of how many games get built.
//
// Also owns the ambient background music lifecycle — starts on entering
// ANY app/hub/games/* screen (this component is the one thing every game
// screen renders through) and stops on leaving, ties the "entering an
// arcade" moment to both sight and sound at once, per the design plan.
export function ArcadeScreen({
  title, children, musicTrack = 'arcadeLoop', backgroundColors, musicStopped = false,
}: {
  title: string; children: React.ReactNode; musicTrack?: MusicName;
  // Overrides the shared violet arcade gradient — e.g. Uno's own felt-green
  // table backdrop — so the header strip is cut from the SAME gradient as
  // the body beneath it instead of staying the default violet while a
  // game screen paints something else entirely below: a two-tone screen
  // reads as broken chrome, not two intentional zones.
  backgroundColors?: [string, string, ...string[]];
  // Lets a game screen stop the ambient loop itself once ITS OWN game-over
  // state becomes true, rather than only ever stopping on navigating away
  // — sitting on a finished game's result screen with music still looping
  // reads as the game not knowing it ended.
  musicStopped?: boolean;
}) {
  const [fontsLoaded] = useFonts({ Baloo2_700Bold, Baloo2_800ExtraBold });
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    loadMutePreference().then(setMutedState);
    playMusic(musicTrack);
    return () => stopMusic();
  }, [musicTrack]);

  const musicStoppedMountRef = useRef(true);
  useEffect(() => {
    // Skip the very first run — the mount effect above already starts
    // music once; this effect only needs to react to musicStopped
    // actually CHANGING (game-over stopping it, a restart resuming it).
    if (musicStoppedMountRef.current) { musicStoppedMountRef.current = false; return; }
    if (musicStopped) stopMusic();
    else playMusic(musicTrack);
  }, [musicStopped]);

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  };

  return (
    <LinearGradient colors={backgroundColors ?? [ARCADE.bgTop, ARCADE.bgBottom]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 12 }}>
          <Pressable
            onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ width: 40, alignItems: 'flex-start' }}
            accessibilityRole="button" accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={ARCADE.textSecondary} />
          </Pressable>
          <Text style={{
            flex: 1, textAlign: 'center',
            fontFamily: fontsLoaded ? ARCADE_FONT_DISPLAY_BOLD : undefined,
            fontWeight: fontsLoaded ? undefined : '800',
            fontSize: ARCADE_TYPO.heading,
            color: ARCADE.textPrimary, letterSpacing: 0.3,
          }} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={toggleMute} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ width: 40, alignItems: 'flex-end' }}
            accessibilityRole="button" accessibilityLabel={muted ? 'Unmute sound' : 'Mute sound'}
          >
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={ARCADE.textSecondary} />
          </Pressable>
        </View>
        {fontsLoaded ? children : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={ARCADE.primary} />
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}
