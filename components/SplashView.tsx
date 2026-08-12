/**
 * SplashView — FamilyCube branded loading indicator.
 * Used as the native-splash replacement while the JS bundle hydrates.
 */
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const TEAL   = '#00BBA4';
const AMBER  = '#F5A623';
const PINK   = '#F04E98';
const PURPLE = '#9261C7';

const COLORS = [TEAL, AMBER, PINK, PURPLE, TEAL];

export default function SplashView() {
  return (
    <LinearGradient
      colors={['#100A2E', '#0D1A52', '#07101E']}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={s.root}
    >
      <View style={s.dots}>
        {COLORS.map((color, i) => (
          <View key={i} style={[s.dot, { backgroundColor: color, opacity: 0.7 + i * 0.06 }]} />
        ))}
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:  { width: 10, height: 10, borderRadius: 5 },
});
