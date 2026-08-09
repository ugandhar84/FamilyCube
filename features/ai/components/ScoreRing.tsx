import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Easing } from 'react-native';

export const ScoreRing = React.memo(function ScoreRing({ score, color, size = 80 }: { score: number; color: string; size?: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: score / 100, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [score]);

  const strokeW = size * 0.1;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeW, borderColor: `${color}25`,
        position: 'absolute',
      }} />
      <Text style={{ fontSize: size * 0.26, fontWeight: '900', color, lineHeight: size * 0.3 }}>{score}</Text>
      <Text style={{ fontSize: size * 0.12, fontWeight: '600', color: `${color}80` }}>/ 100</Text>
    </View>
  );
});
