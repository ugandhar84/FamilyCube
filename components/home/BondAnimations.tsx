/**
 * BondAnimations — animated visual that celebrates the user–pet bond on the Home screen.
 *
 * Exports a single primary component: `TogethernessBadge`. It cycles through
 * four distinct views on a 10-second timer, cross-fading between them:
 *   0 — BondCircles: overlapping user + pet avatars with floating hearts.
 *   1 — MilestoneRing: SVG arc showing progress toward the next bond-day milestone.
 *   2 — ComeTogether: user and pet photos slide together and a heart pops in.
 *   3 — SimpleOrbit: pet and user orbit a central heart emoji.
 *
 * Internal sub-components (FloatingHeart, BondCircles, MilestoneRing, TimeTogether,
 * ComeTogether, SimpleOrbit) are not exported — they are implementation details.
 *
 * Memoized: only re-renders when props change.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// ── Layout constants ─────────────────────────────────────────────────────────
export const USER_CS = 78;
export const PET_CS  = 78;
export const BOND_OV = 24;
export const BOND_W  = USER_CS + PET_CS - BOND_OV; // 132
export const BOND_H  = PET_CS;                       // 78

const HEART_CFG = [
  { dxFromCenter: -10, delay: 0,    size: 13, cycle: 3800 },
  { dxFromCenter:   8, delay: 700,  size: 10, cycle: 3400 },
  { dxFromCenter:  -3, delay: 1400, size: 12, cycle: 4200 },
  { dxFromCenter:  13, delay: 2100, size: 8,  cycle: 3600 },
  { dxFromCenter:  -8, delay: 2800, size: 15, cycle: 4600 },
];

const MILESTONES = [7, 30, 100, 180, 365, 500, 730, 1000];

// Orbit helpers
export const STEPS = 40;
export const INPUT = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
export function makeOrbit(r: number, startAngle = 0) {
  return {
    x: INPUT.map(t => r * Math.cos(2 * Math.PI * t + startAngle)),
    y: INPUT.map(t => r * Math.sin(2 * Math.PI * t + startAngle)),
  };
}

// Come Together
const CT_SIZE = 48;
const CT_GAP  = 6;

// Simple Orbit
const SIMPLE_R    = 30;
const SIMPLE_SIZE = 46;
const SIMPLE_ORBIT     = makeOrbit(SIMPLE_R);
const SIMPLE_ORBIT_OPP = makeOrbit(SIMPLE_R, Math.PI);

const TOTAL_VIEWS = 4;

// ── FloatingHeart ─────────────────────────────────────────────────────────────
function FloatingHeart({ x, delay, size, cycle }: { x: number; delay: number; size: number; cycle: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: cycle, useNativeDriver: true }),
      ]).start(({ finished }) => { if (!cancelled && finished) run(); });
    };
    run();
    return () => { cancelled = true; anim.stopAnimation(); };
  }, []);

  return (
    <Animated.View style={{
      position: 'absolute',
      left: x - size / 2,
      bottom: Math.round(BOND_H * 0.55),
      width: size + 4, height: size + 4,
      alignItems: 'center', justifyContent: 'center',
      zIndex: 20,
      opacity: anim.interpolate({ inputRange: [0, 0.06, 0.5, 0.82, 1], outputRange: [0, 1, 0.95, 0.35, 0] }),
      transform: [
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -140] }) },
        { scale:      anim.interpolate({ inputRange: [0, 0.12, 0.45, 1], outputRange: [0.15, 1.3, 1.05, 0.55] }) },
        { translateX: anim.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [0, size * 0.35, -size * 0.25, size * 0.15] }) },
      ],
    }}>
      <Text style={{
        fontSize: size, lineHeight: size + 2,
        textShadowColor: '#ff69b4',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: size * 0.9,
      }}>🩷</Text>
    </Animated.View>
  );
}

// ── BondCircles ───────────────────────────────────────────────────────────────
function BondCircles({
  petUri, userUri, petAccent, petEmoji = '🐾',
}: { petUri: string | null; userUri: string | null; petAccent: string; petEmoji?: string }) {
  const overlapCx = USER_CS - BOND_OV / 2;

  return (
    <View style={{ width: BOND_W, height: BOND_H, overflow: 'visible' }}>
      <View style={{
        position: 'absolute', left: 0, top: (BOND_H - USER_CS) / 2,
        width: USER_CS, height: USER_CS, borderRadius: USER_CS / 2,
        overflow: 'hidden',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
        zIndex: 1,
      }}>
        {userUri
          ? <Image source={{ uri: userUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#9B6DD4', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: USER_CS * 0.38, lineHeight: USER_CS * 0.46 }}>👤</Text>
            </View>
        }
      </View>

      <View style={{
        position: 'absolute', right: 0, top: 0,
        width: PET_CS, height: PET_CS, borderRadius: PET_CS / 2,
        shadowColor: '#000', shadowOpacity: 0.26,
        shadowOffset: { width: -2, height: 3 }, shadowRadius: 8, elevation: 7,
        zIndex: 2,
      }}>
        <View style={{
          width: PET_CS, height: PET_CS, borderRadius: PET_CS / 2,
          overflow: 'hidden',
          borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.92)',
        }}>
          {petUri
            ? <Image source={{ uri: petUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFillObject, { backgroundColor: petAccent, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: PET_CS * 0.42, lineHeight: PET_CS * 0.5 }}>{petEmoji}</Text>
              </View>
          }
        </View>
      </View>

      {HEART_CFG.map((h, i) => (
        <FloatingHeart
          key={i}
          x={overlapCx + h.dxFromCenter}
          delay={h.delay}
          size={h.size}
          cycle={h.cycle}
        />
      ))}
    </View>
  );
}

// ── MilestoneRing ─────────────────────────────────────────────────────────────
function MilestoneRing({ days, accent, fg, sub }: { days: number; accent: string; fg: string; sub: string }) {
  const next = MILESTONES.find(m => m > days) ?? MILESTONES[MILESTONES.length - 1];
  const prev = MILESTONES.slice().reverse().find(m => m <= days) ?? 0;
  const progress = next === prev ? 1 : Math.min((days - prev) / (next - prev), 1);

  const SIZE = 76;
  const STROKE = 6;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const dash = CIRC * progress;

  const digits = String(days).length;
  const numSize = digits <= 3 ? 20 : digits === 4 ? 17 : 14;

  const label = next >= 365
    ? `→ ${Math.round(next / 365)}yr`
    : next >= 30
      ? `→ ${Math.round(next / 30)}mo`
      : `→ ${next}d`;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: SIZE + 8, height: SIZE + 8 }}>
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={accent + '30'} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke={accent}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${dash} ${CIRC}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: numSize, fontWeight: '900', color: fg, lineHeight: numSize + 2 }}>{days}</Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: sub, letterSpacing: 1, lineHeight: 12 }}>DAYS</Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: fg, lineHeight: 12, marginTop: 1 }}>{label}</Text>
      </View>
    </View>
  );
}

// ── TimeTogether ──────────────────────────────────────────────────────────────
function TimeTogether({ days, fg, sub }: { days: number; fg: string; sub: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const yrs = Math.floor(days / 365);
  const mos = Math.floor((days % 365) / 30);
  const ds  = days % 30;

  useEffect(() => {
    const run = () => Animated.sequence([
      Animated.timing(pulse, { toValue: 1.3, duration: 300, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,   duration: 300, useNativeDriver: true }),
      Animated.delay(700),
    ]).start(({ finished }) => { if (finished) run(); });
    run();
    return () => pulse.stopAnimation();
  }, []);

  const units = yrs > 0
    ? [
        { val: yrs, label: yrs === 1 ? 'YR' : 'YRS' },
        ...(mos > 0 ? [{ val: mos, label: mos === 1 ? 'MO' : 'MOS' }] : []),
      ].slice(0, 2)
    : [
        ...(mos > 0 ? [{ val: mos, label: mos === 1 ? 'MO' : 'MOS' }] : []),
        { val: ds, label: ds === 1 ? 'DAY' : 'DAYS' },
      ].slice(0, 2);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: BOND_W + 8, height: BOND_H + 8, overflow: 'hidden' }}>
      <Animated.Text style={{ fontSize: 22, transform: [{ scale: pulse }], lineHeight: 26 }}>❤️</Animated.Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {units.map((u, i) => (
          <View key={i} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: fg, lineHeight: 20 }}>{u.val}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: sub, letterSpacing: 0.3 }}>{u.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 11, color: sub, marginTop: 4, letterSpacing: 0.8, fontWeight: '500' }}>TOGETHER</Text>
    </View>
  );
}

// ── ComeTogether ──────────────────────────────────────────────────────────────
function ComeTogether({ petUri, userUri, petAccent, petEmoji = '🐾' }: {
  petUri: string | null; userUri: string | null; petAccent: string;
  petName: string; fg: string; sub: string; petEmoji?: string;
}) {
  const W = BOND_W + 8;
  const TRAVEL = W / 2 - CT_SIZE / 2 - CT_GAP / 2 - 4;

  const userX   = useRef(new Animated.Value(-TRAVEL)).current;
  const petX    = useRef(new Animated.Value( TRAVEL)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const heart   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      userX.setValue(-TRAVEL);
      petX.setValue(TRAVEL);
      opacity.setValue(0);
      heart.setValue(0);

      Animated.sequence([
        Animated.parallel([
          Animated.timing(userX,   { toValue: -(CT_SIZE / 2 + CT_GAP / 2), duration: 700, useNativeDriver: true }),
          Animated.timing(petX,    { toValue:   CT_SIZE / 2 + CT_GAP / 2,  duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.timing(heart, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(heart,   { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.delay(600),
      ]).start(({ finished }) => { if (finished) run(); });
    };
    run();
    return () => { userX.stopAnimation(); petX.stopAnimation(); opacity.stopAnimation(); heart.stopAnimation(); };
  }, []);

  const PhotoSquare = ({ tx, uri, accent, emoji }: {
    tx: Animated.Value; uri: string | null; accent: string; emoji: string;
  }) => (
    <Animated.View style={{
      width: CT_SIZE, height: CT_SIZE, borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.88)',
      shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 7,
      transform: [{ translateX: tx }],
      opacity,
    }}>
      {uri
        ? <Image source={{ uri }} style={{ width: CT_SIZE, height: CT_SIZE }} resizeMode="cover" />
        : <View style={{ width: CT_SIZE, height: CT_SIZE, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: CT_SIZE * 0.42 }}>{emoji}</Text>
          </View>
      }
    </Animated.View>
  );

  return (
    <View style={{ width: W, height: BOND_H + 8, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <PhotoSquare tx={userX} uri={userUri} accent="#9B6DD4" emoji="👤" />
        <PhotoSquare tx={petX}  uri={petUri}  accent={petAccent} emoji={petEmoji} />
      </View>
      <Animated.Text style={{
        position: 'absolute', fontSize: 18,
        opacity: heart,
        transform: [{ scale: heart.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.4, 1.0] }) }],
        textShadowColor: '#ff69b4', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12,
      }}>🩷</Animated.Text>
    </View>
  );
}

// ── SimpleOrbit ───────────────────────────────────────────────────────────────
function SimpleOrbit({ petUri, userUri, petAccent, petEmoji = '🐾' }: {
  petUri: string | null; userUri: string | null; petAccent: string; petEmoji?: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () =>
      Animated.timing(anim, { toValue: 1, duration: 6000, useNativeDriver: true })
        .start(({ finished }) => { if (finished) { anim.setValue(0); run(); } });
    run();
    return () => anim.stopAnimation();
  }, []);

  const uX = anim.interpolate({ inputRange: INPUT, outputRange: SIMPLE_ORBIT.x });
  const uY = anim.interpolate({ inputRange: INPUT, outputRange: SIMPLE_ORBIT.y });
  const pX = anim.interpolate({ inputRange: INPUT, outputRange: SIMPLE_ORBIT_OPP.x });
  const pY = anim.interpolate({ inputRange: INPUT, outputRange: SIMPLE_ORBIT_OPP.y });

  const OrbitCircle = ({ tx, ty, uri, accent, emoji }: {
    tx: Animated.AnimatedInterpolation<number>; ty: Animated.AnimatedInterpolation<number>;
    uri: string | null; accent: string; emoji: string;
  }) => (
    <Animated.View style={{
      position: 'absolute',
      width: SIMPLE_SIZE, height: SIMPLE_SIZE, borderRadius: SIMPLE_SIZE / 2,
      borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.9)',
      overflow: 'hidden',
      shadowColor: '#000', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 6,
      transform: [{ translateX: tx }, { translateY: ty }],
    }}>
      {uri
        ? <Image source={{ uri }} style={{ width: SIMPLE_SIZE, height: SIMPLE_SIZE }} resizeMode="cover" />
        : <View style={{ width: SIMPLE_SIZE, height: SIMPLE_SIZE, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: SIMPLE_SIZE * 0.42 }}>{emoji}</Text>
          </View>
      }
    </Animated.View>
  );

  return (
    <View style={{ width: BOND_W + 8, height: BOND_H + 8, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, zIndex: 10 }}>🩷</Text>
      <OrbitCircle tx={uX} ty={uY} uri={userUri} accent="#9B6DD4" emoji="👤" />
      <OrbitCircle tx={pX} ty={pY} uri={petUri}  accent={petAccent} emoji={petEmoji} />
    </View>
  );
}

// ── TogethernessBadge (primary export) ───────────────────────────────────────
export interface TogethernessBadgeProps {
  /** Bond days — days since adoption_date. Drives the milestone ring and TimeTogether display. */
  days: number;
  /** URI for the pet's avatar photo, or null to show a fallback paw emoji. */
  petUri: string | null;
  /** URI for the user's profile photo, or null to show a fallback person emoji. */
  userUri: string | null;
  /** Pet accent colour used for ring strokes, glows, and fallback avatar backgrounds. */
  petAccent: string;
  /** Pet emoji shown as avatar fallback when petUri is null. */
  petEmoji?: string;
  /** Pet's name — passed to ComeTogether but currently not rendered (reserved for a future label). */
  petName: string;
  /** Foreground text colour from the current theme's hero card. */
  fg: string;
  /** Secondary/subdued text colour for labels and unit suffixes. */
  sub: string;
}

export const TogethernessBadge = memo(function TogethernessBadge(props: TogethernessBadgeProps) {
  const { days, petUri, userUri, petAccent, petEmoji = '🐾', petName, fg, sub } = props;
  const [curIdx, setCurIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const curFade  = useRef(new Animated.Value(1)).current;
  const prevFade = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const id = setInterval(() => {
      setCurIdx(c => {
        const next = (c + 1) % TOTAL_VIEWS;
        setPrevIdx(c);
        prevFade.setValue(1);
        curFade.setValue(0);
        Animated.parallel([
          Animated.timing(prevFade, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(curFade,  { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished && isMountedRef.current) setPrevIdx(null);
        });
        return next;
      });
    }, 10000);
    return () => { isMountedRef.current = false; clearInterval(id); };
  }, []);

  function renderView(idx: number) {
    switch (idx) {
      case 0: return <BondCircles petUri={petUri} userUri={userUri} petAccent={petAccent} petEmoji={petEmoji} />;
      case 1: return <MilestoneRing days={days} accent={petAccent} fg={fg} sub={sub} />;
      case 2: return <ComeTogether petUri={petUri} userUri={userUri} petAccent={petAccent} petEmoji={petEmoji} petName={petName} fg={fg} sub={sub} />;
      case 3: return <SimpleOrbit petUri={petUri} userUri={userUri} petAccent={petAccent} petEmoji={petEmoji} />;
      default: return null;
    }
  }

  return (
    <View style={{ width: BOND_W + 8, height: BOND_H + 8, alignItems: 'center', justifyContent: 'center' }}>
      {prevIdx !== null && (
        <Animated.View style={{ position: 'absolute', opacity: prevFade }}>
          {renderView(prevIdx)}
        </Animated.View>
      )}
      <Animated.View style={{ position: 'absolute', opacity: curFade }}>
        {renderView(curIdx)}
      </Animated.View>
    </View>
  );
});
