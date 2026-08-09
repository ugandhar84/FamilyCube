import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { TYPO } from '@/constants/theme';

export const BarRow = React.memo(function BarRow({ label, pct, color, delay }: { label: string; pct: number; color: string; delay: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = setTimeout(() => {
      Animated.timing(w, { toValue: pct, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, delay);
    return () => clearTimeout(id);
  }, [pct, delay]);

  const widthPct = w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <Text style={{ width: 58, fontSize: TYPO.body, fontWeight: '600', color }}>{label}</Text>
      <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: `${color}22`, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', borderRadius: 4, backgroundColor: color, width: widthPct }} />
      </View>
      <Text style={{ width: 32, fontSize: TYPO.body, fontWeight: '700', color, textAlign: 'right' }}>{pct}%</Text>
    </View>
  );
});
