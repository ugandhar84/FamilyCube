import { router } from 'expo-router';
import MemoriesScreen from '@/features/vault/tabs/MemoriesScreen';

// Thin re-export, kept registered (href: null in app/(tabs)/_layout.tsx) so
// any stale deep link/notification payload still resolves to something
// instead of a 404 — but MemoriesScreen is no longer reached this way in
// normal use. The real navigation path is Hub-owned FullPageOverlay state
// (HubScreen.tsx's showMemories) via store/uiStore.ts's
// openMemoriesScreenRequested flag; see store/kioskNavStore.ts's
// navigateFromNotification for where that flag gets set instead of a bare
// router.push to this route. onClose here is just a safe fallback for the
// rare case this raw route is ever hit directly.
export default function MemoriesRoute() {
  return <MemoriesScreen onClose={() => router.replace('/(tabs)')} />;
}
