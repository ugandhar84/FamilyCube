/**
 * MemoriesScreen — the family-photos Memories screen (MemoriesTabComp).
 * No longer a real Expo Router tab route — opened as a Hub-owned
 * FullPageOverlay (same pattern as GroceryScreen/MealsScreen/
 * RewardsDashboardScreen) via store/uiStore.ts's
 * openMemoriesScreenRequested flag, so it gets the FullPageOverlay
 * swipe-back gesture and the PageHeading header rhythm every other
 * Hub-launched feature already has, instead of its own router-based
 * back button. app/(tabs)/memories.tsx is now just a thin fallback route
 * kept for stale deep links.
 *
 * No local FAB here — posting a memory goes through the SAME shared FAB
 * Tasks uses (app/(tabs)/_layout.tsx), which morphs to "+" and fires
 * openMemoryComposerRequested (useUIStore) the moment this screen is
 * focused, exactly like Tasks' own openTaskComposerRequested. MemoriesTab
 * itself reads that flag to open ComposeMemoryModal.
 */
import { useEffect, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Image as ImageIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useNotifStore } from '@/store/notifStore';
import { useUIStore } from '@/store/uiStore';
import { hideTabBar, showTabBar } from '@/lib/tabBarVisibility';
import { checkVideoVisibility, pauseAllVideos } from '@/lib/videoVisibility';
import { PageHeading } from '@/components/PageHeading';
import { GEMINI } from '@/constants/geminiRhythm';
import MemoriesTabComp from './MemoriesTab';

export default function MemoriesScreen({ onClose }: { onClose?: () => void } = {}) {
  const { colors, isDark } = useTheme();
  // Gemini-rhythm canvas (warm cream, light mode only) — Memories joined
  // School/Home Care/Rewards/member-profile's named exception to CLAUDE.md
  // rule 6's pure-white default [live-requested: "make the rythem of the
  // gemini and borders"]. Dark mode keeps the normal colors.background.
  const pageBg = isDark ? colors.background : GEMINI.canvas;
  const insets = useSafeAreaInsets();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const readOnly = false; // same Memories page for every role

  useEffect(() => {
    hideTabBar();
    return () => showTabBar();
  }, []);

  // AutoplayVideo (components/MediaComponents.tsx) only plays once
  // videoVisibility's registry marks it visible, which nothing was ever
  // calling for this feed — every registered video sat stuck at its
  // initial isVisible=false forever [live-reported: "video should be
  // playing with muted on focus"]. checkVideoVisibility() measures each
  // registered card against the window and must be driven by this
  // screen's own onScroll (below) plus once up front for whatever's
  // already on screen at open, same as a feed relying on
  // onViewableItemsChanged would fire immediately on mount.
  useEffect(() => {
    const t = setTimeout(checkVideoVisibility, 300);
    return () => clearTimeout(t);
  }, []);

  // memory_posted/memory_liked push taps used to deep-link here with
  // ?memoryId=... via router query params; now carried through
  // uiStore's pendingMemoryFocusId instead (see kioskNavStore.ts's
  // navigateFromNotification), read + cleared once on open.
  const scrollRef = useRef<ScrollView>(null);
  const [focusMemoryId] = useState(() => {
    const id = useUIStore.getState().pendingMemoryFocusId;
    if (id) useUIStore.getState().setPendingMemoryFocusId(undefined);
    return id;
  });
  const [scrolledToFocus, setScrolledToFocus] = useState(false);
  // MemoriesTab owns the real pagination logic (loadMore/hasMore) but has
  // no ScrollView of its own to detect "user scrolled near the bottom" —
  // it hands its loadMore function up once via onLoadMoreReady so this
  // screen's own onScroll (the ScrollView it actually renders) can call it.
  const loadMoreRef = useRef<() => void>(() => {});
  // ComposeMemoryModal's default shell is a FullPageOverlay (position:
  // 'absolute' filling its nearest parent) — rendering it from inside
  // MemoriesTab, nested in this screen's ScrollView, made it fill just the
  // ScrollView's content area instead of the real screen, so it opened
  // inline on the feed instead of covering the whole page [live-reported:
  // "the Tuckaway memory is opening inline to the Memories landing page"].
  // MemoriesTab hands its composer JSX up here so it renders as a sibling
  // of the ScrollView instead.
  const [composerNode, setComposerNode] = useState<React.ReactNode>(null);

  // A freshly-posted video never triggers the ScrollView's onScroll (the
  // user didn't scroll — the list just grew above the fold), so it sat at
  // its initial isVisible=false forever even after the fix above
  // [live-reported, after the mount/scroll fix already landed: "video
  // playback is still not working"]. composerNode flips from non-null back
  // to null the instant ComposeMemoryModal closes (post or cancel) — a
  // cheap, reliable signal to re-measure every registered video once the
  // new card has had a layout pass.
  useEffect(() => {
    if (composerNode) return;
    const t = setTimeout(checkVideoVisibility, 300);
    return () => clearTimeout(t);
  }, [composerNode]);

  // Clears the Hub pill's "new memory" dot (AppsQuickAccessPills.tsx) the
  // moment this screen is actually opened — live-requested: "once user
  // opens clear it," not just when the separate notification panel happens
  // to mark it read. Real DB write (not just local state) so the dot stays
  // cleared across app restarts, same durability as every other read
  // receipt in the app.
  useFocusEffect(() => {
    import('@/lib/db/notifications').then(({ markAllNotificationsRead }) => {
      markAllNotificationsRead('', ['memory_posted', 'memory_liked']).catch(() => {});
    }).catch(() => {});
    // Optimistic local update — don't wait on the DB round-trip for the
    // pill's dot to disappear.
    const notifications = useNotifStore.getState().notifications;
    if (notifications?.some(n => !n.read && (n.type === 'memory_posted' || n.type === 'memory_liked'))) {
      useNotifStore.getState().markCachedRead(
        notifications.filter(n => !n.read && (n.type === 'memory_posted' || n.type === 'memory_liked')).map(n => n.id)
      );
    }
    // Re-measure on regaining focus (e.g. back from the fullscreen viewer
    // or another tab) so on-screen videos resume autoplay, and pause
    // everything on blur — pauseAllVideos existed but nothing ever called
    // it, so a video kept playing (with sound, if unmuted) after leaving
    // this screen.
    const t = setTimeout(checkVideoVisibility, 300);
    return () => { clearTimeout(t); pauseAllVideos(); };
  });

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <PageHeading
        eyebrow="FAMILY CUBE · MEMORIES"
        title="The ordinary, kept."
        subtitle="Little moments from everyday life — photos, notes, and the stories behind them."
        accent="pink"
        Icon={ImageIcon}
        onTitlePress={onClose}
        topInset={insets.top}
      />
      {/* The shared Ask Cube FAB is visible on this tab (morphs to a "+"
          for Memories' composer) — same overlap risk fixed on
          Hub/Quests/School/Health & Records. */}
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 600) {
            loadMoreRef.current();
          }
          checkVideoVisibility();
        }}
        scrollEventThrottle={200}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100, paddingTop: 14 }}>
        <MemoriesTabComp colors={colors} isDark={isDark} readOnly={readOnly}
          focusMemoryId={focusMemoryId}
          onLoadMoreReady={(fn) => { loadMoreRef.current = fn; }}
          onComposerPortal={setComposerNode}
          onFocusMemoryLayout={(y) => {
            // Only auto-scroll once — onLayout can re-fire on later
            // relayouts (e.g. an image finishing its own load), and
            // re-scrolling every time would fight the user's own scrolling.
            if (scrolledToFocus) return;
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
            setScrolledToFocus(true);
          }} />
      </ScrollView>
      {composerNode}
    </View>
  );
}
