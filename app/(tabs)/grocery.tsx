import { router } from 'expo-router';
import GroceryScreen from '@/features/grocery/GroceryScreen';

// Thin re-export, kept registered (href: null in app/(tabs)/_layout.tsx) so
// any stale deep link/notification payload still resolves to something
// instead of a 404 — but GroceryScreen is no longer reached this way in
// normal use. The real navigation path is Hub-owned FullPageOverlay state
// (HubScreen.tsx's showGrocery) via store/uiStore.ts's
// openGroceryScreenRequested flag; see store/kioskNavStore.ts's
// navigateFromNotification for where that flag gets set instead of a bare
// router.push to this route. onClose here is just a safe fallback for the
// rare case this raw route is ever hit directly.
export default function GroceryRoute() {
  return <GroceryScreen onClose={() => router.replace('/(tabs)')} />;
}
