/**
 * KioskSurface — the shared chrome that gives kiosk mode a committed
 * visual identity of its own, the way features/games' "Neon Cabinet"
 * layer does for the arcade.
 *
 * The critical difference from the arcade, and the whole thesis of this
 * layer: Games earns its identity by ABANDONING the app palette (dark
 * violet, neon, same in light and dark mode) because stepping into a game
 * should feel like a different world. Kiosk must not do that — a kitchen
 * dashboard is the same calm Kinfolk household, so it cannot differentiate
 * itself with color. It has to differentiate with everything else:
 *
 *   · DEPTH. A phone screen is a flat sheet held in the hand. A countertop
 *     display is furniture — it is looked at, not held — so its cards read
 *     as physical tiles resting on a surface: real elevation, a soft warm
 *     shadow, a hairline top highlight. That "objects on a counter" quality
 *     is the single strongest signal that this is not a phone UI, and it's
 *     entirely orthogonal to hue.
 *
 *   · RHYTHM. Not "phone spacing multiplied." Air goes BETWEEN zones;
 *     within a zone, content stays tight. That contrast is what makes a
 *     screen parse as a few groups at a glance. Inflating every gap
 *     uniformly (the first cut of this layer, live-reported as "too
 *     zoomed in") does the opposite — containers get big and sparse while
 *     the structure gets no clearer, and the whitespace reads as leftover
 *     rather than deliberate.
 *
 *   · ZONE HEADERS. Instead of a small grey uppercase caption, each zone
 *     is announced by a title with a colored accent bar and a live count.
 *     From across the room you read the SHAPE of the screen (three zones,
 *     one has a number in it) before you read any word on it.
 *
 *   · RESTRAINT IN SCALE. Only a handful of things — the clock, a
 *     headline count — are genuinely room-scale. Everything else is
 *     arm's-length sized, and gets its presence from craft (consistent
 *     radii, one shared soft shadow, tidy alignment) rather than size.
 *
 * Everything here still takes its colors from useTheme()'s colors.* — no
 * hex is hardcoded — and every size comes from kioskTheme's scale.
 */
import type { ReactNode } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, kioskElevation } from '../kioskTheme';

/**
 * A raised tile. `tone` optionally tints the whole surface toward an
 * accent (used to make a zone that needs attention read as warm/urgent
 * from a distance without any text being legible yet).
 */
export function KioskCard({
  children, colors, isDark, tone, style, accent,
}: {
  children: ReactNode;
  colors: any;
  isDark: boolean;
  /** Accent color to tint the tile toward. Omit for a neutral card. */
  tone?: string;
  /** Draws a thick accent edge down the left side. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: tone ? tone + (isDark ? '1A' : '0F') : colors.card,
          borderColor: tone ? tone + '33' : colors.border,
          // One shared elevation recipe for every raised kiosk surface —
          // see kioskElevation's own note on why consistency here is most
          // of what reads as craft.
          ...kioskElevation(tone ?? colors.primary, isDark),
        },
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A zone header: accent bar + title + optional count chip. This is the
 * main thing that makes a kiosk screen scannable at distance — the colored
 * bar and the count are legible as structure well before the words are.
 */
export function KioskZoneHeader({
  title, count, accent, colors, right,
}: {
  title: string;
  /** Rendered as a large numeral beside the title. Omit to hide. */
  count?: number;
  accent: string;
  colors: any;
  right?: ReactNode;
}) {
  return (
    <View style={s.zoneHeader}>
      <View style={[s.zoneBar, { backgroundColor: accent }]} />
      <Text style={[s.zoneTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      {count !== undefined && (
        <View style={[s.zoneCount, { backgroundColor: accent + '1F' }]}>
          <Text style={[s.zoneCountText, { color: accent }]}>{count}</Text>
        </View>
      )}
      <View style={s.zoneSpacer} />
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: KIOSK_RADIUS.lg,
    borderWidth: 1,
    // Tightened from KIOSK_SPACE.lg: card padding is intra-component
    // spacing, and inflating it was a big part of why tiles read as
    // oversized containers holding very little.
    padding: KIOSK_SPACE.md,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: KIOSK_SPACE.sm,
    marginBottom: KIOSK_SPACE.sm,
  },
  // A bar rather than a dot — at distance a dot disappears while a bar
  // still reads as "this zone is amber." Sized to the title's cap height
  // so the two align as one unit instead of the bar looming over it.
  zoneBar: { width: 4, height: 20, borderRadius: 2 },
  zoneTitle: { fontSize: KIOSK_TYPO.heading, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
  zoneCount: {
    minWidth: 30, paddingHorizontal: KIOSK_SPACE.xs, paddingVertical: 1,
    borderRadius: KIOSK_RADIUS.full, alignItems: 'center', justifyContent: 'center',
  },
  zoneCountText: { fontSize: KIOSK_TYPO.subheading, fontWeight: '900', fontVariant: ['tabular-nums'] },
  zoneSpacer: { flex: 1 },
});
