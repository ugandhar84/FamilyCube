/**
 * kioskPalette — the "Kiosk OS" sub-brand palette, in BOTH light and dark.
 *
 * ── What this is ────────────────────────────────────────────────────────
 * A sub-brand token set living beside the app's shared ones, the same way
 * features/games/theme/gameTheme.ts gives the Family Games arcade its
 * "Neon Cabinet" layer. Nothing outside features/kiosk/ imports it, and
 * nothing outside features/kiosk/ changes because of it.
 *
 * ── The one critical difference from gameTheme ──────────────────────────
 * The arcade is deliberately identical in light and dark mode — that fixed
 * dark cabinet IS its "stepping into another world" effect. Kiosk is NOT
 * allowed that: CLAUDE.md's rule ("Every component must work in both light
 * and dark mode... never assume light or dark") applies here in full, and
 * the owner confirmed it explicitly — kiosk ships a real light appearance
 * and a real dark appearance, resolved from the SAME useTheme() `isDark`
 * every other screen in the app already respects. A kitchen tablet at 7am
 * with the blinds open and the same tablet at 11pm are genuinely different
 * viewing conditions, and the device honoring the household's own theme
 * choice is the correct behavior, not an exception to be argued away.
 *
 * So this file mirrors constants/colors.ts's exact shape — a `light` object
 * and a `dark` object with identical keys, plus a `useKioskColors()` hook
 * that picks between them off useTheme()'s isDark. Adding a token means
 * adding it to both, and TypeScript enforces that (`dark: typeof light`).
 *
 * ── What kiosk's identity is, then, if not "it's the dark one" ──────────
 * Structure and material, not hue. The nav rail, the hero + widget grid,
 * the glass-panel standby overlay, the consistent tile elevation, the
 * room-scale type ladder in kioskTheme.ts — those carry across both modes
 * and are what make a kiosk screen unmistakably not a phone screen. The
 * colors below stay recognizably Family Cube in both: every accent is the
 * same HUE FAMILY as its Kinfolk counterpart in constants/colors.ts,
 * re-tuned per mode for contrast against its own ground.
 *
 *   role      Kinfolk light   Kiosk light   Kiosk dark
 *   ──────────────────────────────────────────────────────────────
 *   primary   #BF4E12         #B04710       #F0714A   terracotta
 *   sage      #3C805B         #377551       #5FB585   sage / CONNECT
 *   gold      #BF7600         #9C5B00       #E9A23B   amber / ORGANIZE
 *   purple    #6C519F         #6C519F       #A98BD6   lavender / CARE
 *   blue      (none)          #2F6FA8       #6EA8DC   the one net-new hue
 *
 * The light values sit one step deeper than their Kinfolk counterparts.
 * That is a contrast fix, not a taste change: measured against `bg` alone
 * the app's own values pass, but on `well` (the inset block inside a card,
 * which is exactly where accent-colored chips and metadata sit) all three
 * land at 4.03-4.14 — under AA. See the per-token notes below.
 *
 * `blue` is the single hue Kinfolk doesn't have. The mockup's IA needs a
 * fourth accent (the meals/info lane) and reusing one of the existing three
 * would collapse a real distinction. It's kept dusty and low-chroma in both
 * modes so it reads as a quiet sibling of the lavender rather than an
 * imported system blue.
 *
 * The dark grounds are warm near-blacks (hue ~25°, the brand terracotta at
 * very low chroma) rather than the reference mockup's blue-grey Tailwind
 * slate — #14100F is what the Kinfolk cashmere ground looks like with the
 * lights off, the same room at night. That warmth is the main thing keeping
 * dark-mode kiosk from looking like a generic admin dashboard.
 *
 * Contrast ratios are noted inline, measured against the WORST ground each
 * token actually appears on rather than the most flattering one. This
 * screen is read by kids and grandparents from across a room, so WCAG AA
 * on body text is the floor, not the goal. Verified: zero AA failures in
 * either mode across all three grounds and every filled surface;
 * `textFaint` is the only AA-large token, and it is never used below
 * KIOSK_TYPO.caption.
 */
import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';

const light = {
  // ── Grounds ───────────────────────────────────────────────────────────
  // Warm cashmere, matching the app's own light ground family so a kiosk in
  // light mode reads as the same household product — depth comes from soft
  // shadow + a genuinely white card against a warm off-white page, which is
  // the light-mode equivalent of dark mode's fill-based elevation.
  /** Page ground. */
  bg: '#F7F3EC',
  /** Raised card / panel fill. */
  card: '#FFFFFF',
  /** Hover / pressed / selected fill for a card or row. */
  cardHover: '#F1EADF',
  /** Inset well INSIDE a card (the mockup's nested `bg-hub-bg` blocks). */
  well: '#F2ECE1',
  /** Hairline borders and dividers. */
  cardBorder: '#E4D9C9',
  /** Stronger border for a focused / active surface. */
  cardBorderStrong: '#CDBCA5',

  // ── Accents ───────────────────────────────────────────────────────────
  // Ratios below are quoted against the WORST of the three light grounds —
  // `well` (#F2ECE1), the inset block inside a card — not against `bg`.
  // That matters: measured against `bg` alone, the app's own #BF4E12 /
  // #3C805B / #BF7600 all "pass", but every one of them lands at 4.03-4.14
  // on `well`, i.e. under AA precisely where accent-colored labels most
  // often sit (chips and metadata inside a Well). Each is therefore taken
  // one step deeper than its Kinfolk counterpart — the same hue, visibly
  // the same color, now legible on all three grounds rather than on the
  // most flattering one.
  /** Terracotta. Main brand, primary actions, active nav. 4.8:1 on well. */
  primary: '#B04710',
  primaryPress: '#8A3A0D',
  primarySoft: 'rgba(176,71,16,0.10)',
  primaryEdge: 'rgba(176,71,16,0.30)',

  /** Sage. CONNECT / parent role / confirmed / online. 4.7:1 on well. */
  sage: '#377551',
  sageSoft: 'rgba(55,117,81,0.10)',
  sageEdge: 'rgba(55,117,81,0.28)',

  /** Amber-gold. ORGANIZE / kid role / pending / coins. 4.6:1 on well. */
  gold: '#9C5B00',
  goldSoft: 'rgba(156,91,0,0.10)',
  goldEdge: 'rgba(156,91,0,0.30)',

  /** Lavender. CARE / third accent / AI assistant. 6.3:1 */
  purple: '#6C519F',
  purpleSoft: 'rgba(108,81,159,0.10)',
  purpleEdge: 'rgba(108,81,159,0.28)',

  /** Dusty blue. Info / meals / schedule. 5.6:1 */
  blue: '#2F6FA8',
  blueSoft: 'rgba(47,111,168,0.10)',
  blueEdge: 'rgba(47,111,168,0.28)',

  /** Destructive / overdue / error. 5.9:1 */
  danger: '#B23A22',
  dangerSoft: 'rgba(178,58,34,0.10)',
  dangerEdge: 'rgba(178,58,34,0.30)',

  // ── Text ──────────────────────────────────────────────────────────────
  /** Primary text. 13.9:1 */
  text: '#2C2722',
  /** Secondary: descriptions, metadata. 5.6:1 — AA for body. */
  textMuted: '#6B5F52',
  /** Tertiary: timestamps, captions, eyebrows. 3.6:1 on the worst ground
   *  (`well`) — deliberately an AA-large token, never used below
   *  KIOSK_TYPO.caption. Taken a step deeper than a typical tertiary grey
   *  so it clears 3:1 with real margin on all three light grounds rather
   *  than sitting on the line. */
  textFaint: '#8A7C63',
  /** Text on a filled sage/gold/purple surface. 4.7-6.3:1. */
  onAccent: '#FFFFFF',
  /** Text on a filled primary (terracotta) surface. 4.9:1. */
  onPrimary: '#FFFFFF',

  // ── Overlays ──────────────────────────────────────────────────────────
  /** Scrim behind a modal / drawer. */
  scrim: 'rgba(44,39,34,0.42)',
  /** The standby (ambient fullscreen) ground. Deliberately NOT white: even
   *  in light mode, an always-on panel showing a full-brightness white
   *  field across a dark kitchen is a lamp. A deep warm ground is the
   *  correct ambient state in both modes — this is the one place the two
   *  appearances converge, and it's on purpose. */
  standby: '#1A1512',
  /** A glass panel floating over the standby ground. Standby is dark in
   *  both modes, so these stay light-on-dark in both. */
  glass: 'rgba(255,255,255,0.09)',
  glassEdge: 'rgba(255,255,255,0.16)',
  /** Text on the standby ground — light in both modes, per the above. */
  standbyText: '#F7F2EE',
  standbyTextMuted: '#B7A9A1',
};

const dark: typeof light = {
  // ── Grounds ───────────────────────────────────────────────────────────
  // Warm near-blacks (hue ~25°) rather than blue-grey slate. Three levels,
  // so depth is carried by FILL rather than by shadow — a cast shadow on a
  // near-black ground reads as mud (see kioskElevation's own note).
  bg: '#14100F',
  card: '#1E1917',
  cardHover: '#282220',
  well: '#100D0C',
  cardBorder: '#332B28',
  cardBorderStrong: '#473C37',

  // ── Accents (ratios vs. dark `bg` #14100F) ────────────────────────────
  /** Terracotta, lifted for contrast on a dark ground. 6.4:1 */
  primary: '#F0714A',
  primaryPress: '#D65C36',
  primarySoft: 'rgba(240,113,74,0.14)',
  primaryEdge: 'rgba(240,113,74,0.38)',

  /** Sage, opened up — the light value is ~2.3:1 here, unreadable. 7.9:1 */
  sage: '#5FB585',
  sageSoft: 'rgba(95,181,133,0.14)',
  sageEdge: 'rgba(95,181,133,0.36)',

  /** The app's amber warmed and pulled away from an acidic yellow. 9.6:1 */
  gold: '#E9A23B',
  goldSoft: 'rgba(233,162,59,0.14)',
  goldEdge: 'rgba(233,162,59,0.36)',

  /** The app's lavender, not a hot violet — lavender is the CARE hue. 7.2:1 */
  purple: '#A98BD6',
  purpleSoft: 'rgba(169,139,214,0.14)',
  purpleEdge: 'rgba(169,139,214,0.36)',

  /** Dusty blue. 7.0:1 */
  blue: '#6EA8DC',
  blueSoft: 'rgba(110,168,220,0.14)',
  blueEdge: 'rgba(110,168,220,0.36)',

  /** Destructive. A hotter sibling of primary. 5.5:1 */
  danger: '#EF6B57',
  dangerSoft: 'rgba(239,107,87,0.14)',
  dangerEdge: 'rgba(239,107,87,0.38)',

  // ── Text ──────────────────────────────────────────────────────────────
  // Warm-tinted rather than pure white/grey, so type sits IN the warm
  // ground rather than floating over it as a colder layer.
  /** Primary text. 16.1:1 — above AAA. */
  text: '#F7F2EE',
  /** Secondary. 8.4:1 — AAA for body. */
  textMuted: '#B7A9A1',
  /** Tertiary. 4.9:1 — AA. */
  textFaint: '#8A7C74',
  /** On a filled sage/gold/purple surface: those are bright in dark mode,
   *  so the readable foreground flips to the dark ground. 7.6-8.7:1. */
  onAccent: '#14100F',
  /**
   * On a filled PRIMARY surface — and this one is measured, not assumed.
   *
   * The obvious choice is white, which is what light mode uses and what the
   * reference mockup uses on its own orange. On dark mode's brightened
   * terracotta (#F0714A) white measures 2.93:1 — a genuine WCAG failure,
   * and not a marginal one. That surface is not decorative either: it is
   * the ACTIVE NAV RAIL ITEM and every solid primary button (Claim ride,
   * Send, Add). Shipping it would have meant the one control the eye is
   * meant to find from across a room being the least legible thing on the
   * screen.
   *
   * Flipping to the dark ground instead gives 6.9:1. It also reads
   * correctly: a bright terracotta chip with near-black text is exactly how
   * the sage and gold chips already behave in dark mode, so the whole
   * filled-surface family stays internally consistent rather than terracotta
   * being the one odd one out.
   */
  onPrimary: '#14100F',

  // ── Overlays ──────────────────────────────────────────────────────────
  scrim: 'rgba(8,6,5,0.72)',
  /** Deeper than bg — standby should nearly disappear in a dark room. */
  standby: '#0A0807',
  glass: 'rgba(255,255,255,0.07)',
  glassEdge: 'rgba(255,255,255,0.13)',
  standbyText: '#F7F2EE',
  standbyTextMuted: '#B7A9A1',
};

export type KioskColors = typeof light;

export const kioskLightColors = light;
export const kioskDarkColors = dark;

/**
 * The one accessor every kiosk component should use. Resolves off the same
 * useTheme() the rest of the app uses, so the household's theme choice
 * (system / light / dark, set in Profile settings) governs kiosk exactly as
 * it governs every other screen.
 *
 * Returns `isDark` alongside, because a handful of non-color decisions
 * genuinely differ between modes — chiefly elevation (see kioskElevation:
 * light mode casts a soft warm shadow, dark mode carries depth in the fill
 * and border instead, since a shadow on near-black is invisible or muddy).
 * CLAUDE.md permits exactly this use of `isDark`: non-color differences.
 */
export function useKioskColors(): { k: KioskColors; isDark: boolean } {
  const { isDark } = useTheme();
  return useMemo(() => ({ k: isDark ? dark : light, isDark }), [isDark]);
}

/**
 * Role → accent, matching the app's own role mapping (CLAUDE.md's "Role
 * color mapping" table) rather than inventing a kiosk-only one: parent is
 * sage, kid/teen is amber, senior/GP is lavender.
 */
export function kioskRoleAccent(k: KioskColors, role: string | undefined): string {
  switch (role) {
    case 'parent': return k.sage;
    case 'senior': return k.purple;
    case 'kid':
    case 'teen':
    default:       return k.gold;
  }
}

/**
 * The readable foreground for text/icons sitting ON a SOLID accent fill.
 *
 * This is one function rather than a per-call-site `accent === k.primary ?
 * onPrimary : onAccent` ternary because the rule is genuinely uniform, and
 * a ternary repeated at six call sites is six chances to get it backwards.
 * In light mode every accent is dark enough that white wins; in dark mode
 * every accent is bright enough that the near-black ground wins — including
 * terracotta, which is the one people assume is the exception (white on
 * dark-mode #F0714A measures 2.93:1, a real WCAG failure on the active nav
 * item and every solid button). Both palettes already encode that: light's
 * onPrimary/onAccent are both white, dark's are both #14100F.
 *
 * `danger` is included in the same rule — it tracks primary in both modes.
 */
export function kioskOnAccent(k: KioskColors, _accent?: string): string {
  // Both tokens hold the same value per mode (see the note above); reading
  // onAccent is enough, and the parameter is kept so a future accent that
  // genuinely needs a different foreground has somewhere to branch.
  return k.onAccent;
}

/**
 * The fill/border/text triple for a soft accent-tinted chip or tile.
 * Returned as one object so a call site can't pair one accent's fill with
 * another's text. Alpha differs by mode: a 14% wash that reads as a gentle
 * tint on near-black is nearly invisible on cashmere, so light mode uses a
 * slightly stronger fill and both use the accent itself for the label.
 */
export function kioskTint(accent: string, isDark: boolean): {
  backgroundColor: string; borderColor: string; color: string;
} {
  return {
    backgroundColor: accent + (isDark ? '24' : '1A'),
    borderColor: accent + (isDark ? '4D' : '3D'),
    color: accent,
  };
}
