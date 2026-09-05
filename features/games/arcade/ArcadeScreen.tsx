/**
 * ArcadeScreen — shared full-screen shell for every game screen under
 * app/hub/games/**: the bgTop→bgBottom gradient background + the 56pt
 * header (back chevron + centered Baloo2 title). Identical across all 4
 * games by design — this one element does most of the "same arcade"
 * cohesion work; only the body content (passed as children) varies.
 */
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD, ARCADE_TYPO } from '../theme/gameTheme';

// Loaded lazily here — scoped to the games feature, not the app's global
// startup path (app/_layout.tsx is already dense with critical startup
// logic; the Baloo 2 face is only ever needed once someone actually opens
// a game screen). Every game screen renders through this one component,
// so the font loads exactly once regardless of how many games get built.
export function ArcadeScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const [fontsLoaded] = useFonts({ Baloo2_700Bold, Baloo2_800ExtraBold });

  return (
    <LinearGradient colors={[ARCADE.bgTop, ARCADE.bgBottom]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ width: 40, alignItems: 'flex-start' }}>
            <Ionicons name="chevron-back" size={24} color={ARCADE.textSecondary} />
          </Pressable>
          <Text style={{
            flex: 1, textAlign: 'center', marginRight: 40,
            fontFamily: fontsLoaded ? ARCADE_FONT_DISPLAY_BOLD : undefined,
            fontWeight: fontsLoaded ? undefined : '800',
            fontSize: ARCADE_TYPO.heading,
            color: ARCADE.textPrimary, letterSpacing: 0.3,
          }} numberOfLines={1}>
            {title}
          </Text>
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
