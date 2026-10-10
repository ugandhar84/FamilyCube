/**
 * School route — reached two ways: FamilyScreen's own School tile opens it
 * as a FullPageOverlay directly (no navigation, no mount here needed), but
 * Hub's quick-access pill row still does a real router.push('/(tabs)/school')
 * — a genuine tab navigation, which gets none of Expo Router's tab-switch
 * animation for free. Self-wrapping in FullPageOverlay here gives that path
 * the same slide-in-from-right + swipe-to-dismiss as the Family-tile path,
 * instead of popping in with no transition and no back-swipe gesture.
 *
 * Bug fixed here: Expo Router's tab navigator keeps every visited tab
 * screen mounted forever (hidden, not unmounted) once visited — confirmed
 * live: `visible` started true and nothing ever reset it back to false on
 * blur, so after tapping the Hub pill once, this route's own FullPageOverlay
 * (and its full-screen GestureDetector) stayed mounted and visible
 * permanently underneath everything else, including on top of/competing
 * with FamilyScreen's own School overlay once THAT was opened separately —
 * two fully-interactive, overlapping gesture trees at the same screen
 * position ate every tap and swipe meant for whichever one the user could
 * actually see (live-reported: "sub pages don't open" + "back swipe is not
 * working"). useFocusEffect resets `visible` to false on blur so this
 * route's overlay only ever exists while the route itself is genuinely
 * focused — same reset pattern SwipeBackWrapper's own focus-reset fix
 * already uses for Grocery/Meals.
 */
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import SchoolScreen from '@/features/vault/tabs/SchoolScreen';
import FullPageOverlay from '@/components/FullPageOverlay';

export default function SchoolTab() {
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
      <SchoolScreen onClose={close} hideHeader={false} />
    </FullPageOverlay>
  );
}
