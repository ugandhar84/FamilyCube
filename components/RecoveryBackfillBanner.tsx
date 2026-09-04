import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRecoveryBackfillStore } from '@/store/recoveryBackfillStore';

/**
 * RecoveryBackfillBanner — lightweight top banner shown while
 * runChatRecoveryBackfillInBackground (lib/deviceRegistry.ts) is working
 * through a family's older chat history, adding a recovery-key wrap to
 * each message so a future device recovery can actually decrypt it (see
 * that function's own doc for why this runs in the background rather than
 * blocking DataRecoveryScreen). Purely a "something's happening" signal —
 * mirrors OfflineBanner.tsx's exact shape/animation, not a progress bar
 * with a percentage, since the total message count isn't known upfront.
 */
export default function RecoveryBackfillBanner() {
  const active       = useRecoveryBackfillStore(s => s.active);
  const wrappedSoFar = useRecoveryBackfillStore(s => s.wrappedSoFar);
  const insets        = useSafeAreaInsets();
  const anim           = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [active]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 0],
  });

  if (!active) return null;

  return (
    <Animated.View
      style={[
        s.banner,
        { paddingTop: insets.top + 6, transform: [{ translateY }] },
      ]}
      pointerEvents="none">
      <View style={s.row}>
        <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
        <Text style={s.text}>
          Securing older messages for recovery… {wrappedSoFar > 0 ? `${wrappedSoFar} done` : ''}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9998,
    backgroundColor: '#1C1C1E',
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
