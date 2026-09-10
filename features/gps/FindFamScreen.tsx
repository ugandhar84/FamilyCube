/**
 * FindFamScreen — top-level tab wrapper around GpsTab (the same Family
 * Radar map/list previously only reachable via Profile's Apps grid). Given
 * its own bottom-nav slot for parents specifically: checking where family
 * members are is frequent/time-sensitive enough to want one tap, not a
 * lookup buried in Apps.
 *
 * No header bar, no SafeAreaView top inset — full-bleed map from the very
 * top of the screen, matching Apple's own Find My layout exactly
 * [live-requested: "I want the full bleed to the top the map and dont
 * need any headers"]. GpsTab's own bottom sheet already handles the
 * bottom safe area; the status bar floats directly over the map, same as
 * Find My's own screen.
 */
import { View } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import GpsTab from '@/features/vault/tabs/GpsTab';

export default function FindFamScreen() {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GpsTab colors={colors} isDark={isDark} />
    </View>
  );
}
