/**
 * CelebrationBurst — a short emoji confetti pop, used when a Cheer Squad
 * reaction lands on the recipient's device. Self-contained: plays once
 * on mount, then calls onDone.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const EMOJIS = ['🎉', '✨', '⭐', '🎊', '🥳'];
const PARTICLE_COUNT = 14;
const DURATION = 1400;

interface Props {
  visible: boolean;
  onDone?: () => void;
}

export default function CelebrationBurst({ visible, onDone }: Props) {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      emoji: EMOJIS[i % EMOJIS.length],
      startX: (Math.random() - 0.5) * 40,
      driftX: (Math.random() - 0.5) * 220,
      size: 18 + Math.random() * 14,
      delay: Math.random() * 150,
      spin: (Math.random() - 0.5) * 2,
      t: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    particles.forEach(p => p.t.setValue(0));
    const anims = particles.map(p =>
      Animated.timing(p.t, {
        toValue: 1,
        duration: DURATION,
        delay: p.delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.parallel(anims).start(() => onDone?.());
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        const translateY = p.t.interpolate({ inputRange: [0, 1], outputRange: [0, -120 - Math.random() * 40] });
        const translateX = p.t.interpolate({ inputRange: [0, 1], outputRange: [p.startX, p.startX + p.driftX] });
        const opacity     = p.t.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
        const scale       = p.t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.1, 0.8] });
        const rotate      = p.t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] });
        return (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute', left: '50%', top: '50%', fontSize: p.size,
              opacity, transform: [{ translateX }, { translateY }, { scale }, { rotate }],
            }}
          >
            {p.emoji}
          </Animated.Text>
        );
      })}
    </View>
  );
}
