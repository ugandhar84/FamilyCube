/**
 * KioskSlideModal — a transparent Modal whose content slides in from the RIGHT
 * edge (and back out to it), for every kiosk side drawer. React Native's own
 * `animationType="slide"` always rises from the bottom, which reads wrong for
 * a panel that is anchored to the right side.
 *
 * Stays mounted while the exit animation plays, then unmounts.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Animated, Easing, useWindowDimensions } from 'react-native';

export function KioskSlideModal({ visible, onRequestClose, children }: {
  visible: boolean;
  onRequestClose?: () => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const x = useRef(new Animated.Value(visible ? 0 : width)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      x.setValue(width);
      Animated.timing(x, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(x, { toValue: width, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true })
        .start(({ finished }) => { if (finished) setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onRequestClose}
    >
      <Animated.View style={{ flex: 1, transform: [{ translateX: x }] }}>{children}</Animated.View>
    </Modal>
  );
}
