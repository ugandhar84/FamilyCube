/**
 * AppToast — lightweight, auto-dismissing success/info confirmation.
 * Same module-level-callable pattern as AppAlert (showAlert), but for
 * quick "that worked" feedback that shouldn't block the user with a tap-
 * to-dismiss modal — e.g. "Nudge sent!" after a fire-and-forget action
 * that previously gave no visible confirmation at all.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Animated, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';

type ToastKind = 'success' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  kind: ToastKind;
}

type ShowToastFn = (message: string, kind?: ToastKind) => void;

let _showToast: ShowToastFn | null = null;

export function showToast(message: string, kind: ToastKind = 'success') {
  _showToast?.(message, kind);
}

const DURATION_MS = 2200;

export default function AppToast() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ToastState>({ visible: false, message: '', kind: 'success' });
  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -40, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setState(s => ({ ...s, visible: false })));
  }, [translateY, opacity]);

  useEffect(() => {
    _showToast = (message, kind = 'success') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setState({ visible: true, message, kind });
      translateY.setValue(-40);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 9 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(hide, DURATION_MS);
    };
    return () => { _showToast = null; if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [hide, translateY, opacity]);

  if (!state.visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        {
          top: insets.top + 8,
          opacity,
          transform: [{ translateY }],
          backgroundColor: isDark ? '#1E2640' : '#FFFFFF',
          borderColor: colors.success + '50',
          shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.15)',
        },
      ]}
    >
      <CheckCircle2 size={16} color={colors.success} />
      <Text style={[s.text, { color: colors.textPrimary }]} numberOfLines={2}>{state.message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    zIndex: 999,
    ...Platform.select({
      ios: { shadowOpacity: 0.18, shadowOffset: { width: 0, height: 3 }, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
  text: { flex: 1, fontSize: 13, fontWeight: '700' },
});
