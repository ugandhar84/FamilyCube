import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStore } from '@/lib/networkStore';

export default function OfflineBanner() {
  const isOffline = useNetworkStore(s => s.isOffline);
  const insets    = useSafeAreaInsets();
  const anim      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isOffline ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isOffline]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 0],
  });

  if (!isOffline) return null;

  return (
    <Animated.View
      style={[
        s.banner,
        { paddingTop: insets.top + 6, transform: [{ translateY }] },
      ]}
      pointerEvents="none">
      <View style={s.row}>
        <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
        <Text style={s.text}>No internet connection — retrying…</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    backgroundColor: '#1C1C1E',
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
