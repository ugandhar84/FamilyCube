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
import Svg, { Path, Line } from 'react-native-svg';

export type MovementKind = 'driving' | 'walking' | 'running' | 'cycling' | 'stationary';

export const MOVEMENT_LABEL: Record<MovementKind, string> = { driving: 'Driving', walking: 'Walking', running: 'Running', cycling: 'Cycling', stationary: 'Still' };
export const MOVEMENT_EMOJI: Record<MovementKind, string> = { driving: '🚗', walking: '👟', running: '👟', cycling: '🚲', stationary: '' };

const DASH_W = 6, DASH_GAP = 6;

// ── Walking scene: a white sneaker stepping along a brown dirt path, with little dust puffs kicked up behind it ─────────────────
const SAND = '#E8D3B3';
const PATH_BROWN = '#B07A4C';
const PATH_DARK = '#8E5E37';
const DUST = 'rgba(222,196,160,0.95)';

// A blue running shoe, side view facing right: blue upper in two shades, grey collar, white laces and a thick white sole.
function Sneaker({ size }: { size: number }) {
  const w = size * 1.7, h = size * 1.06;
  return (
    <Svg width={w} height={h} viewBox="0 0 64 40">
      {/* sole */}
      <Path d="M5 30 L58 30 Q61.5 31 60.5 34.2 Q58.5 37.5 54 37.5 L10 37.5 Q5 37.5 5 33 Z" fill="#EEF2F5" stroke="#C3CED8" strokeWidth={1} />
      <Path d="M7 35.4 L56 35.4" stroke="#D3DCE4" strokeWidth={1} />
      {/* upper: deep blue base, lighter blue toe, darker heel */}
      <Path d="M6 30 L6 16 Q6 12 10 12 L20 11 Q24 20 34 23 L52 25 Q60 26 60.5 30 Z" fill="#1F7FD0" />
      <Path d="M30 24 L52 25 Q60 26 60.5 30 L35 30 Q31 28 30 24 Z" fill="#2AA4F0" />
      <Path d="M6 30 L6 17 Q6 13 10 13 L13.5 13 L13.5 30 Z" fill="#1666B0" />
      <Path d="M15 28.4 Q26 27.4 34 24" stroke="#1666B0" strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* collar and tongue */}
      <Path d="M10 12 L20 11 L22.4 15.4 Q15.5 15.6 11 15.2 Z" fill="#5C7284" />
      <Path d="M10 12 Q15 9.4 20 11" stroke="#B5C0CA" strokeWidth={1.7} fill="none" strokeLinecap="round" />
      <Path d="M19.4 10.4 L25.6 8.2 L28 13 L22.6 15.4 Z" fill="#EEF2F5" stroke="#B5C0CA" strokeWidth={1} />
      {/* white laces */}
      <Line x1="23" y1="15" x2="30.4" y2="18" stroke="#AEBAC5" strokeWidth={3} strokeLinecap="round" />
      <Line x1="27" y1="12.6" x2="33" y2="19.6" stroke="#AEBAC5" strokeWidth={3} strokeLinecap="round" />
      <Line x1="31" y1="17" x2="37" y2="21.4" stroke="#AEBAC5" strokeWidth={3} strokeLinecap="round" />
      <Line x1="23" y1="14.6" x2="30.4" y2="17.6" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
      <Line x1="27" y1="12.2" x2="33" y2="19.2" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
      <Line x1="31" y1="16.6" x2="37" y2="21" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** pose 0-3 is for frozen map markers (no running animation there); animated scenes pass their own values. */
export function WalkingScene({ size = 12, pose, step, ground, dust }: {
  size?: number; pose?: number; step?: Animated.Value; ground?: Animated.Value; dust?: Animated.Value[];
}) {
  // A circle, so it sits cleanly on the corner of an avatar.
  const w = Math.round(size * 2.2), h = w;
  const lift = step ? step.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -size * 0.2, 0] }) : null;
  const tilt = step ? step.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['5deg', '-12deg', '5deg'] }) : null;
  const ahead = step ? step.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.1, size * 0.1] }) : null;
  const slide = ground ? ground.interpolate({ inputRange: [0, 1], outputRange: [0, -(size * 0.9)] }) : null;
  const staticT = pose == null ? null : { rot: [5, -2, -12, -2][pose], y: [0, -1, -size * 0.2, -1][pose] };
  const dashW = size * 0.45, dashGap = size * 0.45;

  return (
    <View style={{ width: w, height: h, borderRadius: h / 2, overflow: 'hidden', backgroundColor: SAND, justifyContent: 'flex-end', alignItems: 'center' }}>
      {/* the dirt path */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(5, size * 0.62), backgroundColor: PATH_BROWN }}>
        {slide ? (
          <Animated.View style={{ flexDirection: 'row', gap: dashGap, height: '100%', alignItems: 'center', transform: [{ translateX: slide }] }}>
            {Array.from({ length: Math.ceil(w / (dashW + dashGap)) + 3 }).map((_, i) => (
              <View key={i} style={{ width: dashW, height: Math.max(1.5, size * 0.14), borderRadius: 1, backgroundColor: PATH_DARK }} />
            ))}
          </Animated.View>
        ) : (
          <View style={{ flexDirection: 'row', gap: dashGap, height: '100%', alignItems: 'center' }}>
            {Array.from({ length: Math.ceil(w / (dashW + dashGap)) + 1 }).map((_, i) => (
              <View key={i} style={{ width: dashW, height: Math.max(1.5, size * 0.14), borderRadius: 1, backgroundColor: PATH_DARK }} />
            ))}
          </View>
        )}
      </View>
      {/* dust puffs drifting back from the heel */}
      {dust?.map((d, i) => (
        <Animated.View key={i} pointerEvents="none" style={{
          position: 'absolute', left: w * 0.3, bottom: Math.max(5, size * 0.62) - 1, width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17, backgroundColor: DUST,
          opacity: d.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ translateX: d.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 1.1] }) },
            { translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.35] }) },
            { scale: d.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.7] }) }],
        }} />
      ))}
      {staticT && pose != null && [0, 1, 2].map(i => (
        <View key={i} style={{ position: 'absolute', left: w * (0.3 - i * 0.07), bottom: Math.max(5, size * 0.62) + i, width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, backgroundColor: DUST, opacity: 0.8 - i * 0.2 }} />
      ))}
      {/* the shoe */}
      <Animated.View style={{ alignItems: 'center', marginBottom: Math.max(4, size * 0.5),
        transform: step ? [{ translateX: ahead! }, { translateY: lift! }, { rotate: tilt! }] : [{ translateY: staticT?.y ?? 0 }, { rotate: `${staticT?.rot ?? 0}deg` }] }}>
        <Sneaker size={size * 0.9} />
      </Animated.View>
    </View>
  );
}

export default function MovementBadge({ kind, size = 14, color, animated = true }: { kind: MovementKind; size?: number; color?: string; animated?: boolean }) {
  const step = useRef(new Animated.Value(0)).current;   // 0 -> 1 -> 0: a step, a bounce
  const ground = useRef(new Animated.Value(0)).current; // 0 -> 1 repeating: the ground / road sliding backwards
  const dust = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current; // three staggered dust puffs

  useEffect(() => {
    if (!animated || kind === 'stationary') return;
    const stepMs = kind === 'running' ? 450 : kind === 'walking' ? 720 : kind === 'cycling' ? 600 : 480;
    const groundMs = kind === 'running' ? 800 : kind === 'walking' ? 1500 : kind === 'cycling' ? 1000 : 900;
    const stepLoop = Animated.loop(Animated.sequence([
      Animated.timing(step, { toValue: 1, duration: stepMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(step, { toValue: 0, duration: stepMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const groundLoop = Animated.loop(Animated.timing(ground, { toValue: 1, duration: groundMs, easing: Easing.linear, useNativeDriver: true }));
    const puffMs = kind === 'running' ? 800 : 1300;
    const puffLoops = dust.map((d, i) => Animated.sequence([
      Animated.delay(i * (puffMs / 3)),
      Animated.loop(Animated.timing(d, { toValue: 1, duration: puffMs, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    ]));
    stepLoop.start(); groundLoop.start(); puffLoops.forEach(l => l.start());
    return () => { stepLoop.stop(); groundLoop.stop(); puffLoops.forEach(l => l.stop()); step.setValue(0); ground.setValue(0); dust.forEach(d => d.setValue(0)); };
  }, [animated, kind, step, ground, dust]);

  if (kind === 'stationary') return null;
  const emoji = MOVEMENT_EMOJI[kind];
  if (!animated) return (kind === 'walking' || kind === 'running') ? <WalkingScene size={size} pose={0} /> : <Text style={{ fontSize: size, lineHeight: size + 3 }}>{emoji}</Text>;

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

  if (walkingLike) return <WalkingScene size={size} step={step} ground={ground} dust={dust} />;

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
