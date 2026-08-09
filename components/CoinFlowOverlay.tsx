/**
 * CoinFlowOverlay — Subway-Surfers-style gold coin stream from PawBond wallet → pet wallet.
 * Dense staggered arc particles, rendered gold circles (not emoji), landing flash.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, Animated, Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SW, height: SH } = Dimensions.get('window');

function coinCount(amt: number) {
  if (amt <= 2)  return 6;
  if (amt <= 5)  return 10;
  if (amt <= 10) return 14;
  if (amt <= 20) return 18;
  return 24;
}

interface Props {
  visible: boolean;
  amount: number;
  action: string;
  petEmoji: string;
  petName: string;
  petBalance: number;
  dailyQuotaLeft: number;
  dailyQuotaMax: number;
  onDismiss: () => void;
}

export default function CoinFlowOverlay({
  visible, amount, action,
  petEmoji, petName, petBalance,
  dailyQuotaLeft, dailyQuotaMax,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const safeAmount = Math.min(amount, dailyQuotaLeft);

  const fromBalAnim = useRef(new Animated.Value(dailyQuotaLeft)).current;
  const toBalAnim   = useRef(new Animated.Value(petBalance)).current;
  const quotaAnim   = useRef(new Animated.Value(dailyQuotaLeft / dailyQuotaMax)).current;
  const toFlashAnim = useRef(new Animated.Value(0)).current;
  const arrowAnim   = useRef(new Animated.Value(0)).current;

  const [fromDisplay, setFromDisplay] = useState(dailyQuotaLeft);
  const [toDisplay,   setToDisplay]   = useState(petBalance);
  const [phase, setPhase] = useState<'idle' | 'flying' | 'done'>('idle');

  // Each coin: t (0→1), x (linear), y (parabolic arc), opacity, scale
  type CoinAnim = {
    t: Animated.Value;
    delay: number;
    fromX: number; fromY: number;
    toX: number;   toY: number;
    arcY: number;
    size: number;
  };
  const [coins, setCoins] = useState<CoinAnim[]>([]);

  const fromRef = useRef<View>(null);
  const toRef   = useRef<View>(null);
  const [fromPos, setFromPos] = useState({ x: SW * 0.22, y: SH * 0.38 });
  const [toPos,   setToPos]   = useState({ x: SW * 0.72, y: SH * 0.38 });

  const measurePositions = useCallback(() => {
    fromRef.current?.measureInWindow((x, y, w, h) => {
      setFromPos({ x: x + w / 2, y: y + h / 2 });
    });
    toRef.current?.measureInWindow((x, y, w, h) => {
      setToPos({ x: x + w / 2, y: y + h / 2 });
    });
  }, []);

  useEffect(() => {
    if (!visible) { setPhase('idle'); setCoins([]); return; }
    fromBalAnim.setValue(dailyQuotaLeft);
    toBalAnim.setValue(petBalance);
    quotaAnim.setValue(dailyQuotaLeft / dailyQuotaMax);
    toFlashAnim.setValue(0);
    arrowAnim.setValue(0);
    setFromDisplay(dailyQuotaLeft);
    setToDisplay(petBalance);
    setPhase('idle');

    const t = setTimeout(() => {
      measurePositions();
      setTimeout(startFlight, 100);
    }, 200);
    return () => clearTimeout(t);
  }, [visible]);

  function startFlight() {
    if (safeAmount <= 0) { setPhase('done'); return; }
    const n = coinCount(safeAmount);
    const STAGGER = 35; // ms between coins — tight like Subway Surfers

    const newCoins: CoinAnim[] = Array.from({ length: n }, (_, i) => {
      const jx = (Math.random() - 0.5) * 22;
      const jy = (Math.random() - 0.5) * 14;
      const arcLift = 80 + Math.random() * 50;
      return {
        t: new Animated.Value(0),
        delay: i * STAGGER,
        fromX: fromPos.x + jx,
        fromY: fromPos.y + jy,
        toX:   toPos.x + (Math.random() - 0.5) * 18,
        toY:   toPos.y + (Math.random() - 0.5) * 14,
        arcY:  Math.min(fromPos.y, toPos.y) - arcLift,
        size:  13 + Math.random() * 5,
      };
    });

    setCoins(newCoins);
    setPhase('flying');

    // Arrow pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ])
    ).start();

    newCoins.forEach(c => {
      const dur = 520 + Math.random() * 100;
      Animated.timing(c.t, {
        toValue: 1, duration: dur, delay: c.delay, useNativeDriver: true,
      }).start();
    });

    const lastLand = (n - 1) * STAGGER + 650;
    setTimeout(onLand, lastLand);
  }

  function onLand() {
    arrowAnim.stopAnimation();

    // Landing flash on destination card
    Animated.sequence([
      Animated.timing(toFlashAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
      Animated.timing(toFlashAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]).start();

    const newQuota = Math.max(0, dailyQuotaLeft - safeAmount);
    animateNumber(fromBalAnim, dailyQuotaLeft, newQuota, setFromDisplay, 500);
    animateNumber(toBalAnim, petBalance, petBalance + safeAmount, setToDisplay, 500);
    Animated.timing(quotaAnim, {
      toValue: newQuota / dailyQuotaMax, duration: 600, useNativeDriver: false,
    }).start();

    setPhase('done');
    // Auto-dismiss 1.5s after coins land
    setTimeout(onDismiss, 1500);
  }

  function animateNumber(
    anim: Animated.Value, from: number, to: number,
    setter: (n: number) => void, duration: number,
  ) {
    const id = anim.addListener(({ value }) => setter(Math.round(value)));
    anim.setValue(from);
    Animated.timing(anim, { toValue: to, duration, useNativeDriver: false }).start(() => {
      anim.removeListener(id);
      setter(to);
    });
  }

  const arrowScale = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  const toGlow = toFlashAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(45,212,191,0.08)', 'rgba(45,212,191,0.45)'] });
  const toBorderColor = toFlashAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(45,212,191,0.2)', 'rgba(45,212,191,0.95)'] });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onDismiss}>
      {/* Semi-transparent backdrop — tap to dismiss */}
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onDismiss} />

      {/* Bottom sheet popup */}
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Handle bar */}
        <View style={s.handle} />

        <Text style={s.title}>🪙 Coins Earned</Text>
        <Text style={s.subtitle}>+{safeAmount} {action}</Text>

        <View style={s.walletRow}>
          {/* PawBond source */}
          <View style={[s.card, s.cardFrom]}>
            <View style={s.iconWrap} ref={fromRef} onLayout={measurePositions}>
              <Text style={s.iconEmoji}>🐾</Text>
            </View>
            <Text style={s.cardLabel}>PawBond</Text>
            <Text style={[s.balance, s.balanceFrom]}>🪙 {fromDisplay}</Text>
            <View style={s.quotaWrap}>
              <View style={s.quotaRow}>
                <Text style={s.quotaLabel}>Daily quota</Text>
                <Text style={s.quotaVal}>{fromDisplay}/{dailyQuotaMax}</Text>
              </View>
              <View style={s.quotaTrack}>
                <Animated.View style={[s.quotaFill, {
                  width: quotaAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
                }]} />
              </View>
            </View>
          </View>

          {/* Arrow */}
          <View style={s.arrowWrap}>
            <Animated.Text style={[s.arrow, phase === 'flying' && { transform: [{ scale: arrowScale }] }]}>
              {phase === 'flying' ? '✨' : phase === 'done' ? '✅' : '→'}
            </Animated.Text>
          </View>

          {/* Pet destination */}
          <Animated.View style={[s.card, s.cardTo, { backgroundColor: toGlow, borderColor: toBorderColor }]}>
            <View style={s.iconWrapTo} ref={toRef} onLayout={measurePositions}>
              <Text style={s.iconEmoji}>{petEmoji}</Text>
            </View>
            <Text style={[s.cardLabel, { color: '#4dd9c8' }]}>{petName}</Text>
            <Text style={[s.balance, s.balanceTo]}>🪙 {toDisplay}</Text>
            {phase === 'done' && (
              <View style={s.earnedBadge}>
                <Text style={s.earnedText}>+{safeAmount} today 🎉</Text>
              </View>
            )}
          </Animated.View>
        </View>

        {safeAmount < amount && (
          <Text style={s.capNote}>Daily cap reached — {amount - safeAmount} coins saved for tomorrow</Text>
        )}
      </View>

      {/* Coin particles rendered over everything */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {coins.map((c, i) => {
          const translateX = c.t.interpolate({
            inputRange: [0, 1], outputRange: [c.fromX - SW / 2, c.toX - SW / 2], extrapolate: 'clamp',
          });
          const translateY = c.t.interpolate({
            inputRange: [0, 0.45, 1], outputRange: [c.fromY, c.arcY, c.toY], extrapolate: 'clamp',
          });
          const scale = c.t.interpolate({
            inputRange: [0, 0.08, 0.5, 0.88, 1], outputRange: [0.3, 1.0, 1.15, 1.0, 0.5], extrapolate: 'clamp',
          });
          const opacity = c.t.interpolate({
            inputRange: [0, 0.05, 0.78, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp',
          });
          const sz = c.size;
          return (
            <Animated.View
              key={i}
              style={[s.coinParticle, {
                width: sz * 2, height: sz * 2, borderRadius: sz,
                opacity, transform: [{ translateX }, { translateY }, { scale }],
              }]}
            >
              <View style={[s.coinOuter, { width: sz * 2, height: sz * 2, borderRadius: sz }]}>
                <View style={[s.coinInner, { width: sz * 1.4, height: sz * 1.4, borderRadius: sz * 0.7 }]} />
                <View style={[s.coinShine, { width: sz * 0.7, height: sz * 0.5, borderRadius: sz * 0.35, top: sz * 0.28, left: sz * 0.42 }]} />
              </View>
            </Animated.View>
          );
        })}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#120d28',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#3d2b7a',
    alignSelf: 'center', marginBottom: 4,
  },
  title:    { fontSize: 20, fontWeight: '900', color: '#e0d8ff', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '600', color: '#9b8ec4', textAlign: 'center', marginBottom: 4 },

  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },

  card: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  cardFrom: {
    backgroundColor: '#1a1035',
    borderWidth: 1.5,
    borderColor: '#3d2b7a44',
  },
  cardTo: {
    borderWidth: 1.5,
  },

  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: '#7C5CBF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7C5CBF', shadowOpacity: 0.55, shadowOffset: { width: 0, height: 4 }, shadowRadius: 14,
  },
  iconWrapTo: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1a4a46',
    borderWidth: 2, borderColor: '#2DD4BF55',
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji: { fontSize: 28 },

  cardLabel:   { fontSize: 11, fontWeight: '700', color: '#9b8ec4', textTransform: 'uppercase', letterSpacing: 0.06 },
  balance:     { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  balanceFrom: { color: '#e0d8ff' },
  balanceTo:   { color: '#2DD4BF' },

  quotaWrap: { width: '100%', gap: 4 },
  quotaRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  quotaLabel:{ fontSize: 9, fontWeight: '700', color: '#5a4d7a', textTransform: 'uppercase', letterSpacing: 0.06 },
  quotaVal:  { fontSize: 9, fontWeight: '800', color: '#9b8ec4' },
  quotaTrack:{ height: 5, borderRadius: 3, backgroundColor: '#2a1f4a', overflow: 'hidden' },
  quotaFill: { height: 5, borderRadius: 3, backgroundColor: '#7C5CBF' },

  earnedBadge:{ backgroundColor: 'rgba(45,212,191,0.14)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  earnedText: { fontSize: 10, fontWeight: '700', color: '#2DD4BF' },

  arrowWrap: { alignItems: 'center', justifyContent: 'center', width: 28 },
  arrow:     { fontSize: 20, color: '#FFD700' },

  coinParticle: {
    position: 'absolute',
    top: 0, left: 0,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    elevation: 6,
  },
  coinOuter: {
    backgroundColor: '#B8860B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFE566',
  },
  coinInner: {
    backgroundColor: '#FFD700',
    position: 'absolute',
  },
  coinShine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,220,0.75)',
  },

  capNote: { fontSize: 11, color: '#5a4d7a', textAlign: 'center', marginTop: -4 },
});
