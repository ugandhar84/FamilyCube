/**
 * FullScreenCelebration — small centered burst for the global "approved &
 * paid out" moment (see GlobalCelebration): particles pop up from the
 * middle of the screen like a little flower pot, then fall back down under
 * gravity. Distinct from CelebrationBurst (in-row reaction pop, no fall).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const EMOJIS = ['🎉', '✨', '⭐', '🎊', '🥳', '💰', '🪙'];
const PARTICLE_COUNT = 16;
const DURATION = 1700;

interface Props {
  visible: boolean;
  onDone?: () => void;
}

export default function FullScreenCelebration({ visible, onDone }: Props) {
  const { height } = Dimensions.get('window');
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      emoji: EMOJIS[i % EMOJIS.length],
      startX: (Math.random() - 0.5) * 90,
      driftX: (Math.random() - 0.5) * 160,
      size: 16 + Math.random() * 14,
      delay: Math.random() * 200,
      spin: (Math.random() - 0.5) * 2.5,
      // Rises a little, then gravity pulls it back down past the origin.
      riseHeight: 60 + Math.random() * 60,
      fallDistance: height * 0.4 + Math.random() * height * 0.2,
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
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      })
    );
    Animated.parallel(anims).start(() => onDone?.());
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        // Pot bloom: quick rise (0 → 0.25), then falls under gravity to
        // well below the origin (0.25 → 1).
        const translateY = p.t.interpolate({
          inputRange: [0, 0.25, 1],
          outputRange: [0, -p.riseHeight, p.fallDistance],
        });
        const translateX = p.t.interpolate({ inputRange: [0, 1], outputRange: [p.startX, p.startX + p.driftX] });
        const opacity     = p.t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });
        const scale       = p.t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.1, 0.8] });
        const rotate      = p.t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 360}deg`] });
        return (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute', left: '50%', top: '42%', fontSize: p.size,
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
