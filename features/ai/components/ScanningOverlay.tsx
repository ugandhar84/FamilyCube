import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { TYPO } from '@/constants/theme';

export const ScanningOverlay = React.memo(function ScanningOverlay({ petName, pulseAnim, rotateAnim, dotsAnim, colors }: {
  petName: string; pulseAnim: Animated.Value; rotateAnim: Animated.Value;
  dotsAnim: Animated.Value; colors: any;
}) {
  const spin = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const [dotCount, setDotCount] = useState(1);
  const STEPS = ['Reading symptoms', 'Checking species flags', 'Assessing urgency', 'Preparing advice'];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setDotCount(d => d >= 3 ? 1 : d + 1), 400);
    const s = setInterval(() => setStep(p => Math.min(p + 1, STEPS.length - 1)), 1800);
    return () => { clearInterval(t); clearInterval(s); };
  }, []);

  return (
    <View style={s.overlay}>
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.iconWrap}>
          <Animated.View style={[s.ring, { borderColor: colors.primary, transform: [{ rotate: spin }] }]} />
          <Animated.View style={[s.pulse, { backgroundColor: `${colors.primary}18`, transform: [{ scale: pulseAnim }] }]} />
          <View style={[s.iconInner, { backgroundColor: `${colors.primary}22` }]}>
            <Text style={{ fontSize: 38 }}>🔬</Text>
          </View>
        </View>

        <Text style={[s.title, { color: colors.textPrimary }]}>Analyzing {petName}'s symptoms</Text>

        <View style={s.stepsWrap}>
          {STEPS.map((label, i) => (
            <View key={i} style={s.stepRow}>
              <View style={[s.stepDot, {
                backgroundColor: i < step ? colors.primary : i === step ? colors.primary : colors.border,
                opacity: i <= step ? 1 : 0.3,
              }]}>
                {i < step && <Text style={{ fontSize: TYPO.body, color: '#fff' }}>✓</Text>}
              </View>
              <Text style={[s.stepLabel, { color: i <= step ? colors.textPrimary : colors.textTertiary, fontWeight: i === step ? '700' : '400' }]}>
                {label}{i === step ? '.'.repeat(dotCount) : ''}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[s.hint, { color: colors.textSecondary }]}>
          You'll get a push notification when it's ready
        </Text>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  overlay:    { position: 'absolute', top: -16, left: -16, right: -16, bottom: -200,
                backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 100, borderRadius: 20 },
  card:       { width: 300, borderRadius: 24, padding: 28, alignItems: 'center', gap: 16,
                shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  iconWrap:   { width: 100, height: 100, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  ring:       { position: 'absolute', width: 96, height: 96, borderRadius: 48, borderWidth: 3,
                borderStyle: 'dashed', opacity: 0.6 },
  pulse:      { position: 'absolute', width: 80, height: 80, borderRadius: 40 },
  iconInner:  { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: TYPO.subheading, fontWeight: '800', textAlign: 'center', lineHeight: 22 },
  stepsWrap:  { width: '100%', gap: 10 },
  stepRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot:    { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepLabel:  { fontSize: TYPO.body, flex: 1 },
  hint:       { fontSize: TYPO.body, textAlign: 'center', fontStyle: 'italic' },
});
