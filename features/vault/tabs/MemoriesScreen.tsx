/**
 * MemoriesScreen — the family-photos Memories screen (MemoriesTabComp),
 * mirroring MealsScreen.tsx/GroceryScreen.tsx's own-header pattern.
 * app/(tabs)/memories.tsx previously pointed at a same-named but unrelated
 * PawBond pet-photo timeline screen ("No babies yet" empty state) — that
 * whole feature has been removed; this is the one real Memories screen now.
 *
 * No local FAB here — posting a memory goes through the SAME shared FAB
 * Tasks uses (app/(tabs)/_layout.tsx), which morphs to "+" and fires
 * openMemoryComposerRequested (useUIStore) the moment this screen is
 * focused, exactly like Tasks' own openTaskComposerRequested. MemoriesTab
 * itself reads that flag to open ComposeMemoryModal.
 */
import { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ImageIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { useFamilyStore } from '@/store/familyStore';
import { useNotifStore } from '@/store/notifStore';
import MemoriesTabComp from './MemoriesTab';

export default function MemoriesScreen({ hideHeader = false }: { hideHeader?: boolean }) {
  const { colors, isDark } = useTheme();
  const { members, activeMemberId } = useFamilyStore();
  const activeMember = members.find(m => m.id === activeMemberId) ?? members[0];
  const readOnly = activeMember?.role === 'senior';

  // memory_posted/memory_liked push taps (app/_layout.tsx) deep-link here
  // with ?memoryId=... — this screen owns the actual ScrollView (MemoriesTab
  // itself just renders a plain list inside it), so it's the one that can
  // scroll to the target card once MemoriesTab reports that card's
  // measured Y offset back up via onFocusMemoryLayout.
  const { memoryId } = useLocalSearchParams<{ memoryId?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [scrolledToFocus, setScrolledToFocus] = useState(false);
  // MemoriesTab owns the real pagination logic (loadMore/hasMore) but has
  // no ScrollView of its own to detect "user scrolled near the bottom" —
  // it hands its loadMore function up once via onLoadMoreReady so this
  // screen's own onScroll (the ScrollView it actually renders) can call it.
  const loadMoreRef = useRef<() => void>(() => {});

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
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={hideHeader ? [] : ['top']}>
      {!hideHeader && (
        <View style={{ flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ marginRight: 12 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ width: 34, height: 34, borderRadius: 10,
            backgroundColor: colors.pink + '18', borderWidth: 1, borderColor: colors.pink + '30',
            alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <ImageIcon size={17} color={colors.pink} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3, flex: 1 }}>
            Memories
          </Text>
        </View>
      )}
      {/* The shared Ask Cube FAB is visible on this tab (morphs to a "+"
          for Memories' composer) — same overlap risk fixed on
          Hub/Quests/School/Health & Records. */}
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 600) {
            loadMoreRef.current();
          }
        }}
        scrollEventThrottle={200}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 140, paddingTop: 14 }}>
        <MemoriesTabComp colors={colors} isDark={isDark} readOnly={readOnly}
          focusMemoryId={memoryId}
          onLoadMoreReady={(fn) => { loadMoreRef.current = fn; }}
          onFocusMemoryLayout={(y) => {
            // Only auto-scroll once — onLayout can re-fire on later
            // relayouts (e.g. an image finishing its own load), and
            // re-scrolling every time would fight the user's own scrolling.
            if (scrolledToFocus) return;
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
            setScrolledToFocus(true);
          }} />
      </ScrollView>
    </SafeAreaView>
  );
}
