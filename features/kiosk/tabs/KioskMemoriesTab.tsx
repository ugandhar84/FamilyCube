/**
 * KioskMemoriesTab — family photo album for kiosk mode.
 *
 * ── The layout, and why it is now ONE grid instead of two ───────────────
 * The owner's ask was two per row THROUGHOUT — not only in the small
 * read-only preview grid at the top, but in the real interactive feed
 * below it, the one that owns hearting, deleting, posting and the
 * full-screen lightbox.
 *
 * That feed used to be the phone's own MemoriesTab embedded unchanged: a
 * single-column tilted scrapbook card with paper corner-mounts, designed
 * for a full-width phone screen. It has been replaced by
 * KioskMemoryFeed — kiosk's own flat 2-column card in the Hub-OS visual
 * language, driven by the SHARED useFamilyMemories hook the phone's
 * MemoriesTab now uses too. Same query, same realtime subscription, same
 * keyset pagination, same heart/delete/post with their notification side
 * effects; a different card around identical machinery.
 *
 * The separate small preview grid (KioskMemoryGrid over useKioskPhotos) is
 * NO LONGER RENDERED here, and that is a deliberate call, not an omission.
 * Its entire justification was that it was the only 2-up surface on a tab
 * whose real feed was 1-up — it existed as a fast visual index INTO a feed
 * that looked nothing like it, with tapping a tile scrolling the feed to
 * that memory. Now that the feed itself is a 2-column photo grid, keeping
 * the preview would mean two 2-column photo grids stacked directly on each
 * other, the top one read-only and the bottom one interactive, showing the
 * same photos twice — which is precisely the half-redundant stacking the
 * owner was trying to get away from. One grid, and it is the real one.
 *
 * KioskMemoryGrid.tsx itself is left on disk: the Overview tab's "Kept"
 * photo-frame widget and the ambient slideshow still share its
 * useKioskPhotos source, and deleting a component this tab merely stopped
 * calling is a cleanup decision beyond this change.
 *
 * So the tab is now two layers, not three:
 *   1. THE FEED (default). Real memories, two per row, fully interactive.
 *   2. AMBIENT MODE (opt-in). A toggle swaps the feed for the
 *      auto-advancing slideshow, for a countertop display glanced at from
 *      across a room. An alternative to the feed, never a replacement —
 *      the tab still opens on the feed.
 *
 * ── Posting ─────────────────────────────────────────────────────────────
 * The header "+" used to flip useUIStore's openMemoryComposerRequested and
 * let the embedded MemoriesTab react to it. With MemoriesTab no longer
 * embedded, nothing on this side listens for that flag, so the tab now
 * mounts the phone's real ComposeMemoryModal directly and hands it the
 * shared hook's own postMemory. Same component, same upload path, same
 * RLS-aware error handling — just triggered directly instead of through a
 * global flag with no listener. See the modal's own note for why porting
 * it to a kiosk-native form was left out of scope.
 *
 * ── The senior gate ─────────────────────────────────────────────────────
 * `readOnly` comes from KioskScreen's `isSenior`, matching MemoriesScreen's
 * own `readOnly = role === 'senior'` rule. Unlike the phone's MemoriesTab —
 * which accepts the prop but has never actually acted on it — the kiosk
 * feed genuinely enforces it: no compose button, no delete affordance.
 * Hearting stays available, since loving a grandchild's photo is the whole
 * point of a grandparent's kiosk.
 */
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Plus, Images, LayoutGrid, Play, Camera } from 'lucide-react-native';
import { KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, TabTitle, ActionButton } from '../components/KioskOS';
import { useKioskActivity, useKioskLockSuspended } from '../KioskActivityContext';
import { KioskMemorySlideshow } from '../components/KioskMemorySlideshow';
import { KioskMemoryFeed } from '../components/KioskMemoryFeed';
import { KioskFormDrawer } from '../components/KioskFormDrawer';
import { useFamilyStore } from '@/store/familyStore';
import { useFamilyMemories } from '@/features/vault/tabs/useFamilyMemories';
import { ComposeMemoryModal } from '@/features/vault/tabs/MemoriesTab';

export function KioskMemoriesTab({ colors, isDark, readOnly = false }: {
  colors: any; isDark: boolean; readOnly?: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const members = useFamilyStore(s => s.members);

  const [ambient, setAmbient] = useState(false);
  const [composing, setComposing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // The feed reports the focused card's measured Y offset relative to its
  // own content; this ScrollView owns the scrolling — the same split the
  // phone's focusMemoryId/onFocusMemoryLayout pair was designed for.
  const feedTopRef = useRef(0);

  // Kiosk has no router and takes no ?memoryId= deep link, so nothing here
  // sets a focus target today — the previous value came only from tapping
  // the preview grid, which this tab no longer renders (the feed IS the
  // grid now). The prop pair is still threaded through, and the hook still
  // splices in an off-page-1 focus target, so wiring a notification tap to
  // it later is a one-line change rather than a re-plumb. Nothing about the
  // PHONE's deep-link path is affected — MemoriesScreen still drives it.
  const focusMemoryId: string | null = null;

  // ONE hook instance for the whole tab, so the feed and the composer share
  // a single query, a single realtime channel and one optimistic list — a
  // memory posted from the composer appears in the feed immediately because
  // both are reading the same state, not two copies of it.
  const api = useFamilyMemories({ focusMemoryId });

  // ComposeMemoryModal is a native Modal with text entry — its touches
  // never reach KioskScreen's root onTouchStart, so hold the idle lock
  // while it is open or a half-written memory is thrown away by the timer.
  // (The lightbox does the same inside KioskMemoryFeed.)
  useKioskLockSuspended(composing);

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScrollBeginDrag={registerActivity}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent }) => {
          // Same near-the-bottom rule MemoriesScreen uses on the phone, so
          // the kiosk gets the same real pagination rather than stopping at
          // page one.
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 600) {
            api.loadMore();
          }
        }}
      >
        <TabTitle
          title="Family Memories"
          subtitle="The album, and what the household has been up to"
          k={k}
          right={
            <View style={s.titleActions}>
              <ActionButton
                label={ambient ? 'Grid' : 'Slideshow'}
                Icon={ambient ? LayoutGrid : Play}
                accent={k.purple}
                k={k}
                isDark={kioskDark}
                accessibilityHint={ambient
                  ? 'Show the photo grid'
                  : 'Play photos full-width, advancing on their own'}
                onPress={() => { registerActivity(); setAmbient(v => !v); }}
              />
              {!readOnly && (
                <ActionButton
                  label="Add Memory"
                  Icon={Plus}
                  accent={k.primary}
                  k={k}
                  isDark={kioskDark}
                  variant="solid"
                  accessibilityHint="Opens the memory composer"
                  onPress={() => { registerActivity(); setComposing(true); }}
                />
              )}
            </View>
          }
        />

        {ambient ? (
          <KioskMemorySlideshow style={s.block} />
        ) : (
          <WidgetCard
            k={k}
            isDark={kioskDark}
            onLayout={e => { feedTopRef.current = e.nativeEvent.layout.y; }}
          >
            <WidgetHeader
              Icon={Images} eyebrow="Album" title="All memories"
              accent={k.purple} k={k} isDark={kioskDark}
            />
            <KioskMemoryFeed
              api={api}
              readOnly={readOnly}
              focusMemoryId={focusMemoryId}
              onFocusMemoryLayout={y => {
                // y is relative to the feed's own content, so add where the
                // card that holds it starts in this ScrollView.
                scrollRef.current?.scrollTo({
                  y: Math.max(0, feedTopRef.current + y - KIOSK_SPACE.lg),
                  animated: true,
                });
              }}
            />
          </WidgetCard>
        )}
      </ScrollView>

      {/* The phone's real composer, handed the shared hook's own postMemory
          — no second upload/insert path. renderShell swaps the phone's
          own bottom-slide-up Modal for kiosk's right-anchored
          KioskFormDrawer [live-requested: "add memory also should be side
          form for kiosek"] — every real field (photo/video capture, hero
          promotion, caption + overlay toggle, member tagging, occasion
          tag, the 6-media cap, the video-length cap) is the exact same
          ComposeMemoryModal state/logic, just re-chromed; see that
          component's own renderShell comment for why its mobile-only title
          row is intentionally NOT part of what's passed in here (kiosk's
          own KioskFormDrawer header already covers title/subtitle/close). */}
      {!readOnly && (
        <ComposeMemoryModal
          visible={composing}
          onClose={() => { registerActivity(); setComposing(false); }}
          onPost={api.postMemory}
          members={members}
          myId={api.myId}
          colors={colors}
          isDark={isDark}
          renderShell={(shellVisible, shellOnClose, children) => (
            <KioskFormDrawer
              visible={shellVisible}
              variant="drawer"
              title="Add Memory"
              subtitle="Tuck away a photo or video for the family album"
              accent={k.purple}
              Icon={Camera}
              k={k}
              onClose={shellOnClose}
            >
              {children}
            </KioskFormDrawer>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, flexShrink: 1 },
  block: { marginBottom: KIOSK_SPACE.md },
});
