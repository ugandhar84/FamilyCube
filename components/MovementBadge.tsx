/**
 * MovementBadge — the little "what is this person doing" icon on the Find Family map and roster, like Life360's:
 *  - walking / running: two shoes that take alternating steps over a ground line that slides past,
 *  - driving: a car riding along a road whose dashes stream by, with a small bounce,
 *  - cycling: a bike on the same moving ground.
 * Animated in normal views; pass animated={false} where the view is frozen into a map-marker snapshot (an animation there
 * would not move and would cost memory) — it then shows just the icon.
 */
import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';

export type MovementKind = 'driving' | 'walking' | 'running' | 'cycling' | 'stationary';

export const MOVEMENT_LABEL: Record<MovementKind, string> = { driving: 'Driving', walking: 'Walking', running: 'Running', cycling: 'Cycling', stationary: 'Still' };
export const MOVEMENT_EMOJI: Record<MovementKind, string> = { driving: '🚗', walking: '👟', running: '👟', cycling: '🚲', stationary: '' };

const DASH_W = 6, DASH_GAP = 6;

export default function MovementBadge({ kind, size = 14, color, animated = true }: { kind: MovementKind; size?: number; color?: string; animated?: boolean }) {
  const step = useRef(new Animated.Value(0)).current;   // 0 -> 1 -> 0: a step, a bounce
  const ground = useRef(new Animated.Value(0)).current; // 0 -> 1 repeating: the ground / road sliding backwards

  useEffect(() => {
    if (!animated || kind === 'stationary') return;
    const stepMs = kind === 'running' ? 230 : kind === 'walking' ? 380 : kind === 'cycling' ? 300 : 160;
    const groundMs = kind === 'running' ? 420 : kind === 'walking' ? 800 : kind === 'cycling' ? 520 : 380;
    const stepLoop = Animated.loop(Animated.sequence([
      Animated.timing(step, { toValue: 1, duration: stepMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(step, { toValue: 0, duration: stepMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const groundLoop = Animated.loop(Animated.timing(ground, { toValue: 1, duration: groundMs, easing: Easing.linear, useNativeDriver: true }));
    stepLoop.start(); groundLoop.start();
    return () => { stepLoop.stop(); groundLoop.stop(); step.setValue(0); ground.setValue(0); };
  }, [animated, kind, step, ground]);

  if (kind === 'stationary') return null;
  const emoji = MOVEMENT_EMOJI[kind];
  if (!animated) return <Text style={{ fontSize: size, lineHeight: size + 3 }}>{emoji}</Text>;

  const lane = color ?? '#8A8A8A';
  const walkingLike = kind === 'walking' || kind === 'running';
  const w = Math.round(size * (walkingLike ? 1.9 : 2.4));
  const h = size + 8;
  const lift = size * 0.32;

  // Ground / road dashes slide left by one dash period, then repeat seamlessly.
  const slide = ground.interpolate({ inputRange: [0, 1], outputRange: [0, -(DASH_W + DASH_GAP)] });
  const dashes = (
    <Animated.View style={{ position: 'absolute', left: 0, bottom: 1, flexDirection: 'row', gap: DASH_GAP, transform: [{ translateX: slide }] }}>
      {Array.from({ length: Math.ceil(w / (DASH_W + DASH_GAP)) + 2 }).map((_, i) => (
        <View key={i} style={{ width: DASH_W, height: 2, borderRadius: 1, backgroundColor: lane, opacity: 0.55 }} />
      ))}
    </Animated.View>
  );

  if (walkingLike) {
    // One shoe taking steps: it lifts and tilts forward, swings ahead, then plants — repeating over a ground line that slides past.
    const lift = step.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -size * 0.34, 0] });
    const ahead = step.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.18, size * 0.18] });
    const tilt = step.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['8deg', '-20deg', '8deg'] });
    return (
      <View style={{ width: w, height: h, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'center' }}>
        {dashes}
        <Animated.Text style={{ fontSize: size, lineHeight: size + 2, marginBottom: 4, transform: [{ translateX: ahead }, { translateY: lift }, { rotate: tilt }] }}>👟</Animated.Text>
      </View>
    );
  }

  // Car or bike riding: the vehicle bobs a touch while the road streams past underneath.
  const bob = step.interpolate({ inputRange: [0, 1], outputRange: [0, kind === 'driving' ? -1.2 : -2] });
  const nudge = step.interpolate({ inputRange: [0, 1], outputRange: [0, kind === 'driving' ? 0.8 : 1.2] });
  return (
    <View style={{ width: w, height: h, overflow: 'hidden', justifyContent: 'flex-end' }}>
      {dashes}
      <Animated.Text style={{ fontSize: size, lineHeight: size + 2, marginBottom: 3, marginLeft: size * 0.5, transform: [{ translateY: bob }, { translateX: nudge }] }}>{emoji}</Animated.Text>
    </View>
  );
}
