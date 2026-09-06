/**
 * KioskOS — the shared "Hub OS" chrome primitives every kiosk screen
 * builds from, matching the reference mockup's visual language as real
 * React Native components.
 *
 * The mockup expresses its identity through four repeated devices, and
 * these are those four:
 *
 *   · WidgetCard    — the rounded tile with a hairline edge that every
 *                     widget sits in (`rounded-3xl border border-cardBorder`).
 *   · WidgetHeader  — the icon-chip + eyebrow + title row that opens each
 *                     widget, with an optional status pill on the right.
 *   · Well          — the inset block INSIDE a widget (`bg-hub-bg` nested
 *                     inside `bg-hub-card`), used for the detail block in
 *                     the ride card, the piggy-bank rows, the grocery rows.
 *   · Chip / Pill   — the tinted label that carries state ("Pending",
 *                     "En Route", "Dairy", "4/4 Members Online").
 *
 * Every one of them takes its colors from useKioskColors(), so all four
 * have a real light and a real dark appearance — the structure is what
 * makes a kiosk screen look like a kiosk screen, not a fixed dark ground.
 *
 * These have now REPLACED KioskSurface.tsx's KioskCard/KioskZoneHeader on
 * every tab KioskScreen actually renders — Overview, Schedule, Meals,
 * Tasks, Chat, Store, Find Family, Memories, School and Health all build
 * from the primitives in this file.
 *
 * KioskSurface.tsx still exists because KioskHubTab.tsx still imports it,
 * but that tab is no longer reachable: nothing imports KioskHubTab, and
 * KioskScreen renders KioskOverviewTab in its place. Both files look like
 * dead code as a result. They were left in place rather than deleted here
 * because removing them is a cleanup decision beyond a styling pass — but
 * a future pass should confirm and drop them rather than migrate them.
 */
import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle, type TextStyle, type ViewProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { KIOSK_TYPO, KIOSK_SPACE, KIOSK_RADIUS, KIOSK_HIT, kioskElevation } from '../kioskTheme';
import { kioskTint, kioskOnAccent, type KioskColors } from '../kioskPalette';

/**
 * The base tile. `accent` optionally tints the whole surface toward a hue
 * (used to make a widget that needs attention read as warm from across the
 * room, before any word on it is legible).
 *
 * Elevation is mode-dependent by design: light mode casts the shared soft
 * warm shadow (kioskElevation), dark mode carries depth in the fill/border
 * step from `bg` to `card` instead, because a cast shadow on a near-black
 * ground is either invisible or reads as mud.
 */
export function WidgetCard({
  children, k, isDark, accent, style, padded = true, onLayout,
}: {
  children: ReactNode;
  k: KioskColors;
  isDark: boolean;
  /** Tints the tile toward this hue. Omit for a neutral card. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
  /** Set false for a card that manages its own inner padding (e.g. a list). */
  padded?: boolean;
  /** For a caller that needs the tile's position/size (e.g. scroll-to). */
  onLayout?: ViewProps['onLayout'];
}) {
  return (
    <View
      onLayout={onLayout}
      style={[
        s.card,
        padded && { padding: KIOSK_SPACE.md },
        {
          backgroundColor: accent ? accent + (isDark ? '14' : '0D') : k.card,
          borderColor: accent ? accent + (isDark ? '38' : '30') : k.cardBorder,
          ...kioskElevation(accent ?? k.primary, isDark),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The widget's opening row: a tinted icon chip, a small uppercase eyebrow,
 * the widget's real title, and an optional right-hand slot for a status
 * pill or action. Reproduces the mockup's widget header exactly.
 *
 * Grouped as one accessibility node so a screen reader announces
 * "Pickup Radar, Co-Parent Pending Rides" as a single heading rather than
 * three disconnected fragments.
 */
export function WidgetHeader({
  Icon, eyebrow, title, accent, k, isDark, right,
}: {
  Icon: LucideIcon;
  /** Small uppercase kicker above the title ("STOVE & OVEN"). */
  eyebrow: string;
  title: string;
  accent: string;
  k: KioskColors;
  isDark: boolean;
  right?: ReactNode;
}) {
  return (
    <View style={s.header}>
      <View
        style={[s.headerIcon, { backgroundColor: accent + (isDark ? '24' : '1A') }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon size={20} color={accent} />
      </View>
      <View
        style={s.headerText}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}. ${eyebrow}`}
      >
        <Text style={[s.eyebrow, { color: k.textFaint }]} numberOfLines={1}>
          {eyebrow.toUpperCase()}
        </Text>
        <Text style={[s.headerTitle, { color: k.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/**
 * The mockup's OTHER header shape — `.panel-head`/`.panel-title`: a single
 * uppercase label line with a small faint value on the right (a count, a
 * date, a "N sharing" readout), no icon chip and no second title line.
 *
 * Promoted here from being copy-pasted per-file (KioskOverviewTab.tsx
 * first, for its own rebuilt Approvals/Coin Jars/Meals This Week/Grocery/
 * Family Feed/Family Schedule/Find panels, then needed again verbatim in
 * KioskMealsTab.tsx) into a real shared primitive — a third consumer
 * needing the identical style is the signal that it stopped being a
 * one-off local pattern.
 *
 * Distinct from WidgetHeader (icon-chip + two-line eyebrow/title) on
 * purpose: WidgetHeader is right for a card-shaped widget in a grid;
 * PanelHead is right for the mockup's denser list-style panels, which
 * this app increasingly uses once a panel was actually rebuilt against
 * the mockup's own CSS rather than approximated.
 */
export function PanelHead({ title, k, right, style }: {
  title: string;
  k: KioskColors;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.panelHead, style]}>
      <Text style={[s.panelTitle, { color: k.textFaint }]} numberOfLines={1}>{title.toUpperCase()}</Text>
      {right}
    </View>
  );
}

/**
 * An inset block inside a widget — the mockup's nested `bg-hub-bg` panels.
 * In dark mode this is DARKER than the card it sits in (a recess); in light
 * mode it is a warm tint against the white card, which is the light-mode
 * equivalent of a recess. Both read as "set into the tile."
 */
export function Well({
  children, k, style, accent,
}: {
  children: ReactNode;
  k: KioskColors;
  style?: StyleProp<ViewStyle>;
  /** Draws a thick accent edge down the left side. */
  accent?: string;
}) {
  return (
    <View
      style={[
        s.well,
        { backgroundColor: k.well, borderColor: k.cardBorder },
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A tinted state label. The mockup's "Pending" / "En Route" / "Dairy" chips. */
export function Chip({
  label, accent, isDark, filled = false, k,
}: {
  label: string;
  accent: string;
  isDark: boolean;
  /** Solid accent fill (the mockup's "En Route" badge) rather than a wash. */
  filled?: boolean;
  k: KioskColors;
}) {
  const tint = kioskTint(accent, isDark);
  return (
    <View
      style={[
        s.chip,
        filled
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: tint.backgroundColor, borderColor: tint.borderColor },
      ]}
    >
      <Text
        style={[s.chipText, { color: filled ? kioskOnAccent(k, accent) : accent }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * A widget's action button. Two weights: `solid` for the one primary action
 * in a widget, `soft` for everything else. Both meet KIOSK_HIT.control as a
 * minimum tap height regardless of how small the label makes them look —
 * the size/weight distinction kioskTheme's KIOSK_HIT note insists on.
 */
export function ActionButton({
  label, Icon, accent, k, isDark, onPress, variant = 'soft', disabled, accessibilityHint, style,
}: {
  label: string;
  Icon?: LucideIcon;
  accent: string;
  k: KioskColors;
  isDark: boolean;
  onPress: () => void;
  variant?: 'solid' | 'soft';
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const solid = variant === 'solid';
  const tint = kioskTint(accent, isDark);
  const fg = solid ? kioskOnAccent(k, accent) : accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.action,
        solid
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: tint.backgroundColor, borderColor: tint.borderColor },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
    >
      {Icon && <Icon size={17} color={fg} />}
      <Text style={[s.actionText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/**
 * A screen title block — the mockup's per-tab `<h2>` + subtitle pair. Every
 * detail tab opens with one, which is a big part of why the mockup's tabs
 * feel like one product rather than seven separate screens.
 */
export function TabTitle({ title, subtitle, k, right }: {
  title: string;
  subtitle?: string;
  k: KioskColors;
  right?: ReactNode;
}) {
  return (
    <View style={s.tabTitleRow}>
      <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityRole="header" accessibilityLabel={title}>
        <Text style={[s.tabTitle, { color: k.text }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && (
          <Text style={[s.tabSubtitle, { color: k.textMuted }]} numberOfLines={2}>{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
}

/** A quiet inline empty state. Never the largest thing on a screen. */
export function EmptyNote({ text, k, style }: { text: string; k: KioskColors; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[s.empty, { color: k.textFaint }, style]} numberOfLines={3}>
      {text}
    </Text>
  );
}

const s = StyleSheet.create({
  // sm (10) rather than xl (26) — matches the reference mockup's tighter
  // panel radius (`--radius: 10px`). Sits below KIOSK_RADIUS.lg, which
  // drawers/sheets use, so a widget card is now the LEAST rounded surface
  // in kiosk mode rather than the most — a deliberate flip from the
  // ladder's original "bigger surface = bigger radius" assumption, chosen
  // to match the mockup's tight, editorial-panel identity for every widget
  // rather than inventing a new one-off radius step.
  card: {
    borderRadius: KIOSK_RADIUS.sm,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: KIOSK_SPACE.sm,
    marginBottom: KIOSK_SPACE.md,
  },
  // Mock's exact .panel-head/.panel-title: 11px/700/uppercase/0.12em
  // tracking, right-aligned faint value slot, 10px bottom margin.
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  panelTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' },
  headerIcon: {
    width: 38, height: 38, borderRadius: KIOSK_RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: KIOSK_TYPO.micro, fontWeight: '800', letterSpacing: 1.1 },
  headerTitle: { fontSize: KIOSK_TYPO.subheading, fontWeight: '800', letterSpacing: -0.2, marginTop: 1 },
  well: {
    borderRadius: KIOSK_RADIUS.md,
    borderWidth: 1,
    padding: KIOSK_SPACE.md,
  },
  chip: {
    borderRadius: KIOSK_RADIUS.full, borderWidth: 1,
    paddingHorizontal: KIOSK_SPACE.sm, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: KIOSK_TYPO.micro, fontWeight: '800' },
  action: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: KIOSK_SPACE.xs, borderWidth: 1,
    borderRadius: KIOSK_RADIUS.md, minHeight: KIOSK_HIT.control,
    paddingHorizontal: KIOSK_SPACE.md,
  },
  actionText: { fontSize: KIOSK_TYPO.body, fontWeight: '800' },
  tabTitleRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: KIOSK_SPACE.md, marginBottom: KIOSK_SPACE.lg,
  },
  tabTitle: { fontSize: KIOSK_TYPO.title, fontWeight: '800', letterSpacing: -0.6 },
  tabSubtitle: { fontSize: KIOSK_TYPO.caption, fontWeight: '600', marginTop: 3 },
  empty: { fontSize: KIOSK_TYPO.caption, fontWeight: '600' },
});
