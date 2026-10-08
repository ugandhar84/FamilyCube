import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';

/**
 * StepProgressBar — animated segment-fill progress row for multi-step
 * forms. When `labels` is provided (one string per step) they render
 * below each segment in the Figma wizard style: active/completed segments
 * and their labels use accentColor, future segments use trackColor text.
 */
export default function StepProgressBar({
  stepCount, activeIndex, accentColor, trackColor, height = 4, gap = 6, labels,
}: {
  stepCount: number; activeIndex: number; accentColor: string; trackColor: string;
  height?: number; gap?: number;
  labels?: string[];
}) {
  const fills = useRef(Array.from({ length: stepCount }, (_, i) => new Animated.Value(i < activeIndex ? 1 : 0))).current;

  useEffect(() => {
    fills.forEach((v, i) => {
      const target = i <= activeIndex ? 1 : 0;
      Animated.timing(v, {
        toValue: target,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
  }, [activeIndex]);

  return (
    <View style={{ flexDirection: 'row', gap, flex: 1 }}>
      {fills.map((v, i) => {
        const isDone = i <= activeIndex;
        const label = labels?.[i];
        return (
          <View key={i} style={{ flex: 1, gap: 6 }}>
            <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}>
              <Animated.View style={{
                height: '100%', borderRadius: height / 2, backgroundColor: accentColor,
                width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }} />
            </View>
            {label !== undefined && (
              <Text style={{
                fontSize: 13, fontWeight: '500', lineHeight: 18,
                color: isDone ? accentColor : trackColor,
              }} numberOfLines={1}>
                {label}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
