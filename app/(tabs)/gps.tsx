import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';

export default function GpsScreen() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <Ionicons name="map" size={56} color={colors.info} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>GPS</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Live family location map — coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  title:  { fontSize: 26, fontWeight: '700' },
  sub:    { fontSize: 15, textAlign: 'center' },
});
