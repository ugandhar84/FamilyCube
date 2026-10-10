import { router } from 'expo-router';
import RewardsDashboardScreen from '@/features/store/RewardsDashboardScreen';

// Thin re-export, kept registered so any stale deep link/notification
// payload still resolves to something instead of a 404 — but
// RewardsDashboardScreen is no longer reached this way in normal use. The
// real navigation path is Hub-owned FullPageOverlay state (HubScreen.tsx's
// showRewards) via store/uiStore.ts's openRewardsScreenRequested flag; see
// app/(tabs)/meals.tsx for the identical precedent. Hitting this route
// directly previously left the shared tab bar visible and gave no
// swipe-back gesture, since a real (if hidden-from-TABS_DEFAULT) tab route
// gets neither FullPageOverlay's swipe handling nor exemption from the
// navigator's own showTabBar() effect [live-reported: "Family rewards
// pages not rhythm of figma no back swipe and still bottom nav"].
export default function StoreRoute() {
  return <RewardsDashboardScreen onClose={() => router.replace('/(tabs)')} />;
}
