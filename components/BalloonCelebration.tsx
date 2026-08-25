/**
 * BalloonCelebration — iMessage's "Confetti" effect: small colorful paper
 * pieces appear at the top of the screen and fall down with a gentle side-
 * to-side drift and tumble, fading out near the bottom. (Component name
 * kept for import stability — the effect itself is confetti-rain, not
 * balloons; see GlobalCelebration's own comment for why.)
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const CONFETTI_COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#FDE047'];
const PIECE_COUNT = 60;
const DURATION = 3600;

interface Props {
  visible: boolean;
  onDone?: () => void;
}

function ConfettiPiece({ color, width, height, left, delay, sway, fallDistance, spin, onDone }: {
  color: string; width: number; height: number; left: number; delay: number;
  sway: number; fallDistance: number; spin: number; onDone?: () => void;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: DURATION,
      delay,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(onDone);
  }, []);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-40, fallDistance] });
  // A few side-to-side sways on the way down, like a falling leaf.
  const translateX = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, sway, -sway, sway * 0.6, -sway * 0.3],
  });
  const opacity  = t.interpolate({ inputRange: [0, 0.06, 0.82, 1], outputRange: [0, 1, 1, 0] });
  const rotate   = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin}deg`] });
  // Tumble — flips end-over-end as it falls, matching real confetti physics.
  const tumble   = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spin * 1.7}deg`] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left, top: 0,
        opacity, transform: [{ translateY }, { translateX }, { rotate }, { rotateX: tumble }],
      }}>
      <View style={{ width, height, borderRadius: 2, backgroundColor: color }} />
    </Animated.View>
  );
}

export default function BalloonCelebration({ visible, onDone }: Props) {
  const { width, height } = Dimensions.get('window');
  const doneCount = useRef(0);
  const pieces = useRef(
    Array.from({ length: PIECE_COUNT }, (_, i) => {
      const isSquare = Math.random() > 0.5;
      return {
        key: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        width: isSquare ? 7 + Math.random() * 4 : 4 + Math.random() * 3,
        height: isSquare ? 7 + Math.random() * 4 : 10 + Math.random() * 6,
        left: Math.random() * width,
        delay: Math.random() * 700,
        sway: 20 + Math.random() * 50,
        fallDistance: height * 0.7 + Math.random() * height * 0.5,
        spin: 180 + Math.random() * 540 * (Math.random() > 0.5 ? 1 : -1),
      };
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {pieces.map(p => (
        <ConfettiPiece
          key={p.key} color={p.color} width={p.width} height={p.height} left={p.left}
          delay={p.delay} sway={p.sway} fallDistance={p.fallDistance} spin={p.spin}
          onDone={() => {
            doneCount.current += 1;
            if (doneCount.current === pieces.length) onDone?.();
          }}
        />
      ))}
    </View>
  );
}
