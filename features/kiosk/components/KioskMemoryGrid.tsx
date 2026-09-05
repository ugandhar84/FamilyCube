/**
 * KioskMemoryGrid — the kiosk Memories tab's PRIMARY layout: family photos
 * laid out two per row.
 *
 * Owner-specified: two items per row, not one and not three, held by a real
 * responsive column calculation rather than a fixed card width — a fixed
 * width either stretches awkwardly wide on a landscape install or clips on
 * a portrait one, which is the exact failure the Hub grid already hit and
 * fixed in the audit pass.
 *
 * ── How the width is measured, and why not off the window ───────────────
 * Same pattern KioskHubTab established after that bug: measure the
 * CONTAINER with onLayout, not the window. This grid does not occupy the
 * window — it renders inside KioskScreen's content pane, to the right of a
 * KIOSK_RAIL_WIDTH nav rail and inside the tab's own padding. Deriving a
 * column width from the raw window width makes every card about half the
 * rail too wide, so a 2-up row cannot fit its own two columns. onLayout
 * also stays correct through rotation and Split View for free, where a
 * window-derived breakpoint would need re-deriving. The window width is
 * still read as a first-frame fallback, used for one frame before
 * onLayout reports.
 *
 * COLUMNS is a constant rather than a breakpoint because the requirement is
 * two per row in both orientations. The responsive part is the WIDTH each
 * of those two columns gets, which is what keeps the cards from stretching.
 *
 * ── What this grid does and does not own ────────────────────────────────
 * It is a VIEW. Hearting, deleting, posting and the media lightbox all stay
 * in the real MemoriesTab component below it — reimplementing them here
 * would fork logic that already has RLS rules and notification side effects
 * behind it (heartMemory's family-notifier call, the poster-or-parent
 * delete gate). Tapping a card scrolls the feed to that memory via the
 * focusMemoryId prop MemoriesTab already exposes for deep-linked
 * notifications, so the grid is a fast visual index into the real feed
 * rather than a second implementation of it.
 */
import { useState } from 'react';
import {
  View, Text, Image, Pressable, StyleSheet, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_RAIL_WIDTH } from '../kioskTheme';
import { useKioskColors } from '../kioskPalette';
import type { KioskPhoto } from '../useKioskPhotos';

/** Owner-specified: two per row, in both portrait and landscape. */
const COLUMNS = 2;

export function KioskMemoryGrid({
  photos, onSelect, style,
}: {
  photos: KioskPhoto[];
  /** Scrolls the real feed below to this memory. */
  onSelect: (memoryId: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { k } = useKioskColors();
  const { width: winWidth } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);

  const GAP = KIOSK_SPACE.md;
  // Window-minus-rail-minus-padding is only ever used for the first frame,
  // before onLayout reports the real container width.
  const containerWidth = gridWidth > 0
    ? gridWidth
    : Math.max(0, winWidth - KIOSK_RAIL_WIDTH - KIOSK_SPACE.lg * 2 - KIOSK_SPACE.md * 2);

  // floor() rather than a percentage: two cards at 50% plus a real gap
  // between them overflows the row by exactly the gap, which on a wrapping
  // row silently drops the second card to its own line — a 1-up layout
  // wearing a 2-up stylesheet.
  const cardWidth = Math.max(0, Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS));
  // A photo frame reads best a little wider than tall; 4:3 keeps two cards
  // on a row from becoming tall enough to push the feed off the screen.
  const cardHeight = Math.max(120, Math.round(cardWidth * 0.72));

  return (
    <View
      style={[s.grid, { gap: GAP }, style]}
      onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
    >
      {photos.map(p => (
        <Pressable
          key={p.key}
          onPress={() => onSelect(p.memoryId)}
          style={({ pressed }) => [
            s.card,
            {
              width: cardWidth || undefined,
              height: cardHeight,
              backgroundColor: k.well,
              borderColor: pressed ? k.cardBorderStrong : k.cardBorder,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${p.title}${p.date ? `, ${p.date}` : ''}`}
          accessibilityHint="Opens this memory in the album below"
        >
          <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {/* The caption plate is a fixed translucent dark rather than a
              palette token in either mode: it sits on an arbitrary
              photograph, so its contrast has to come from the plate, not
              from the theme. Same rule as the slideshow's own caption. */}
          <View style={s.caption} pointerEvents="none">
            <Text style={s.captionTitle} numberOfLines={1}>{p.title}</Text>
            {!!p.date && <Text style={s.captionDate} numberOfLines={1}>{p.date}</Text>}
          </View>
        </Pressable>
      ))}
      {/* An odd photo count leaves a hole in the last row. A flexible
          spacer keeps the final card at its real column width instead of
          letting `space-between` stretch it across the row. */}
      {photos.length % COLUMNS !== 0 && (
        <View style={{ width: cardWidth || undefined }} pointerEvents="none" />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    borderRadius: KIOSK_RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  caption: {
    paddingHorizontal: KIOSK_SPACE.sm,
    paddingVertical: KIOSK_SPACE.xs,
    backgroundColor: 'rgba(10,8,7,0.62)',
  },
  captionTitle: { fontSize: KIOSK_TYPO.body, fontWeight: '800', color: '#F7F2EE' },
  captionDate: { fontSize: KIOSK_TYPO.micro, fontWeight: '600', color: '#D8CCC4', marginTop: 1 },
});
