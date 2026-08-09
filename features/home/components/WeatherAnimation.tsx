/**
 * WeatherAnimation — animated weather icon displayed on the Home screen hero card.
 *
 * Renders different animations depending on the current condition string:
 *  - Clear day   → rotating sun rays + glow pulse
 *  - Partly      → sun/moon drifts behind a floating cloud
 *  - Cloudy      → gentle cloud drift (moon peek at night)
 *  - Rainy       → cloud + three animated falling water drops
 *  - Stormy      → storm icon + lightning flicker + drops
 *  - Snowy       → snow icon + three swaying snowflakes
 *  - Clear night → pulsing moon with twinkling star decorations
 *  - Unknown     → static fallback emoji
 *
 * Only the Animated loops needed for the current condition are started — running
 * all loops unconditionally caused measurable JS thread jank on low-end devices.
 * The `needsX` flags computed from `condition` drive which loops are started.
 *
 * Memoized: only re-renders when the `condition` prop changes.
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { TYPO } from '@/constants/theme';

/**
 * @param condition The weather condition string from the API, e.g. "Partly Cloudy" or "Heavy Rain".
 *                  Null or an unrecognised string shows a static default emoji.
 */
export const WeatherAnimation = memo(function WeatherAnimation({ condition }: { condition: string | null }) {
  const rotate  = useRef(new Animated.Value(0)).current;
  const drift   = useRef(new Animated.Value(0)).current;
  const drop1   = useRef(new Animated.Value(0)).current;
  const drop2   = useRef(new Animated.Value(0)).current;
  const drop3   = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(1)).current;
  const snow1   = useRef(new Animated.Value(0)).current;
  const snow2   = useRef(new Animated.Value(0)).current;
  const snow3   = useRef(new Animated.Value(0)).current;
  const pulse   = useRef(new Animated.Value(1)).current;

  const cLow = (condition ?? '').toLowerCase();
  const hourNow    = new Date().getHours();
  const isNightNow = hourNow < 6 || hourNow >= 20;
  const isSunnyNow  = !isNightNow && (cLow.includes('clear') || cLow.includes('sunny') || cLow.includes('fair'));
  const isPartlyNow = cLow.includes('partly') || cLow.includes('partial');
  const isRainyNow  = cLow.includes('rain') || cLow.includes('drizzle') || cLow.includes('shower');
  const isSnowyNow  = cLow.includes('snow') || cLow.includes('sleet') || cLow.includes('blizzard') || cLow.includes('winter');
  const isStormyNow = cLow.includes('storm') || cLow.includes('thunder') || cLow.includes('lightning');
  const needsRotate  = isSunnyNow || isPartlyNow;
  const needsDrift   = isPartlyNow;
  const needsRain    = isRainyNow || isStormyNow;
  const needsFlicker = isStormyNow;
  const needsSnow    = isSnowyNow;
  const needsPulse   = isNightNow;

  // ─── Animation loops ────────────────────────────────────────────────────────
  // Only start loops relevant to the current condition. Each loop is stored in
  // the `loops` array so a single cleanup return can stop all of them at once.
  useEffect(() => {
    const start = (anim: ReturnType<typeof Animated.loop>) => { anim.start(); return anim; };
    const makeDrop = (anim: Animated.Value, delay: number) =>
      start(Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0,   useNativeDriver: true }),
      ])));
    const makeSnow = (anim: Animated.Value, delay: number) =>
      start(Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ])));

    const loops: ReturnType<typeof Animated.loop>[] = [];
    if (needsRotate) loops.push(start(Animated.loop(Animated.timing(rotate, { toValue: 1, duration: 10000, useNativeDriver: true }))));
    if (needsDrift)  loops.push(start(Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 10, duration: 2500, useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0,  duration: 2500, useNativeDriver: true }),
    ]))));
    if (needsRain)  { loops.push(makeDrop(drop1, 0)); loops.push(makeDrop(drop2, 230)); loops.push(makeDrop(drop3, 460)); }
    if (needsFlicker) loops.push(start(Animated.loop(Animated.sequence([
      Animated.delay(3000),
      Animated.timing(flicker, { toValue: 0, duration: 80,  useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 1, duration: 80,  useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 0, duration: 80,  useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]))));
    if (needsSnow) { loops.push(makeSnow(snow1, 0)); loops.push(makeSnow(snow2, 450)); loops.push(makeSnow(snow3, 900)); }
    if (needsPulse) loops.push(start(Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 1800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 1800, useNativeDriver: true }),
    ]))));
    return () => { loops.forEach(l => l.stop()); };
  }, [needsRotate, needsDrift, needsRain, needsFlicker, needsSnow, needsPulse]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const c = (condition ?? '').toLowerCase();
  const hour    = new Date().getHours();
  const isNight = hour < 6 || hour >= 20;

  const isClearNight = isNight  && (c.includes('clear') || c.includes('sunny') || c.includes('fair'));
  const isSunny      = !isNight && (c.includes('clear') || c.includes('sunny') || c.includes('fair'));
  const isPartly     = c.includes('partly') || c.includes('partial');
  const isCloudy     = c.includes('cloud') || c.includes('overcast') || c.includes('fog');
  const isRainy      = c.includes('rain') || c.includes('drizzle') || c.includes('shower');
  const isSnowy      = c.includes('snow') || c.includes('sleet') || c.includes('blizzard') || c.includes('winter');
  const isStormy     = c.includes('storm') || c.includes('thunder') || c.includes('lightning');

  const dropInterp = (a: Animated.Value) => ({
    translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }),
    opacity:    a.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
  });
  const snowInterp = (a: Animated.Value) => ({
    translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 36] }),
    translateX: a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, 0] }),
    opacity:    a.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
  });

  return (
    <View style={{ position: 'absolute', top: 8, right: 8, width: 80, height: 70, alignItems: 'center', justifyContent: 'center' }}>

      {isClearNight && (
        <>
          <Animated.View style={{ position: 'absolute', width: 54, height: 54, borderRadius: 27,
            backgroundColor: '#E8F4FF', opacity: pulse.interpolate({ inputRange: [1, 1.15], outputRange: [0.15, 0.35] }),
            shadowColor: '#A8D8FF', shadowOpacity: 0.9, shadowRadius: 14 }} />
          <Animated.Text style={{ fontSize: 44, transform: [{ scale: pulse }] }}>🌙</Animated.Text>
          <Animated.Text style={{ fontSize: TYPO.body, position: 'absolute', top: 4, right: 4,
            opacity: pulse.interpolate({ inputRange: [1, 1.15], outputRange: [0.4, 1] }) }}>✨</Animated.Text>
          <Animated.Text style={{ fontSize: TYPO.body, position: 'absolute', top: 20, right: 16,
            opacity: pulse.interpolate({ inputRange: [1, 1.15], outputRange: [1, 0.3] }) }}>⭐</Animated.Text>
          <Animated.Text style={{ fontSize: TYPO.body, position: 'absolute', top: 8, left: 10,
            opacity: pulse.interpolate({ inputRange: [1, 1.15], outputRange: [0.6, 1] }) }}>✦</Animated.Text>
        </>
      )}

      {isSunny && !isPartly && (
        <>
          <Animated.View style={{ position: 'absolute', width: 68, height: 68, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: spin }] }}>
            {[0,45,90,135].map(deg => (
              <View key={deg} style={{
                position: 'absolute',
                width: 3, height: 68,
                borderRadius: 2,
                backgroundColor: 'rgba(255,220,60,0.45)',
                transform: [{ rotate: `${deg}deg` }],
              }} />
            ))}
          </Animated.View>
          <Animated.View style={{
            position: 'absolute', width: 52, height: 52, borderRadius: 26,
            backgroundColor: 'rgba(255,200,0,0.18)',
            shadowColor: '#FFD700', shadowOpacity: 0.9, shadowRadius: 14,
            transform: [{ scale: pulse }],
          }} />
          <Text style={{ fontSize: 44 }}>☀️</Text>
        </>
      )}

      {isPartly && (
        <>
          <Animated.View style={{
            position: 'absolute', top: 2, left: 2,
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: isNight ? 'rgba(180,210,255,0.18)' : 'rgba(255,200,0,0.18)',
            shadowColor: isNight ? '#A8D8FF' : '#FFD700',
            shadowOpacity: 0.8, shadowRadius: 10,
            transform: [{ scale: pulse }],
          }} />
          <Animated.Text style={{
            fontSize: TYPO.hero,
            position: 'absolute', top: 4, left: 4,
            transform: [{
              translateX: drift.interpolate({ inputRange: [0, 10], outputRange: [-3, 0] }),
            }],
          }}>
            {isNight ? '🌙' : '☀️'}
          </Animated.Text>
          <Animated.Text style={{
            fontSize: 38,
            position: 'absolute', bottom: 4, right: 0,
            transform: [{ translateX: drift }],
          }}>☁️</Animated.Text>
        </>
      )}

      {isCloudy && !isPartly && !isRainy && !isStormy && !isSnowy && (
        <>
          {isNight && (
            <Animated.Text style={{ fontSize: TYPO.title, position: 'absolute', top: 2, right: 6,
              opacity: pulse.interpolate({ inputRange: [1, 1.15], outputRange: [0.6, 1.0] }) }}>🌙</Animated.Text>
          )}
          <Animated.Text style={{ fontSize: 38, position: 'absolute', top: isNight ? 12 : 14, right: 2,
            transform: [{ translateX: drift }], opacity: 0.95 }}>☁️</Animated.Text>
        </>
      )}

      {isRainy && !isStormy && (
        <>
          <Animated.Text style={{ fontSize: 40, position: 'absolute', top: 2, right: 0,
            transform: [{ translateX: drift }] }}>🌧️</Animated.Text>
          {([drop1, drop2, drop3] as Animated.Value[]).map((d, i) => {
            const { translateY, opacity } = dropInterp(d);
            return (
              <Animated.Text key={i} style={{ fontSize: TYPO.body, position: 'absolute',
                top: 38, left: 4 + i * 26,
                transform: [{ translateY }], opacity }}>
                💧
              </Animated.Text>
            );
          })}
        </>
      )}

      {isStormy && (
        <>
          <Text style={{ fontSize: 40, position: 'absolute', top: 2, right: 0 }}>⛈️</Text>
          <Animated.Text style={{ fontSize: TYPO.title, position: 'absolute', top: 38, left: 14,
            opacity: flicker }}>⚡</Animated.Text>
          {([drop1, drop2] as Animated.Value[]).map((d, i) => {
            const { translateY, opacity } = dropInterp(d);
            return (
              <Animated.Text key={i} style={{ fontSize: TYPO.body, position: 'absolute',
                top: 30, left: 8 + i * 30,
                transform: [{ translateY }], opacity }}>
                💧
              </Animated.Text>
            );
          })}
        </>
      )}

      {isSnowy && (
        <>
          <Text style={{ fontSize: 40, position: 'absolute', top: 2, right: 0 }}>🌨️</Text>
          {([snow1, snow2, snow3] as Animated.Value[]).map((s, i) => {
            const { translateY, translateX, opacity } = snowInterp(s);
            return (
              <Animated.Text key={i} style={{ fontSize: TYPO.body, position: 'absolute',
                top: 34, left: 2 + i * 26,
                transform: [{ translateY }, { translateX }], opacity }}>
                ❄️
              </Animated.Text>
            );
          })}
        </>
      )}

      {!isClearNight && !isSunny && !isPartly && !isCloudy && !isRainy && !isSnowy && !isStormy && (
        <Text style={{ fontSize: 44 }}>{isNight ? '🌙' : '🌤️'}</Text>
      )}
    </View>
  );
});
