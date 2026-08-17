import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';

// ─── Flash Bonus Badge ────────────────────────────────────────────────────────
export function FlashBonusBadge({ bonusCoins, expiresAt }: { bonusCoins: number; expiresAt: string }) {
  const [remaining, setRemaining] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const calc = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setRemaining(''); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setIsCritical(ms < 3600000);
      const sPad = s.toString().padStart(2, '0');
      setRemaining(h > 0 ? `${h}h ${m}m ${sPad}s` : m > 0 ? `${m}m ${sPad}s` : `${sPad}s`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    const speed = isCritical ? 600 : 1100;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.07, duration: speed, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.75, duration: speed, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.00, duration: speed, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1.00, duration: speed, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isCritical]);

  if (!remaining) return null;

  const bg     = isCritical ? '#EF4444' : '#F59E0B';
  const shadow = isCritical ? '#EF4444' : '#F59E0B';

  return (
    <Animated.View style={{
      transform: [{ scale }], opacity,
      shadowColor: shadow, shadowOpacity: 0.65, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
      elevation: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ fontSize: 14 }}>🔥</Text>
        <View>
          <Text style={{ fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.8, textTransform: 'uppercase' }}>Bonus ends in</Text>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 0.3, fontVariant: ['tabular-nums'] }}>+{bonusCoins}🪙 · {remaining}</Text>
        </View>
      </View>
    </Animated.View>
  );
}
