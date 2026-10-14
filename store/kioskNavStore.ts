import { create } from 'zustand';
import { router } from 'expo-router';
import { useUIStore } from './uiStore';

/**
 * useKioskNavStore — a tiny cross-screen signal so a push/in-app
 * notification tap can land on the right KIOSK tab instead of breaking out
 * into a bare phone screen.
 *
 * Live-reported bug this exists to fix: every notification route
 * (routeForNotification in NotificationPanel.tsx) is a hardcoded phone tab
 * path like '/(tabs)/tasks' — fine on a phone, but on a kiosk device only
 * the Hub tab route ('/(tabs)' -> HubScreen -> KioskScreen when
 * deviceClass === 'kitchenHub') actually renders the kiosk rail/header;
 * every OTHER tab route (tasks.tsx, calendar.tsx, chat.tsx, store.tsx,
 * quests.tsx, gps.tsx) renders its plain phone screen unconditionally, with
 * no kiosk gate at all. router.push('/(tabs)/tasks') from a kiosk device
 * landed the user on that bare phone screen — no nav rail, no way back
 * except the notification bell/home button, since kiosk mode isn't a
 * distinct set of routes, it's a component swap inside the Hub route.
 *
 * Fix: app/_layout.tsx's notification handler checks deviceClass before
 * navigating — on a kiosk device it sets pendingTab here and pushes to
 * '/(tabs)' (always safe: that's the route KioskScreen actually lives on)
 * instead of the phone-specific path. KioskScreen reads pendingTab once on
 * mount/update and switches its own internal tab state to match, then
 * clears it — same one-shot "consume and clear" shape as other
 * fire-once-then-forget signals in this codebase (e.g. paywallSheetStore).
 */
export type KioskNavTab = 'hub' | 'tasks' | 'schedule' | 'chat' | 'findfam' | 'store' | 'memories' | 'school' | 'health' | 'profile' | 'meals';

interface KioskNavState {
  pendingTab: KioskNavTab | null;
  setPendingTab: (tab: KioskNavTab) => void;
  consumePendingTab: () => void;
}

export const useKioskNavStore = create<KioskNavState>((set) => ({
  pendingTab: null,
  setPendingTab: (tab) => set({ pendingTab: tab }),
  consumePendingTab: () => set({ pendingTab: null }),
}));

// Phone tab route -> kiosk rail tab. See this file's own header comment for
// the original bug this closes. '/(tabs)/meals' maps to 'meals' (a real
// kiosk tab); '/(tabs)/grocery' has no kiosk-native tab yet, so it correctly
// falls through to the `?? 'hub'` default in navigateFromNotification below
// rather than inventing one.
const PHONE_ROUTE_TO_KIOSK_TAB: Record<string, KioskNavTab> = {
  '/(tabs)': 'hub',
  '/(tabs)/tasks': 'tasks',
  '/(tabs)/quests': 'tasks',
  '/(tabs)/chat': 'chat',
  '/(tabs)/store': 'store',
  '/(tabs)/gps': 'findfam',
  '/(tabs)/memories': 'memories',
  '/(tabs)/school': 'school',
  '/(tabs)/family-health': 'health',
  '/(tabs)/meals': 'meals',
  '/profile-settings': 'profile',
};

/**
 * Navigates to a destination, kiosk-safe: on a kiosk device, routes to
 * '/(tabs)' (the only route KioskScreen actually lives on, since kiosk mode
 * is a component swap inside HubScreen, not a distinct route tree) and sets
 * the matching internal kiosk tab instead of pushing into a bare phone-only
 * route with no kiosk chrome and no way back short of a force-quit.
 *
 * Any code anywhere in the app that navigates to a '/(tabs)/...' route in
 * response to something a user tapped (a notification, an Ask Fam reply, a
 * deep link) MUST go through this instead of a bare `router.push` — a bare
 * push bypasses kiosk gating entirely, since kiosk-awareness lives only
 * here and in HubScreen's own deviceClass check, not on the individual tab
 * route files themselves. `dest` may carry route params (e.g. a chat
 * channelId) — those are only meaningful on the phone path, since kiosk's
 * own tabs don't support arbitrary per-item deep-links yet.
 */
export function navigateFromNotification(
  dest: string | { pathname: string; params?: Record<string, any> },
  isKiosk: boolean,
) {
  const pathname = typeof dest === 'string' ? dest : dest.pathname;
  if (isKiosk) {
    const kioskTab = PHONE_ROUTE_TO_KIOSK_TAB[pathname] ?? 'hub';
    useKioskNavStore.getState().setPendingTab(kioskTab);
    router.navigate('/(tabs)' as any);
    return;
  }
  // '/(tabs)/grocery' and '/(tabs)/meals' are no longer real tab routes —
  // both are opened as Hub-owned FullPageOverlay state instead (see
  // HubScreen.tsx/GroceryScreen.tsx/MealsScreen.tsx's own header
  // comments), to fix a stale-Reanimated-shared-value blank-screen bug
  // that came from Expo Router's tab navigator keeping them mounted
  // forever. Every notification/deep-link call site that used to push
  // straight to one of those routes goes through this single function, so
  // intercepting here (rather than at each call site in app/_layout.tsx
  // and NotificationPanel.tsx) is the one place that needs to know: land
  // on Hub first, then flip the one-shot uiStore flag HubScreen consumes
  // to open the matching overlay.
  if (pathname === '/(tabs)/grocery') {
    router.navigate('/(tabs)' as any);
    useUIStore.getState().setOpenGroceryScreenRequested(true);
    return;
  }
  if (pathname === '/(tabs)/meals') {
    router.navigate('/(tabs)' as any);
    useUIStore.getState().setOpenMealsScreenRequested(true);
    return;
  }
  // Same interception as grocery/meals above — '/(tabs)/store' (Rewards)
  // is a real-but-hidden tab route kept only for stale deep links; normal
  // navigation goes through Hub-owned FullPageOverlay state instead (see
  // app/(tabs)/store.tsx's own header comment for why: a hidden tab route
  // got neither swipe-back nor a reliable tab-bar hide on repeat visits).
  if (pathname === '/(tabs)/store') {
    router.navigate('/(tabs)' as any);
    useUIStore.getState().setOpenRewardsScreenRequested(true);
    return;
  }
  // Same interception — '/(tabs)/memories' is kept only for stale deep
  // links; normal navigation opens the Hub-owned FullPageOverlay instead.
  // A memory_posted/memory_liked push carries ?memoryId=... as a route
  // param on `dest`, which has no router screen to land on anymore — carry
  // it over to pendingMemoryFocusId so MemoriesScreen can still scroll to
  // the right card once opened.
  if (pathname === '/(tabs)/memories') {
    const memoryId = typeof dest === 'object' ? dest.params?.memoryId : undefined;
    router.navigate('/(tabs)' as any);
    if (memoryId) useUIStore.getState().setPendingMemoryFocusId(memoryId);
    useUIStore.getState().setOpenMemoriesScreenRequested(true);
    return;
  }
  // navigate (not push) — a sibling-tab path reached via push lands a beat
  // behind the bottom-tab navigator's own state.index, leaving
  // CustomTabBar's highlight stuck on the previous tab while the new
  // screen's content is already visible [live-reported: tab bar "stuck on
  // the different pages sometimes"]. navigate() reuses the tab navigator's
  // own transition, same as tapping the bar directly.
  router.navigate(dest as any);
}
