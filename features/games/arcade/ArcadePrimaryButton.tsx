/**
 * ArcadePrimaryButton — the one recognizable CTA shape across every game
 * ("NEW GAME", "DEAL", "START", "PLAY AGAIN") — same amber pill, only the
 * label changes. A recognizable, unchanging CTA is cheap cohesion between
 * otherwise-different game screens.
 */
import { useRef } from 'react';
import { Text, Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ARCADE, ARCADE_FONT_DISPLAY_BOLD } from '../theme/gameTheme';

export function ArcadePrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        disabled={disabled}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        style={{
          minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 20, paddingVertical: 10,
          backgroundColor: ARCADE.primary,
          shadowColor: ARCADE.primaryGlow, shadowOpacity: 1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{
            fontFamily: ARCADE_FONT_DISPLAY_BOLD, fontSize: 17, letterSpacing: 0.8,
            color: ARCADE.bgTop, textTransform: 'uppercase', textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
