/**
 * KioskMemoriesTab — family photo album for kiosk mode.
 *
 * Previously reimplemented a bespoke read-only `family_memories` query with
 * no posting and no heart/like reaction, per its own now-stale header
 * comment. That was a real parity gap, not a deliberate scope decision: the
 * real screen (features/vault/tabs/MemoriesTab.tsx) supports posting a
 * memory (ComposeMemoryModal, MemoriesTab.tsx:173-550, wired to the real
 * postMemory function at MemoriesTab.tsx:926) and hearting one
 * (heartMemory, MemoriesTab.tsx:974-1001) — nothing about either action is
 * phone-specific, and the standing "exact alignment" rule means kiosk must
 * offer the same capabilities, not a read-only subset.
 *
 * Reuses the real MemoriesTab component directly (same approach already
 * used for chat's MessageBubble/VoiceComponents) rather than
 * reimplementing its query/realtime/heart/delete/post logic — MemoriesTab
 * already renders as inline content meant to sit inside a host ScrollView
 * (see its own header comment: "MemoriesTab itself just renders a plain
 * list inside it"), which is exactly what's needed here. The senior/
 * grandparent read-only rule (MemoriesScreen.tsx:29's `readOnly = role ===
 * 'senior'`) carries over unchanged since KioskMemoriesTab is only ever
 * rendered for a senior profile (KioskScreen.tsx: `effectiveTab ===
 * 'memories' && isSenior`) — matching mobile's own gate exactly rather than
 * inventing a kiosk-specific permission rule.
 *
 * Composing has no shared FAB on kiosk (unlike the phone's app/(tabs)/
 * _layout.tsx FAB that flips openMemoryComposerRequested for
 * MemoriesTab.tsx to consume) — a kiosk-native "+" button in the header
 * flips that exact same useUIStore flag instead, so MemoriesTab's own
 * existing effect (MemoriesTab.tsx:814-819) opens its own real
 * ComposeMemoryModal — no new business logic, just a different trigger for
 * the same flag mobile already reads.
 *
 * ── Hub-OS migration, and the tab's three layers ────────────────────────
 * Restyled onto the kiosk palette + KioskOS primitives. The tab now has
 * three layers, in deliberate priority order:
 *
 *   1. THE GRID (primary, owner-specified). Photos two per row, sized by a
 *      real measured-container calculation so 2-up holds in portrait and
 *      landscape without stretching. This is the default layout.
 *   2. THE FEED. The real MemoriesTab, unchanged, below the grid — it
 *      still owns hearting, deleting, posting and the media lightbox.
 *      Tapping a grid card scrolls the feed to that memory through the
 *      focusMemoryId prop MemoriesTab already exposes for notification
 *      deep links, so the grid is a visual index into the real feed and
 *      not a second implementation of it.
 *   3. AMBIENT MODE (opt-in, the deferred stretch item). A toggle swaps
 *      the grid for the auto-advancing slideshow, for a countertop display
 *      glanced at across a room. It is an alternative to the grid, never a
 *      replacement for it — the grid is what the tab opens on.
 *
 * The embedded MemoriesTab is a shared phone component styled from the
 * app's `colors`; see KioskSchoolTab's header for why that's threaded
 * through rather than forked.
 */
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Plus, Images, LayoutGrid, Play } from 'lucide-react-native';
import { KIOSK_SPACE } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import { WidgetCard, WidgetHeader, TabTitle, ActionButton, EmptyNote } from '../components/KioskOS';
import { useKioskActivity } from '../KioskActivityContext';
import { KioskMemorySlideshow } from '../components/KioskMemorySlideshow';
import { KioskMemoryGrid } from '../components/KioskMemoryGrid';
import { useKioskPhotos } from '../useKioskPhotos';
import { useUIStore } from '@/store/uiStore';
import MemoriesTab from '@/features/vault/tabs/MemoriesTab';

export function KioskMemoriesTab({ colors, isDark, readOnly = false }: {
  colors: any; isDark: boolean; readOnly?: boolean;
}) {
  const { k, isDark: kioskDark } = useKioskColors();
  const { registerActivity } = useKioskActivity();
  const { photos, loading } = useKioskPhotos();

  const [ambient, setAmbient] = useState(false);
  const [focusMemoryId, setFocusMemoryId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // MemoriesTab reports the focused card's measured Y offset relative to
  // its own content; the host ScrollView owns the scrolling, which is
  // exactly the split the prop pair was designed for on the phone.
  const feedTopRef = useRef(0);

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScrollBeginDrag={registerActivity}
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
                  onPress={() => {
                    registerActivity();
                    useUIStore.getState().setOpenMemoryComposerRequested(true);
                  }}
                />
              )}
            </View>
          }
        />

        {ambient ? (
          <KioskMemorySlideshow style={s.block} />
        ) : (
          <WidgetCard k={k} isDark={kioskDark} style={s.block}>
            <WidgetHeader
              Icon={Images} eyebrow="Album" title="Photos"
              accent={k.purple} k={k} isDark={kioskDark}
            />
            {loading ? null : photos.length === 0 ? (
              <EmptyNote
                text="No family photos yet. Add one and it'll show up here."
                k={k}
              />
            ) : (
              <KioskMemoryGrid
                photos={photos}
                onSelect={id => { registerActivity(); setFocusMemoryId(id); }}
              />
            )}
          </WidgetCard>
        )}

        <WidgetCard
          k={k}
          isDark={kioskDark}
          onLayout={e => { feedTopRef.current = e.nativeEvent.layout.y; }}
        >
          <WidgetHeader
            Icon={Images} eyebrow="Feed" title="All memories"
            accent={k.blue} k={k} isDark={kioskDark}
          />
          <MemoriesTab
            colors={colors}
            isDark={isDark}
            readOnly={readOnly}
            focusMemoryId={focusMemoryId}
            onFocusMemoryLayout={y => {
              // y is relative to MemoriesTab's own content, so add where
              // the feed card itself starts in this ScrollView.
              scrollRef.current?.scrollTo({ y: Math.max(0, feedTopRef.current + y - KIOSK_SPACE.lg), animated: true });
            }}
          />
        </WidgetCard>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: KIOSK_SPACE.lg, paddingBottom: KIOSK_SPACE.xxl },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm, flexShrink: 1 },
  block: { marginBottom: KIOSK_SPACE.md },
});
