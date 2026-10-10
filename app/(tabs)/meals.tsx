import { router } from 'expo-router';
import MealsScreen from '@/features/vault/tabs/MealsScreen';

// Thin re-export, kept registered (href: null in app/(tabs)/_layout.tsx) so
// any stale deep link/notification payload still resolves to something
// instead of a 404 — but MealsScreen is no longer reached this way in
// normal use. The real navigation path is Hub-owned FullPageOverlay state
// (HubScreen.tsx's showMeals) via store/uiStore.ts's
// openMealsScreenRequested flag; see store/kioskNavStore.ts's
// navigateFromNotification for where that flag gets set instead of a bare
// router.push to this route. onClose here is just a safe fallback for the
// rare case this raw route is ever hit directly.
export default function MealsRoute() {
  return <MealsScreen onClose={() => router.replace('/(tabs)')} />;
}
