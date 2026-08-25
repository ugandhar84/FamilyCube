/**
 * FindFamScreen — top-level tab wrapper around GpsTab (the same Family
 * Radar map/list previously only reachable via Profile's Apps grid). Given
 * its own bottom-nav slot for parents specifically: checking where family
 * members are is frequent/time-sensitive enough to want one tap, not a
 * lookup buried in Apps.
 */
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Radio } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import GpsTab from '@/features/vault/tabs/GpsTab';

export default function FindFamScreen() {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={[styles.iconChip, { backgroundColor: colors.teal + '18', borderColor: colors.teal + '30' }]}>
          <Radio size={17} color={colors.teal} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>FindFam</Text>
      </View>
      <GpsTab colors={colors} isDark={isDark} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconChip: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
});
