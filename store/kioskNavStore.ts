import { create } from 'zustand';

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
export type KioskNavTab = 'hub' | 'tasks' | 'schedule' | 'chat' | 'findfam' | 'store' | 'memories' | 'school' | 'health' | 'profile';

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
