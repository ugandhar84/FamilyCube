/**
 * Health route — reached via a direct router.push('/(tabs)/family-health')
 * (deep links, legacy call sites) rather than FamilyScreen's own
 * '__overlay:health' tile, which opens the same two screens as a
 * FullPageOverlay directly. Self-wraps in FullPageOverlay here, same
 * pattern as app/(tabs)/school.tsx, so this path ALSO gets slide-in-from-
 * right + swipe-to-dismiss instead of popping in with no transition and no
 * back-swipe gesture [live-requested: "it should be overlay swipe in and
 * out with backswipe"].
 *
 * useFocusEffect resets `visible` to false on blur — Expo Router keeps
 * every visited tab screen mounted forever (hidden, not unmounted), so
 * without this reset a second, competing full-screen gesture tree would
 * stay alive underneath FamilyScreen's own Health overlay once that's
 * opened separately (same bug class school.tsx's own header comment
 * documents, already fixed there the same way).
 */
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import FullPageOverlay from '@/components/FullPageOverlay';
import { useFamilyStore } from '@/store/familyStore';
import HealthRecordsScreen from '@/features/vault/tabs/HealthRecordsScreen';
import HealthPeoplePage from '@/features/vault/tabs/health/HealthPeoplePage';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';

export default function FamilyHealthTab() {
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const [visible, setVisible] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setVisible(true);
      if (activeMember?.role === 'parent') hideTabBar();
      return () => {
        setVisible(false);
        showTabBar();
      };
    }, [activeMember?.role])
  );

  const close = () => {
    showTabBar();
    setVisible(false);
    router.replace('/(tabs)');
  };

  return (
    <FullPageOverlay visible={visible} onDismiss={close} zIndex={50}>
      {activeMember?.role === 'parent'
        ? <HealthPeoplePage onClose={close} />
        : <HealthRecordsScreen onClose={close} />}
    </FullPageOverlay>
  );
}
