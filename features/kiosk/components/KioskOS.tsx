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
import { useRef, useState, type ReactNode } from 'react';
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

/**
 * KioskListRow — the mockup's .task-check/.task-coin/.task-action row shape
 * (checkbox-or-icon · title+meta+badges · value · 1-2 text buttons), one
 * flat line no matter how many optional pieces are present.
 *
 * Promoted here from KioskOverviewTab.tsx's own local ApprovalRow (the
 * Approvals panel's real row) once a second consumer — the "Recently
 * Approved" dispute/reversal cards — needed the identical shape
 * (live-requested: "we should the same card as the approvals"). Same
 * promotion reasoning PanelHead's own header documents: a second real
 * consumer needing byte-identical styling is the signal a local pattern
 * has stopped being a one-off.
 *
 * `leading` replaces the plain checkbox square for a caller that has no
 * buy/approve action to hang there (Recently Approved has none — Dismiss
 * and Flag/Reversal aren't a checkbox-shaped action); omit it entirely for
 * the exact plain bordered square every Approvals row uses.
 */
export function KioskListRow({
  k, isFirst, leading, title, meta, badge, value, actions,
}: {
  k: KioskColors;
  /** Suppresses the row's own top hairline divider for the first row in a list. */
  isFirst?: boolean;
  /** Replaces the default plain checkbox square. Omit for that default. */
  leading?: ReactNode;
  title: string;
  /** Small dim line under the title — a status phrase, "approved by X", etc. */
  meta?: string;
  /** An inline pill next to `meta` — a name tag, a source label. */
  badge?: string;
  /** Right-aligned value column — a coin figure, or omit for no value slot at all. */
  value?: ReactNode;
  /** 1-2 small neutral-filled text buttons, right-aligned. */
  actions?: ReactNode;
}) {
  return (
    <View style={[s.listRow, !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: k.cardBorder }]}>
      {leading ?? <View style={[s.listRowCheck, { borderColor: k.cardBorder }]} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.listRowTitle, { color: k.text }]} numberOfLines={1}>{title}</Text>
        {(!!meta || !!badge) && (
          <View style={s.listRowMetaRow}>
            {!!meta && (
              <Text style={[s.listRowMeta, { color: k.textFaint }]} numberOfLines={1}>{meta}</Text>
            )}
            {!!badge && (
              <View style={[s.listRowBadge, { backgroundColor: k.well }]}>
                <Text style={[s.listRowBadgeText, { color: k.textMuted }]} numberOfLines={1}>{badge}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      {value !== undefined && value}
      {!!actions && <View style={s.listRowActions}>{actions}</View>}
    </View>
  );
}

/** One of KioskListRow's 1-2 action buttons — the mockup's own .task-action:
 * a neutral filled surface, never a colored button — only the LABEL color
 * (e.g. k.danger for a destructive action) differs between actions. */
export function KioskListRowAction({ k, label, color, onPress, disabled, accessibilityLabel }: {
  k: KioskColors; label: string; color: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => [s.listRowActionBtn, { backgroundColor: k.well, borderColor: k.cardBorder }, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[s.listRowActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * KioskExpandableCard — kiosk-native replacement for the phone's
 * CollapsibleQuestCard (features/quests/components/CollapsibleQuestCard.tsx)
 * shell, built for KioskTasksTab.tsx's chore cards. Same real interaction
 * contract that file's callers actually use (tap toggles expand/collapse,
 * double-tap-within-320ms fires `onDoubleTap` instead — confirmed by
 * reading the phone component in full: KioskTasksTab.tsx never passes
 * `pinnedFooter`, `dimmed`, `initiallyExpanded`, or `onLongPress`, so this
 * only reproduces the subset actually exercised), but built on WidgetCard's
 * own flat radius/border/kioskElevation instead of the phone's BlurView +
 * LinearGradient frosted-glass shell at borderRadius 28 — the one real
 * visual mismatch a KioskTasksTab-vs-KioskOverviewTab comparison found
 * (every other convention in that file — chip shapes, spacing, hierarchy —
 * was already consistent with Overview's).
 */
export function KioskExpandableCard({
  accentColor, k, isDark, onDoubleTap, header, children,
}: {
  accentColor: string;
  k: KioskColors;
  isDark: boolean;
  onDoubleTap?: () => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastTap = useRef(0);
  const handlePress = () => {
    const now = Date.now();
    if (onDoubleTap && now - lastTap.current < 320) {
      onDoubleTap();
    } else {
      setExpanded(e => !e);
    }
    lastTap.current = now;
  };
  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: k.card,
          borderColor: k.cardBorder,
          ...kioskElevation(accentColor, isDark),
        },
      ]}
    >
      <Pressable
        onPress={handlePress}
        style={s.expandableHeaderRow}
        accessibilityRole="button"
        accessibilityHint={onDoubleTap ? 'Tap to expand or collapse, double-tap to edit' : 'Tap to expand or collapse'}
      >
        {/* Same accent glow the phone shell uses in place of a solid color
            block — a hairline, not a chunky bar, so it reads as a status
            cue rather than competing with the card's own content. */}
        <View style={[s.expandableAccentBar, { backgroundColor: accentColor }]} />
        <View style={{ flex: 1 }}>{header}</View>
        <ChevronIcon expanded={expanded} color={accentColor} />
      </Pressable>
      {expanded && (
        <View style={s.expandableBody}>
          {children}
        </View>
      )}
    </View>
  );
}

function ChevronIcon({ expanded, color }: { expanded: boolean; color: string }) {
  // Plain Text glyph rather than pulling in lucide's ChevronUp/Down just
  // for this one shell — matches EmptyNote's own "no icon dependency for
  // a one-off" precedent in this file.
  return <Text style={{ fontSize: 13, color, fontWeight: '700' }}>{expanded ? '︿' : '﹀'}</Text>;
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

  // KioskListRow — exact values from the Approvals panel's own row (the
  // mockup's .task-check/.task-coin/.task-action), promoted here once the
  // Recently Approved dispute cards needed the identical shape.
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  // Mockup's .task-check exactly: 22px, 6px radius, 2px border, no fill.
  listRowCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, flexShrink: 0,
  },
  listRowTitle: { fontSize: 14, fontWeight: '700' },
  listRowMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3,
  },
  listRowMeta: { fontSize: 11.5, fontWeight: '600' },
  listRowBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  listRowBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  listRowActions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  // Same neutral fill regardless of which action — the mockup's own
  // .task-action background never changes per action, only the LABEL
  // color does, so a destructive action isn't a red button, it's a
  // neutral button with red text.
  listRowActionBtn: {
    borderWidth: 1, borderRadius: 7,
    paddingHorizontal: 12, paddingVertical: 8,
    minHeight: 0,
  },
  listRowActionLabel: { fontSize: 11.5, fontWeight: '700' },
  expandableHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: KIOSK_SPACE.sm,
    // Matches WidgetCard's own `padded` convention (KIOSK_SPACE.md on both
    // axes) rather than the phone shell's one-off 16/15 — this card sits
    // beside other WidgetCard-built surfaces in the same lane and should
    // read as the same family of tile, not its own padding rhythm.
    padding: KIOSK_SPACE.md,
    minHeight: KIOSK_HIT.control,
  },
  expandableAccentBar: { width: 3, height: 26, borderRadius: 2, opacity: 0.85 },
  expandableBody: { paddingHorizontal: KIOSK_SPACE.md, paddingBottom: KIOSK_SPACE.md, paddingTop: 2 },
});
