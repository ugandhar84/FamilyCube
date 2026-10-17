/**
 * Home Care route — reached two ways: FamilyScreen's own "Home care" tile
 * opens it as a FullPageOverlay directly, but Hub's HomeownerNotesSection
 * widget still does a real router.push('/hub/homeowner-notes') — a genuine
 * navigation, which gets none of Expo Router's tab-switch animation for
 * free. Self-wrapping in FullPageOverlay here gives that path the same
 * slide-in-from-right + swipe-to-dismiss as the Family-tile path.
 *
 * `visible` resets to false on blur via useFocusEffect — Expo Router keeps
 * a visited route mounted (hidden, not unmounted) forever, so without this
 * reset this route's own overlay would stay permanently mounted+visible
 * after a single visit, creating a second, stale, full-screen
 * GestureDetector competing with FamilyScreen's own overlay for every tap
 * and swipe. This is the exact bug found and fixed in
 * app/(tabs)/school.tsx — applying the same fix here before it ever ships
 * broken, per that investigation's root cause.
 */
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import HomeownerNotesScreen from '@/features/vault/tabs/HomeownerNotesScreen';
import FullPageOverlay from '@/components/FullPageOverlay';

export default function HomeownerNotesRoute() {
  const [visible, setVisible] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setVisible(true);
      return () => setVisible(false);
    }, [])
  );

  const close = () => {
    setVisible(false);
    router.replace('/(tabs)');
  };

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={50}>
      <HomeownerNotesScreen onClose={close} />
    </FullPageOverlay>
  );
}
