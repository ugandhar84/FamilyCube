import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

const { width: SW } = Dimensions.get('window');
const PHOTO_SIZE = SW - 48;

const SCAN_STEPS = [
  { text: 'Detecting pet in frame…',   icon: 'search-outline',    durationMs: 900 },
  { text: 'Reading facial cues…',       icon: 'eye-outline',       durationMs: 900 },
  { text: 'Analysing body language…',  icon: 'body-outline',      durationMs: 900 },
  { text: 'Calculating mood score…',   icon: 'analytics-outline', durationMs: 700 },
];

export const ScanOverlay = React.memo(function ScanOverlay({ ac }: { ac: string }) {
  const scanY  = useRef(new Animated.Value(0)).current;
  const pulse  = useRef(new Animated.Value(1)).current;
  const corner = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState(0);

  useEffect(() => {
    const anim1 = Animated.loop(Animated.sequence([
      Animated.timing(scanY, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scanY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]));
    anim1.start();

    const anim2 = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    anim2.start();

    const anim3 = Animated.loop(Animated.timing(corner, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    anim3.start();

    let elapsed = 0;
    const timers = SCAN_STEPS.map((s, i) => {
      const t = setTimeout(() => setStep(i), elapsed);
      elapsed += s.durationMs;
      return t;
    });
    return () => { anim1.stop(); anim2.stop(); anim3.stop(); timers.forEach(clearTimeout); };
  }, []);

  const translateY = scanY.interpolate({ inputRange: [0, 1], outputRange: [0, PHOTO_SIZE - 4] });
  const rotateDeg  = corner.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const cur = SCAN_STEPS[step];

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: `${ac}22` }} />
      <Animated.View style={{
        position: 'absolute', top: 8, left: 8, right: 8, bottom: 8,
        borderRadius: PHOTO_SIZE / 2 * 0.15,
        borderWidth: 2, borderColor: `${ac}90`,
        transform: [{ scale: pulse }],
      }} />
      <Animated.View style={{
        position: 'absolute', left: 0, right: 0, height: 3,
        backgroundColor: ac, opacity: 0.9,
        shadowColor: ac, shadowOpacity: 1, shadowRadius: 8,
        transform: [{ translateY }],
      }} />
      {([{ top: 12, left: 12 }, { top: 12, right: 12 }, { bottom: 12, left: 12 }, { bottom: 12, right: 12 }] as any[]).map((pos, i) => (
        <Animated.View key={i} style={[{
          position: 'absolute', width: 22, height: 22, borderRadius: 3,
          borderTopWidth: 3, borderLeftWidth: 3, borderColor: ac, ...pos,
        }, { transform: [{ rotate: rotateDeg }] }]} />
      ))}
      <View style={{
        position: 'absolute', bottom: 12, left: 12, right: 12,
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: `${ac}E0`, borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 8,
      }}>
        <Ionicons name={cur?.icon as any} size={16} color="#fff" />
        <Text style={{ color: '#fff', fontSize: TYPO.body, fontWeight: '700', flex: 1 }}>{cur?.text}</Text>
        <ActivityIndicator size="small" color="#fff" />
      </View>
    </View>
  );
});
