import { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';

/**
 * StepProgressBar — animated segment-fill progress row for multi-step
 * forms (Add Medication, Add Vaccine, SmartTaskComposer, etc.). Replaces
 * the instant-snap "backgroundColor: i <= stepIndex ? accent : border"
 * pattern every stepper form previously duplicated with an actual
 * animated fill per segment, so advancing a step reads as progress
 * happening rather than a jump-cut.
 */
export default function StepProgressBar({
  stepCount, activeIndex, accentColor, trackColor, height = 4, gap = 6,
}: {
  stepCount: number; activeIndex: number; accentColor: string; trackColor: string;
  height?: number; gap?: number;
}) {
  // One Animated.Value per segment, each tracking 0 (empty) -> 1 (filled).
  // Segments before activeIndex are already filled instantly on mount
  // (no need to re-animate history); only the newly-reached segment
  // actually animates in, and a step back animates the departing segment
  // out — both directions read as a smooth fill/unfill, not a snap.
  const fills = useRef(Array.from({ length: stepCount }, (_, i) => new Animated.Value(i < activeIndex ? 1 : 0))).current;

  useEffect(() => {
    fills.forEach((v, i) => {
      const target = i <= activeIndex ? 1 : 0;
      Animated.timing(v, {
        toValue: target,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // animating backgroundColor via interpolate, not transform/opacity
      }).start();
    });
  }, [activeIndex]);

  return (
    <View style={{ flexDirection: 'row', gap, flex: 1 }}>
      {fills.map((v, i) => (
        <View key={i} style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}>
          <Animated.View style={{
            height: '100%', borderRadius: height / 2, backgroundColor: accentColor,
            width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }} />
        </View>
      ))}
    </View>
  );
}
