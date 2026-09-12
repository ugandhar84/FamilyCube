import { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';

// A gentle, continuous pulse/glow on the bonus pill — draws the eye to it
// on the kid's quest card without a countdown. Only used when a bonus has
// no bonusExpiresAt at all; a bonus WITH a real expiry uses
// FlashBonusBadge instead (see KidQuestCard.tsx), same countdown the
// Quests tab already shows for the identical field.
export function BonusCoinBadge({ bonusCoins }: { bonusCoins: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.08, duration: 700, useNativeDriver: true }),
          Animated.timing(glow,  { toValue: 1,     duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1,     duration: 700, useNativeDriver: true }),
          Animated.timing(glow,  { toValue: 0.5,   duration: 700, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{
      transform: [{ scale }],
      shadowColor: '#F59E0B', shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
      shadowOpacity: glow as unknown as number, elevation: 5,
    }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
      }}>
        <Text style={{ fontSize: 11 }}>🔥</Text>
        <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>+{bonusCoins} bonus</Text>
      </View>
    </Animated.View>
  );
}
