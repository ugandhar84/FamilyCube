import React, { useRef, useEffect } from 'react';
import { Animated, View, Easing } from 'react-native';
import { Image } from 'expo-image';
import { SLIDE_MS, FILL } from '@/features/memories/videoShared';

const KB_CONFIGS = [
  { fromScale: 1.0, toScale: 1.10, fromX: 0,   toX: -18, fromY: 0,   toY: -10 },
  { fromScale: 1.10, toScale: 1.0,  fromX: -18, toX: 0,   fromY: -10, toY: 0   },
  { fromScale: 1.0, toScale: 1.08, fromX: 18,  toX: 0,   fromY: 0,   toY: 12  },
  { fromScale: 1.08, toScale: 1.0,  fromX: 0,   toX: 18,  fromY: 12,  toY: 0   },
  { fromScale: 1.0, toScale: 1.12, fromX: -10, toX: 10,  fromY: -6,  toY: 6   },
];

export const KenBurnsImage = React.memo(function KenBurnsImage({
  uri, style, duration = SLIDE_MS, configIdx = 0, delay = 0, blurred = false,
}: {
  uri: string; style?: any; duration?: number; configIdx?: number; delay?: number; blurred?: boolean;
}) {
  const cfg = KB_CONFIGS[configIdx % KB_CONFIGS.length];
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [uri]);

  const scale      = anim.interpolate({ inputRange: [0, 1], outputRange: [cfg.fromScale, cfg.toScale] });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [cfg.fromX, cfg.toX] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [cfg.fromY, cfg.toY] });

  if (blurred) {
    return (
      <View style={[style, { overflow: 'hidden' }]}>
        <Image source={{ uri }} style={[FILL, { opacity: 0.6 }]} contentFit="cover" />
        <Animated.Image
          source={{ uri }}
          style={[FILL, { transform: [{ scale }, { translateX }, { translateY }] }]}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <Animated.Image
      source={{ uri }}
      style={[style, { transform: [{ scale }, { translateX }, { translateY }] }]}
      resizeMode="cover"
    />
  );
});

export default KenBurnsImage;
