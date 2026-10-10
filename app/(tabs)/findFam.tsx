/**
 * Locations route — reached two ways: FamilyScreen's own "Locations" tile
 * opens it as a FullPageOverlay directly, but any other entry point that
 * does a real router.push('/(tabs)/findFam') gets none of Expo Router's
 * tab-switch animation for free. Self-wrapping in FullPageOverlay here
 * gives that path the same slide-in-from-right + swipe-to-dismiss as the
 * Family-tile path — same fix as app/(tabs)/school.tsx.
 *
 * `visible` resets to false on blur via useFocusEffect — Expo Router keeps
 * a visited route mounted (hidden, not unmounted) forever, so without this
 * reset this route's own overlay would stay permanently mounted+visible
 * after a single visit, creating a second, stale, full-screen
 * GestureDetector competing with FamilyScreen's own overlay for every tap
 * and swipe (the exact bug found and fixed in app/(tabs)/school.tsx).
 */
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import FindFamScreen from '@/features/gps/FindFamScreen';
import FullPageOverlay from '@/components/FullPageOverlay';

export default function FindFamTab() {
  const [visible, setVisible] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setVisible(true);
      return () => setVisible(false);
    }, [])
  );

  const close = () => {
    setVisible(false);
    router.replace('/(tabs)/gps' as any);
  };

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={50}>
      {(requestAnimatedClose) => <FindFamScreen onClose={requestAnimatedClose} />}
    </FullPageOverlay>
  );
}
