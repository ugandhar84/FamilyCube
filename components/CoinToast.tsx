/**
 * CoinToast — animated coin award celebration shown after earning coins.
 * Floats up from the bottom, holds for 2.5s, then fades out.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';

interface Props {
  visible: boolean;
  amount: number;
  label?: string;
  onHide: () => void;
}

export default function CoinToast({ visible, amount, label = 'coins earned!', onHide }: Props) {
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.spring(scale,      { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -30, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,   duration: 300, useNativeDriver: true }),
      ]).start(() => {
        translateY.setValue(80);
        scale.setValue(0.8);
        onHide();
      });
    }, 2500);

    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[s.wrap, { opacity, transform: [{ translateY }, { scale }] }]}>
      <Text style={s.coin}>🪙</Text>
      <View>
        <Text style={s.amount}>+{amount}</Text>
        <Text style={s.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1C1033',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 12,
    zIndex: 999,
  },
  coin:   { fontSize: 28 },
  amount: { fontSize: 20, fontWeight: '800', color: '#FFD700', lineHeight: 24 },
  label:  { fontSize: 13, fontWeight: '600', color: '#C9B8F0' },
});
