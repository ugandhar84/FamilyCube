import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Animated, ActivityIndicator } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';

const PROCESSING_STEPS = [
  'Getting to know your baby…',
  'Building their health profile…',
  'Setting up personalised care…',
  'Almost ready to meet them! 🐾',
];

export const ProcessingAnimation = React.memo(function ProcessingAnimation({ petName, accentColor, onDone }: { petName: string; accentColor: string; onDone: () => void }) {
  const { colors } = useTheme();
  const [stepIdx, setStepIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;

    const tick = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      setStepIdx(i);
      i++;
      if (i < PROCESSING_STEPS.length) {
        timers.push(setTimeout(tick, 900));
      } else {
        timers.push(setTimeout(() => { if (!cancelled) onDoneRef.current(); }, 900));
      }
    };

    timers.push(setTimeout(tick, 400));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: 32 }}>
      <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: accentColor + '20', borderColor: accentColor + '40' }}>
        <Text style={{ fontSize: 52 }}>🐾</Text>
      </View>
      <Text style={{ fontSize: TYPO.title, fontWeight: '800', color: colors.textPrimary, marginTop: 28, marginBottom: 12, textAlign: 'center', letterSpacing: -0.3 }}>
        Welcome to the family, {petName || 'little one'} 🏠
      </Text>
      <Animated.Text style={{ fontSize: TYPO.body, color: accentColor, textAlign: 'center', fontWeight: '600', opacity: fadeAnim }}>
        {PROCESSING_STEPS[stepIdx]}
      </Animated.Text>
      <ActivityIndicator color={accentColor} size="large" style={{ marginTop: 28 }} />
    </View>
  );
});
